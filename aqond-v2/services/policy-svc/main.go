// policy-svc implements Epoch 8 Pillar C: region-aware feature flags / policy
// engine, legal-document CMS + acceptance, regional payment-method routing and
// compliance reporting register (P129, P130, P132, P139).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

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
	mFlagEval   atomic.Int64
	mPolicyEval atomic.Int64
	mAccept     atomic.Int64
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
	mux.HandleFunc("/v1/flags", a.flags)               // P129
	mux.HandleFunc("/v1/flags/eval", a.flagEval)       // P129
	mux.HandleFunc("/v1/policy/eval", a.policyEval)    // P129
	mux.HandleFunc("/v1/legal", a.legal)               // P130
	mux.HandleFunc("/v1/legal/accept", a.legalAccept)  // P130
	mux.HandleFunc("/v1/payment-methods", a.payMethods) // P132
	mux.HandleFunc("/v1/reports", a.reports)           // P139

	port := config.Int("PORT", 8130)
	log.Printf("policy-svc :%d p129-p139", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "policy-svc", "p129_p139": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_flag_eval_total %d\n", mFlagEval.Load())
	fmt.Fprintf(w, "aqond_policy_eval_total %d\n", mPolicyEval.Load())
	fmt.Fprintf(w, "aqond_legal_accept_total %d\n", mAccept.Load())
}

// P129: list resolved flags for a region (region-specific overrides '*').
func (a *app) flags(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT DISTINCT ON (key) key, enabled, rollout_pct, region
		FROM commerce.feature_flags WHERE region IN ('*', $1)
		ORDER BY key, (region <> '*') DESC`, reg)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var key, fregion string
		var enabled bool
		var pct int
		if rows.Scan(&key, &enabled, &pct, &fregion) == nil {
			out[key] = map[string]any{"enabled": enabled, "rollout_pct": pct, "scope": fregion}
		}
	}
	jsonOK(w, map[string]any{"region": reg, "flags": out})
}

// P129: evaluate a flag for a subject using stable rollout bucketing.
func (a *app) flagEval(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	subject := r.URL.Query().Get("subject_id")
	reg := a.region.FromRequest(r)
	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}
	var enabled bool
	var pct int
	err := a.pool.QueryRow(r.Context(), `
		SELECT enabled, rollout_pct FROM commerce.feature_flags
		WHERE key=$1 AND region IN ('*',$2) ORDER BY (region <> '*') DESC LIMIT 1`, key, reg).
		Scan(&enabled, &pct)
	if err != nil {
		jsonOK(w, map[string]any{"key": key, "region": reg, "on": false, "reason": "undefined"})
		return
	}
	on := enabled && bucket(key+":"+subject) < pct
	if enabled && pct >= 100 {
		on = true
	}
	mFlagEval.Add(1)
	jsonOK(w, map[string]any{"key": key, "region": reg, "on": on, "rollout_pct": pct, "enabled": enabled})
}

// P129: evaluate ordered policy rules for a domain + region.
func (a *app) policyEval(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Domain string         `json:"domain"`
		Region string         `json:"region"`
		Attrs  map[string]any `json:"attrs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, effect, condition, priority FROM commerce.policy_rules
		WHERE domain=$1 AND region IN ('*',$2) AND enabled
		ORDER BY priority ASC`, body.Domain, body.Region)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	decision := "allow"
	var matchedRule string
	var requirements []string
	for rows.Next() {
		var id, effect string
		var cond map[string]any
		var prio int
		if rows.Scan(&id, &effect, &cond, &prio) != nil {
			continue
		}
		if !condMatch(cond, body.Attrs) {
			continue
		}
		switch effect {
		case "deny":
			decision = "deny"
			matchedRule = id
			rows.Close()
			mPolicyEval.Add(1)
			jsonOK(w, map[string]any{"domain": body.Domain, "region": body.Region, "decision": decision, "matched_rule": matchedRule})
			return
		case "require":
			requirements = append(requirements, id)
		case "allow":
			matchedRule = id
		}
	}
	mPolicyEval.Add(1)
	jsonOK(w, map[string]any{
		"domain": body.Domain, "region": body.Region, "decision": decision,
		"matched_rule": matchedRule, "requirements": requirements,
	})
}

// P130: fetch active legal document.
func (a *app) legal(w http.ResponseWriter, r *http.Request) {
	docType := r.URL.Query().Get("doc_type")
	reg := a.region.FromRequest(r)
	locale := r.URL.Query().Get("locale")
	if docType == "" {
		http.Error(w, "doc_type required", http.StatusBadRequest)
		return
	}
	if locale == "" {
		locale = "th-TH"
	}
	var id, version, bodyURI, scope string
	err := a.pool.QueryRow(r.Context(), `
		SELECT id, version, body_uri, region FROM commerce.legal_documents
		WHERE doc_type=$1 AND region IN ('*',$2) AND active AND (locale=$3 OR locale='th-TH')
		ORDER BY (region <> '*') DESC, (locale=$3) DESC, effective_at DESC LIMIT 1`,
		docType, reg, locale).Scan(&id, &version, &bodyURI, &scope)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"id": id, "doc_type": docType, "region": reg, "locale": locale, "version": version, "body_uri": bodyURI, "scope": scope})
}

// P130: record acceptance of a legal document.
func (a *app) legalAccept(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SubjectID string `json:"subject_id"`
		DocID     string `json:"doc_id"`
		DocType   string `json:"doc_type"`
		Version   string `json:"version"`
		IP        string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.SubjectID == "" || body.DocID == "" {
		http.Error(w, "subject_id and doc_id required", http.StatusBadRequest)
		return
	}
	id := ulid.New()
	_, err := a.pool.Exec(r.Context(), `
		INSERT INTO commerce.legal_acceptances (id, subject_id, doc_id, doc_type, version, ip)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		id, body.SubjectID, body.DocID, body.DocType, body.Version, body.IP)
	if err != nil {
		httpErr(w, err)
		return
	}
	mAccept.Add(1)
	jsonOK(w, map[string]any{"acceptance_id": id, "subject_id": body.SubjectID, "doc_id": body.DocID})
}

