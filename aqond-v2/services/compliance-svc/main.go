// compliance-svc implements Epoch 8 Pillar C: data residency, DSR, consent,
// KYC/KYB, AML/sanctions, age/parental controls, returns and retention
// (P122-P128, P131, P138).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
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
	mDSR     atomic.Int64
	mConsent atomic.Int64
	mKYC     atomic.Int64
	mAMLHit  atomic.Int64
	mReturns atomic.Int64
)

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
	mux.HandleFunc("/v1/residency/check", a.residencyCheck) // P122
	mux.HandleFunc("/v1/dsr", a.dsr)                         // P123
	mux.HandleFunc("/v1/dsr/advance", a.dsrAdvance)          // P123
	mux.HandleFunc("/v1/consent", a.consent)                 // P124
	mux.HandleFunc("/v1/kyc", a.kyc)                         // P125
	mux.HandleFunc("/v1/kyc/decide", a.kycDecide)            // P125
	mux.HandleFunc("/v1/aml/screen", a.amlScreen)            // P126
	mux.HandleFunc("/v1/age", a.age)                         // P127
	mux.HandleFunc("/v1/parental/link", a.parental)          // P128
	mux.HandleFunc("/v1/returns", a.returns)                 // P131
	mux.HandleFunc("/v1/returns/decide", a.returnsDecide)    // P131
	mux.HandleFunc("/v1/retention", a.retention)             // P138
	mux.HandleFunc("/v1/treasury/positions", a.treasuryPositions) // P136
	mux.HandleFunc("/v1/treasury/reconcile", a.treasuryReconcile) // P136

	port := config.Int("PORT", 8129)
	log.Printf("compliance-svc :%d p122-p138", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "compliance-svc", "p122_p138": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_dsr_total %d\n", mDSR.Load())
	fmt.Fprintf(w, "aqond_consent_total %d\n", mConsent.Load())
	fmt.Fprintf(w, "aqond_kyc_total %d\n", mKYC.Load())
	fmt.Fprintf(w, "aqond_aml_hit_total %d\n", mAMLHit.Load())
	fmt.Fprintf(w, "aqond_returns_total %d\n", mReturns.Load())
}

