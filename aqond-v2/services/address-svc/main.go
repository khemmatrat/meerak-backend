// address-svc implements Epoch 8 Pillar B: international address validation,
// normalization and storage with per-country format rules (P121).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
	region *region.Router
}

var (
	mValidate atomic.Int64
	mInvalid  atomic.Int64
	mStored   atomic.Int64
)

// per-country address format rules (P121).
type countryRule struct {
	PostalRe   *regexp.Regexp
	StateReq   bool
	PostalReq  bool
}

var rules = map[string]countryRule{
	"TH": {PostalRe: regexp.MustCompile(`^\d{5}$`), StateReq: false, PostalReq: true},
	"US": {PostalRe: regexp.MustCompile(`^\d{5}(-\d{4})?$`), StateReq: true, PostalReq: true},
	"SG": {PostalRe: regexp.MustCompile(`^\d{6}$`), StateReq: false, PostalReq: true},
	"DE": {PostalRe: regexp.MustCompile(`^\d{5}$`), StateReq: false, PostalReq: true},
	"GB": {PostalRe: regexp.MustCompile(`(?i)^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$`), StateReq: false, PostalReq: true},
}

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, router: shard.NewRouter(config.Int("SHARD_COUNT", 1)), region: region.NewRouter()}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/address/validate", a.validate)
	mux.HandleFunc("/v1/address", a.address)
	mux.HandleFunc("/v1/address/", a.addressByID)

	port := config.Int("PORT", 8128)
	log.Printf("address-svc :%d p121", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "address-svc", "p121": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_address_validate_total %d\n", mValidate.Load())
	fmt.Fprintf(w, "aqond_address_invalid_total %d\n", mInvalid.Load())
	fmt.Fprintf(w, "aqond_address_stored_total %d\n", mStored.Load())
}

type addressInput struct {
	OwnerID   string `json:"owner_id"`
	Region    string `json:"region"`
	Country   string `json:"country"`
	Recipient string `json:"recipient"`
	Line1     string `json:"line1"`
	Line2     string `json:"line2"`
	City      string `json:"city"`
	State     string `json:"state"`
	Postal    string `json:"postal_code"`
	Phone     string `json:"phone"`
	IsDefault bool   `json:"is_default"`
}

func (in *addressInput) normalize() {
	in.Country = strings.ToUpper(strings.TrimSpace(in.Country))
	in.Postal = strings.ToUpper(strings.TrimSpace(in.Postal))
	in.City = strings.TrimSpace(in.City)
	in.State = strings.TrimSpace(in.State)
	in.Recipient = strings.TrimSpace(in.Recipient)
	in.Line1 = strings.TrimSpace(in.Line1)
	in.Phone = strings.ReplaceAll(strings.TrimSpace(in.Phone), " ", "")
}

func validateAddr(in addressInput) []string {
	var errs []string
	if in.Recipient == "" {
		errs = append(errs, "recipient required")
	}
	if in.Line1 == "" {
		errs = append(errs, "line1 required")
	}
	if in.City == "" {
		errs = append(errs, "city required")
	}
	rule, ok := rules[in.Country]
	if !ok {
		// unknown country: lenient (just require postal present)
		if in.Postal == "" {
			errs = append(errs, "postal_code required")
		}
		return errs
	}
	if rule.PostalReq && in.Postal == "" {
		errs = append(errs, "postal_code required")
	} else if in.Postal != "" && rule.PostalRe != nil && !rule.PostalRe.MatchString(in.Postal) {
		errs = append(errs, fmt.Sprintf("postal_code invalid for %s", in.Country))
	}
	if rule.StateReq && in.State == "" {
		errs = append(errs, "state required")
	}
	return errs
}

// P121: validate + normalize without storing.
func (a *app) validate(w http.ResponseWriter, r *http.Request) {
	var in addressInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.Country == "" {
		in.Country = a.region.FromRequest(r)
	}
	in.normalize()
	errs := validateAddr(in)
	mValidate.Add(1)
	if len(errs) > 0 {
		mInvalid.Add(1)
	}
	jsonOK(w, map[string]any{"valid": len(errs) == 0, "errors": errs, "normalized": in})
}