// P132: ordered available payment methods for region + amount.
func (a *app) payMethods(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	amount := int64(config.Int("AMOUNT_MICRO_DEFAULT", 0))
	if v := r.URL.Query().Get("amount_micro"); v != "" {
		fmt.Sscan(v, &amount)
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT method, provider, currency, priority, min_micro, max_micro FROM commerce.payment_method_availability
		WHERE region=$1 AND enabled
		  AND ($2 = 0 OR min_micro = 0 OR $2 >= min_micro)
		  AND ($2 = 0 OR max_micro = 0 OR $2 <= max_micro)
		ORDER BY priority ASC`, reg, amount)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var method, provider, currency string
		var prio int
		var mn, mx int64
		if rows.Scan(&method, &provider, &currency, &prio, &mn, &mx) == nil {
			out = append(out, map[string]any{"method": method, "provider": provider, "currency": currency, "priority": prio})
		}
	}
	jsonOK(w, map[string]any{"region": reg, "amount_micro": amount, "methods": out})
}

// P139: compliance report register (create + list).
func (a *app) reports(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		rows, err := a.pool.Query(ctx, `
			SELECT id, report_type, region, period, status, created_at FROM commerce.compliance_reports
			ORDER BY created_at DESC LIMIT 100`)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		var out []map[string]any
		for rows.Next() {
			var id, rt, reg, period, status string
			var created any
			if rows.Scan(&id, &rt, &reg, &period, &status, &created) == nil {
				out = append(out, map[string]any{"id": id, "report_type": rt, "region": reg, "period": period, "status": status, "created_at": created})
			}
		}
		jsonOK(w, map[string]any{"reports": out})
		return
	}
	var body struct {
		ReportType string         `json:"report_type"`
		Region     string         `json:"region"`
		Period     string         `json:"period"`
		Metrics    map[string]any `json:"metrics"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.ReportType == "" || body.Period == "" {
		http.Error(w, "report_type and period required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	if body.Metrics == nil {
		body.Metrics = map[string]any{}
	}
	id := ulid.New()
	metricsJSON, _ := json.Marshal(body.Metrics)
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.compliance_reports (id, report_type, region, period, status, metrics)
		VALUES ($1,$2,$3,$4,'generated',$5)`,
		id, body.ReportType, body.Region, body.Period, metricsJSON)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"report_id": id, "report_type": body.ReportType, "period": body.Period, "status": "generated"})
}

// condMatch performs simple equality matching of rule condition vs request attrs.
func condMatch(cond, attrs map[string]any) bool {
	if len(cond) == 0 {
		return true
	}
	for k, v := range cond {
		av, ok := attrs[k]
		if !ok {
			return false
		}
		if fmt.Sprint(av) != fmt.Sprint(v) {
			return false
		}
	}
	return true
}

// bucket returns a stable 0-99 bucket for rollout decisions.
func bucket(s string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(strings.ToLower(s)))
	return int(h.Sum32() % 100)
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