// P122: where must this region's data live + cross-border allowed?
func (a *app) residencyCheck(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Region      string `json:"region"`
		Operation   string `json:"operation"` // read | write | transfer
		FromRegion  string `json:"from_region"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	ctx := r.Context()
	var storeIn string
	var piiLocalized, crossBorder bool
	err := a.pool.QueryRow(ctx, `
		SELECT store_in, pii_localized, cross_border_allowed FROM commerce.residency_policies WHERE region=$1`,
		body.Region).Scan(&storeIn, &piiLocalized, &crossBorder)
	if err != nil {
		http.Error(w, "no residency policy for region", http.StatusNotFound)
		return
	}
	allowed := true
	reason := "ok"
	if body.Operation == "transfer" && !crossBorder {
		allowed = false
		reason = "cross-border transfer not allowed for region"
	}
	if body.FromRegion != "" && !strings.EqualFold(body.FromRegion, body.Region) && piiLocalized && body.Operation == "write" {
		allowed = false
		reason = "writes must occur in home region (pii localized)"
	}
	jsonOK(w, map[string]any{
		"region": body.Region, "store_in": storeIn, "pii_localized": piiLocalized,
		"cross_border_allowed": crossBorder, "allowed": allowed, "reason": reason,
	})
}

// P123: data subject requests.
func (a *app) dsr(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		id := r.URL.Query().Get("id")
		sub := r.URL.Query().Get("subject_id")
		if id != "" {
			var subject, region, kind, status string
			err := a.pool.QueryRow(ctx, `
				SELECT subject_id, region, kind, status FROM commerce.dsr_requests WHERE id=$1`, id).
				Scan(&subject, &region, &kind, &status)
			if err != nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			jsonOK(w, map[string]any{"id": id, "subject_id": subject, "region": region, "kind": kind, "status": status})
			return
		}
		if sub == "" {
			http.Error(w, "id or subject_id required", http.StatusBadRequest)
			return
		}
		rows, err := a.pool.Query(ctx, `
			SELECT id, kind, status, due_at FROM commerce.dsr_requests WHERE subject_id=$1 ORDER BY created_at DESC`, sub)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		var out []map[string]any
		for rows.Next() {
			var id, kind, status string
			var due any
			if rows.Scan(&id, &kind, &status, &due) == nil {
				out = append(out, map[string]any{"id": id, "kind": kind, "status": status, "due_at": due})
			}
		}
		jsonOK(w, map[string]any{"subject_id": sub, "requests": out})
		return
	}

	var body struct {
		SubjectID string `json:"subject_id"`
		Region    string `json:"region"`
		Kind      string `json:"kind"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.SubjectID == "" || body.Kind == "" {
		http.Error(w, "subject_id and kind required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	id := ulid.New()
	sk := a.router.ShardKey(body.SubjectID)
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.dsr_requests (id, subject_id, region, kind) VALUES ($1,$2,$3,$4)`,
		id, body.SubjectID, body.Region, body.Kind)
	if err != nil {
		httpErr(w, err)
		return
	}
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "dsr", AggregateID: id, EventType: "dsr.received", ShardKey: sk,
		Payload: map[string]any{"subject_id": body.SubjectID, "kind": body.Kind, "region": body.Region},
	})
	mDSR.Add(1)
	jsonOK(w, map[string]any{"dsr_id": id, "status": "received", "kind": body.Kind})
}

func (a *app) dsrAdvance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID        string `json:"id"`
		Status    string `json:"status"`
		ResultURI string `json:"result_uri"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tag, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.dsr_requests SET status=$2, result_uri=COALESCE(NULLIF($3,''),result_uri), updated_at=NOW() WHERE id=$1`,
		body.ID, body.Status, body.ResultURI)
	if err != nil {
		httpErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"id": body.ID, "status": body.Status})
}

// P124: consent ledger.
func (a *app) consent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		sub := r.URL.Query().Get("subject_id")
		purpose := r.URL.Query().Get("purpose")
		if sub == "" {
			http.Error(w, "subject_id required", http.StatusBadRequest)
			return
		}
		// current state = latest record per purpose
		rows, err := a.pool.Query(ctx, `
			SELECT DISTINCT ON (purpose) purpose, granted, version, created_at
			FROM commerce.consents WHERE subject_id=$1 AND ($2='' OR purpose=$2)
			ORDER BY purpose, created_at DESC`, sub, purpose)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		out := map[string]any{}
		for rows.Next() {
			var p, ver string
			var granted bool
			var created any
			if rows.Scan(&p, &granted, &ver, &created) == nil {
				out[p] = map[string]any{"granted": granted, "version": ver, "at": created}
			}
		}
		jsonOK(w, map[string]any{"subject_id": sub, "consents": out})
		return
	}
	var body struct {
		SubjectID string `json:"subject_id"`
		Region    string `json:"region"`
		Purpose   string `json:"purpose"`
		Granted   bool   `json:"granted"`
		Version   string `json:"version"`
		Source    string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.SubjectID == "" || body.Purpose == "" {
		http.Error(w, "subject_id and purpose required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	if body.Version == "" {
		body.Version = "v1"
	}
	if body.Source == "" {
		body.Source = "app"
	}
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.consents (id, subject_id, region, purpose, granted, version, source)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, body.SubjectID, body.Region, body.Purpose, body.Granted, body.Version, body.Source)
	if err != nil {
		httpErr(w, err)
		return
	}
	mConsent.Add(1)
	jsonOK(w, map[string]any{"consent_id": id, "purpose": body.Purpose, "granted": body.Granted})
}

// P125: KYC / KYB submission + lookup.
func (a *app) kyc(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		sub := r.URL.Query().Get("subject_id")
		if sub == "" {
			http.Error(w, "subject_id required", http.StatusBadRequest)
			return
		}
		var id, stype, status, level string
		var risk int
		err := a.pool.QueryRow(ctx, `
			SELECT id, subject_type, status, level, risk_score FROM commerce.kyc_verifications
			WHERE subject_id=$1 ORDER BY created_at DESC LIMIT 1`, sub).
			Scan(&id, &stype, &status, &level, &risk)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"id": id, "subject_id": sub, "subject_type": stype, "status": status, "level": level, "risk_score": risk})
		return
	}
	var body struct {
		SubjectID   string `json:"subject_id"`
		SubjectType string `json:"subject_type"`
		Region      string `json:"region"`
		Level       string `json:"level"`
		DocType     string `json:"doc_type"`
		Name        string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.SubjectID == "" {
		http.Error(w, "subject_id required", http.StatusBadRequest)
		return
	}
	if body.SubjectType == "" {
		body.SubjectType = "individual"
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	if body.Level == "" {
		body.Level = "basic"
	}
	// auto-screen against sanctions on submit (P126 linkage)
	risk, amlDecision := sanctionScore(body.Name)
	status := "review"
	if amlDecision == "clear" && body.DocType != "" {
		status = "verified"
	}
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.kyc_verifications (id, subject_id, subject_type, region, level, status, doc_type, risk_score,
			verified_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6='verified' THEN NOW() ELSE NULL END,
			CASE WHEN $6='verified' THEN NOW() + INTERVAL '365 days' ELSE NULL END)`,
		id, body.SubjectID, body.SubjectType, body.Region, body.Level, status, body.DocType, risk)
	if err != nil {
		httpErr(w, err)
		return
	}
	mKYC.Add(1)
	jsonOK(w, map[string]any{"kyc_id": id, "status": status, "risk_score": risk, "aml_decision": amlDecision})
}

func (a *app) kycDecide(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tag, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.kyc_verifications
		SET status=$2, updated_at=NOW(),
			verified_at = CASE WHEN $2='verified' THEN NOW() ELSE verified_at END,
			expires_at = CASE WHEN $2='verified' THEN NOW() + INTERVAL '365 days' ELSE expires_at END
		WHERE id=$1`, body.ID, body.Status)
	if err != nil {
		httpErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"id": body.ID, "status": body.Status})
}

// P126: AML / sanctions screening.
func (a *app) amlScreen(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SubjectID string `json:"subject_id"`
		Region    string `json:"region"`
		Name      string `json:"name"`
		ListType  string `json:"list_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.ListType == "" {
		body.ListType = "sanctions"
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	score, decision := sanctionScore(body.Name)
	matched := decision != "clear"
	id := ulid.New()
	details, _ := json.Marshal(map[string]any{"name": body.Name, "list": body.ListType})
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.aml_screenings (id, subject_id, region, list_type, matched, match_score, decision, details)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		id, body.SubjectID, body.Region, body.ListType, matched, score, decision, details)
	if err != nil {
		httpErr(w, err)
		return
	}
	if matched {
		mAMLHit.Add(1)
	}
	jsonOK(w, map[string]any{"screening_id": id, "matched": matched, "match_score": score, "decision": decision})
}