// P121: create / list addresses.
func (a *app) address(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		owner := r.URL.Query().Get("owner_id")
		if owner == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		rows, err := a.pool.Query(ctx, `
			SELECT id, country, recipient, line1, line2, city, state, postal_code, phone, is_default, normalized
			FROM commerce.addresses WHERE owner_id=$1 ORDER BY is_default DESC, created_at DESC`, owner)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		var out []map[string]any
		for rows.Next() {
			var id, country, recipient, l1, l2, city, state, postal, phone string
			var def, norm bool
			if rows.Scan(&id, &country, &recipient, &l1, &l2, &city, &state, &postal, &phone, &def, &norm) == nil {
				out = append(out, map[string]any{
					"id": id, "country": country, "recipient": recipient, "line1": l1, "line2": l2,
					"city": city, "state": state, "postal_code": postal, "phone": phone,
					"is_default": def, "normalized": norm,
				})
			}
		}
		jsonOK(w, map[string]any{"owner_id": owner, "addresses": out})
	case http.MethodPost:
		var in addressInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if in.Country == "" {
			in.Country = a.region.FromRequest(r)
		}
		if in.Region == "" {
			in.Region = a.region.FromRequest(r)
		}
		in.normalize()
		errs := validateAddr(in)
		mValidate.Add(1)
		if len(errs) > 0 {
			mInvalid.Add(1)
			w.WriteHeader(http.StatusUnprocessableEntity)
			jsonOK(w, map[string]any{"valid": false, "errors": errs})
			return
		}
		if in.OwnerID == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		id := ulid.New()
		sk := a.router.ShardKey(in.OwnerID)
		if in.IsDefault {
			_, _ = a.pool.Exec(ctx, `UPDATE commerce.addresses SET is_default=FALSE WHERE owner_id=$1`, in.OwnerID)
		}
		_, err := a.pool.Exec(ctx, `
			INSERT INTO commerce.addresses
				(id, owner_id, shard_key, region, country, recipient, line1, line2, city, state, postal_code, phone, is_default, normalized)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE)`,
			id, in.OwnerID, sk, in.Region, in.Country, in.Recipient, in.Line1, in.Line2, in.City, in.State, in.Postal, in.Phone, in.IsDefault)
		if err != nil {
			httpErr(w, err)
			return
		}
		mStored.Add(1)
		jsonOK(w, map[string]any{"address_id": id, "valid": true, "normalized": in})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// PATCH/DELETE /v1/address/{id}
func (a *app) addressByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := strings.TrimPrefix(r.URL.Path, "/v1/address/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, "address id required", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		owner := r.URL.Query().Get("owner_id")
		if owner == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		var country, recipient, l1, l2, city, state, postal, phone string
		var def, norm bool
		err := a.pool.QueryRow(ctx, `
			SELECT country, recipient, line1, line2, city, state, postal_code, phone, is_default, normalized
			FROM commerce.addresses WHERE id=$1 AND owner_id=$2`, id, owner).Scan(
			&country, &recipient, &l1, &l2, &city, &state, &postal, &phone, &def, &norm)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{
			"id": id, "owner_id": owner, "country": country, "recipient": recipient, "line1": l1, "line2": l2,
			"city": city, "state": state, "postal_code": postal, "phone": phone,
			"is_default": def, "normalized": norm,
		})
	case http.MethodPatch, http.MethodPut:
		var in addressInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.normalize()
		errs := validateAddr(in)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			jsonOK(w, map[string]any{"valid": false, "errors": errs})
			return
		}
		if in.IsDefault && in.OwnerID != "" {
			_, _ = a.pool.Exec(ctx, `UPDATE commerce.addresses SET is_default=FALSE WHERE owner_id=$1`, in.OwnerID)
		}
		tag, err := a.pool.Exec(ctx, `
			UPDATE commerce.addresses SET
				country=$2, recipient=$3, line1=$4, line2=$5, city=$6, state=$7,
				postal_code=$8, phone=$9, is_default=$10, normalized=TRUE
			WHERE id=$1 AND owner_id=$11`,
			id, in.Country, in.Recipient, in.Line1, in.Line2, in.City, in.State, in.Postal, in.Phone, in.IsDefault, in.OwnerID)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"address_id": id, "updated": true})
	case http.MethodDelete:
		owner := r.URL.Query().Get("owner_id")
		if owner == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		tag, err := a.pool.Exec(ctx, `DELETE FROM commerce.addresses WHERE id=$1 AND owner_id=$2`, id, owner)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"deleted": true, "address_id": id})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
