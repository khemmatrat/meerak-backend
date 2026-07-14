// coupon-svc implements Epoch 11 P202: EXP-COUPON collect, wallet, validate.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	region *region.Router
}

var (
	mCollect atomic.Int64
	mValidate atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, region: region.NewRouter()}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/coupons/catalog", a.catalog)
	mux.HandleFunc("/v1/coupons/wallet", a.wallet)
	mux.HandleFunc("/v1/coupons/collect", a.collect)
	mux.HandleFunc("/v1/coupons/validate", a.validate)
	mux.HandleFunc("/v1/coupons/validate-stack", a.validateStack)

	port := config.Int("PORT", 8137)
	log.Printf("coupon-svc :%d p202", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "coupon-svc", "p202": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_coupon_collect_total %d\n", mCollect.Load())
	fmt.Fprintf(w, "aqond_coupon_validate_total %d\n", mValidate.Load())
}

func (a *app) catalog(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT code, kind, value_bps, value_micro, min_subtotal_micro, expires_at
		FROM commerce.coupons
		WHERE active=TRUE AND (region='*' OR region=$1)
		  AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY code`, reg)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var code, kind string
		var bps int
		var micro, min int64
		var exp *time.Time
		if rows.Scan(&code, &kind, &bps, &micro, &min, &exp) == nil {
			out = append(out, map[string]any{"code": code, "kind": kind, "value_bps": bps, "value_micro": micro, "min_subtotal_micro": min, "expires_at": exp})
		}
	}
	jsonOK(w, map[string]any{"coupons": out})
}

func (a *app) wallet(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT uc.code, c.kind, c.value_bps, c.value_micro, uc.collected_at, uc.used_at
		FROM commerce.user_coupons uc
		JOIN commerce.coupons c ON c.code = uc.code
		WHERE uc.user_id=$1 ORDER BY uc.collected_at DESC`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var code, kind string
		var bps int
		var micro int64
		var collected, used any
		if rows.Scan(&code, &kind, &bps, &micro, &collected, &used) == nil {
			out = append(out, map[string]any{"code": code, "kind": kind, "value_bps": bps, "value_micro": micro, "collected_at": collected, "used": used != nil})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "coupons": out})
}

func (a *app) collect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID string `json:"user_id"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" || body.Code == "" {
		http.Error(w, "user_id and code required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var active bool
	err := a.pool.QueryRow(ctx, `SELECT active FROM commerce.coupons WHERE code=$1`, body.Code).Scan(&active)
	if err != nil || !active {
		http.Error(w, "invalid_coupon", http.StatusBadRequest)
		return
	}
	id := ulid.New()
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.user_coupons (id, user_id, code) VALUES ($1,$2,$3)
		ON CONFLICT (user_id, code) DO NOTHING`, id, body.UserID, body.Code)
	if err != nil {
		httpErr(w, err)
		return
	}
	mCollect.Add(1)
	jsonOK(w, map[string]any{"collected": true, "code": body.Code})
}

func (a *app) validate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID         string `json:"user_id"`
		Code           string `json:"code"`
		SubtotalMicro  int64  `json:"subtotal_micro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	reg := a.region.FromRequest(r)
	ctx := r.Context()
	var kind string
	var bps int
	var micro, min int64
	var active bool
	var exp *time.Time
	err := a.pool.QueryRow(ctx, `
		SELECT kind, value_bps, value_micro, min_subtotal_micro, active, expires_at
		FROM commerce.coupons WHERE code=$1 AND (region='*' OR region=$2)`, body.Code, reg).
		Scan(&kind, &bps, &micro, &min, &active, &exp)
	if err != nil || !active || (exp != nil && exp.Before(time.Now())) {
		jsonOK(w, map[string]any{"valid": false, "reason": "invalid_or_expired"})
		return
	}
	if body.SubtotalMicro < min {
		jsonOK(w, map[string]any{"valid": false, "reason": "min_subtotal", "min_subtotal_micro": min})
		return
	}
	discount := micro
	if kind == "percent" {
		discount = body.SubtotalMicro * int64(bps) / 10000
	}
	mValidate.Add(1)
	jsonOK(w, map[string]any{"valid": true, "code": body.Code, "kind": kind, "discount_micro": discount})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