// P127: age verification.
func (a *app) age(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		sub := r.URL.Query().Get("subject_id")
		if sub == "" {
			http.Error(w, "subject_id required", http.StatusBadRequest)
			return
		}
		var band, method string
		var verified bool
		var birthYear int
		err := a.pool.QueryRow(ctx, `
			SELECT age_band, method, verified, COALESCE(birth_year,0) FROM commerce.age_verifications WHERE subject_id=$1`, sub).
			Scan(&band, &method, &verified, &birthYear)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"subject_id": sub, "age_band": band, "verified": verified, "method": method, "birth_year": birthYear})
		return
	}
	var body struct {
		SubjectID string `json:"subject_id"`
		Region    string `json:"region"`
		BirthYear int    `json:"birth_year"`
		Method    string `json:"method"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.SubjectID == "" || body.BirthYear == 0 {
		http.Error(w, "subject_id and birth_year required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	if body.Method == "" {
		body.Method = "self_declared"
	}
	band := ageBand(body.BirthYear)
	verified := body.Method != "self_declared"
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.age_verifications (subject_id, region, birth_year, age_band, verified, method)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (subject_id) DO UPDATE SET region=EXCLUDED.region, birth_year=EXCLUDED.birth_year,
			age_band=EXCLUDED.age_band, verified=EXCLUDED.verified, method=EXCLUDED.method, updated_at=NOW()`,
		body.SubjectID, body.Region, body.BirthYear, band, verified, body.Method)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"subject_id": body.SubjectID, "age_band": band, "verified": verified})
}

// P128: parental link + spend cap.
func (a *app) parental(w http.ResponseWriter, r *http.Request) {
	var body struct {
		GuardianID    string `json:"guardian_id"`
		MinorID       string `json:"minor_id"`
		Region        string `json:"region"`
		SpendCapMicro int64  `json:"spend_cap_micro"`
		Approved      bool   `json:"approved"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.GuardianID == "" || body.MinorID == "" {
		http.Error(w, "guardian_id and minor_id required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.parental_links (id, guardian_id, minor_id, region, spend_cap_micro, approved)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (guardian_id, minor_id) DO UPDATE SET
			spend_cap_micro=EXCLUDED.spend_cap_micro, approved=EXCLUDED.approved`,
		id, body.GuardianID, body.MinorID, body.Region, body.SpendCapMicro, body.Approved)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"guardian_id": body.GuardianID, "minor_id": body.MinorID, "approved": body.Approved})
}

// P131: returns / RMA with statutory window check.
func (a *app) returns(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OrderID     string `json:"order_id"`
		BuyerID     string `json:"buyer_id"`
		MerchantID  string `json:"merchant_id"`
		Region      string `json:"region"`
		Reason      string `json:"reason"`
		AmountMicro int64  `json:"amount_micro"`
		DaysSince   int    `json:"days_since_delivery"`
		CrossBorder bool   `json:"cross_border"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.BuyerID == "" {
		http.Error(w, "order_id and buyer_id required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	ctx := r.Context()
	windowDays := 7
	_ = a.pool.QueryRow(ctx, `SELECT window_days FROM commerce.return_policies WHERE market=$1`, body.Region).Scan(&windowDays)
	within := body.DaysSince <= windowDays
	id := ulid.New()
	sk := a.router.ShardKey(body.MerchantID)
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.returns_rma (id, order_id, buyer_id, merchant_id, shard_key, region, reason, amount_micro, within_window, cross_border)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, body.OrderID, body.BuyerID, body.MerchantID, sk, body.Region, body.Reason, body.AmountMicro, within, body.CrossBorder)
	if err != nil {
		httpErr(w, err)
		return
	}
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "return", AggregateID: id, EventType: "return.requested", ShardKey: sk,
		Payload: map[string]any{"order_id": body.OrderID, "within_window": within, "amount_micro": body.AmountMicro},
	})
	mReturns.Add(1)
	jsonOK(w, map[string]any{"return_id": id, "within_window": within, "window_days": windowDays, "status": "requested"})
}

func (a *app) returnsDecide(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		IntentID string `json:"intent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.returns_rma SET status=$2, intent_id=COALESCE(NULLIF($3,''),intent_id), updated_at=NOW() WHERE id=$1`,
		body.ID, body.Status, body.IntentID)
	if err != nil {
		httpErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if body.Status == "refunded" {
		var sk, orderID string
		_ = a.pool.QueryRow(ctx, `SELECT shard_key, order_id FROM commerce.returns_rma WHERE id=$1`, body.ID).Scan(&sk, &orderID)
		_ = outbox.Insert(ctx, a.pool, outbox.Event{
			AggregateType: "return", AggregateID: body.ID, EventType: "return.refunded", ShardKey: sk,
			Payload: map[string]any{"order_id": orderID, "intent_id": body.IntentID},
		})
	}
	jsonOK(w, map[string]any{"id": body.ID, "status": body.Status})
}

// P138: retention policies (read-only registry view).
func (a *app) retention(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(), `
		SELECT data_class, retain_days, legal_hold, region FROM commerce.retention_policies ORDER BY data_class`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var dc, region string
		var days int
		var hold bool
		if rows.Scan(&dc, &days, &hold, &region) == nil {
			out = append(out, map[string]any{"data_class": dc, "retain_days": days, "legal_hold": hold, "region": region})
		}
	}
	jsonOK(w, map[string]any{"policies": out})
}

// sanctionScore is a deterministic stub sanctions/PEP matcher (P126).
func sanctionScore(name string) (int, string) {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return 0, "clear"
	}
	for _, bad := range sanctionList {
		if strings.Contains(n, bad) {
			return 95, "block"
		}
	}
	for _, pep := range pepList {
		if strings.Contains(n, pep) {
			return 60, "review"
		}
	}
	return 5, "clear"
}

var sanctionList = []string{"sanctioned person", "blocked entity", "ofac-test"}
var pepList = []string{"minister", "senator", "politician-test"}

func ageBand(birthYear int) string {
	const now = 2026
	age := now - birthYear
	switch {
	case age < 13:
		return "under13"
	case age < 18:
		return "13to17"
	default:
		return "adult"
	}
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
