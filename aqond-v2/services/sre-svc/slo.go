package main

import (
	"encoding/json"
	"net/http"

	"github.com/aqond/aqond-v2/pkg/slo"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) sloList(w http.ResponseWriter, r *http.Request) {
	a.bump()
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, journey, sli, target, window_days, burn_alert_bps, enabled
		FROM commerce.slo_definitions WHERE enabled ORDER BY journey, sli`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, journey, sli string
		var target float64
		var window, burn int
		var enabled bool
		if rows.Scan(&id, &journey, &sli, &target, &window, &burn, &enabled) == nil {
			out = append(out, map[string]any{
				"id": id, "journey": journey, "sli": sli, "target": target,
				"window_days": window, "burn_alert_bps": burn, "enabled": enabled,
			})
		}
	}
	jsonOK(w, map[string]any{"slos": out})
}

func (a *app) sloRecord(w http.ResponseWriter, r *http.Request) {
	a.bump()
	var body struct {
		SLOID    string  `json:"slo_id"`
		Region   string  `json:"region"`
		Observed float64 `json:"observed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.region.FromRequest(r)
	}
	ctx := r.Context()
	var target float64
	var burnAlert int
	if err := a.pool.QueryRow(ctx, `SELECT target, burn_alert_bps FROM commerce.slo_definitions WHERE id=$1`, body.SLOID).
		Scan(&target, &burnAlert); err != nil {
		http.Error(w, "unknown slo_id", http.StatusNotFound)
		return
	}
	remaining := slo.BudgetRemainingBps(target, body.Observed)
	burn := slo.BurnRateBps(target, body.Observed, 1)
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.slo_snapshots (slo_id, region, observed, budget_remaining_bps, burn_rate_bps)
		VALUES ($1,$2,$3,$4,$5)`, body.SLOID, body.Region, body.Observed, remaining, burn)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{
		"slo_id": body.SLOID, "observed": body.Observed,
		"budget_remaining_bps": remaining, "burn_rate_bps": burn,
		"release_allowed": slo.ReleaseAllowed(burn, burnAlert),
	})
}

func (a *app) sloBudget(w http.ResponseWriter, r *http.Request) {
	a.bump()
	journey := r.URL.Query().Get("journey")
	if journey == "" {
		http.Error(w, "journey required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT d.id, d.journey, d.sli, d.target, d.burn_alert_bps,
			COALESCE(s.observed, d.target), COALESCE(s.budget_remaining_bps, 10000), COALESCE(s.burn_rate_bps, 0)
		FROM commerce.slo_definitions d
		LEFT JOIN LATERAL (
			SELECT observed, budget_remaining_bps, burn_rate_bps FROM commerce.slo_snapshots
			WHERE slo_id=d.id ORDER BY captured_at DESC LIMIT 1
		) s ON TRUE
		WHERE d.journey=$1 AND d.enabled`, journey)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var items []map[string]any
	releaseOK := true
	for rows.Next() {
		var id, j, sli string
		var target, observed float64
		var burnAlert, remaining, burn int
		if rows.Scan(&id, &j, &sli, &target, &burnAlert, &observed, &remaining, &burn) == nil {
			allowed := slo.ReleaseAllowed(burn, burnAlert)
			if !allowed {
				releaseOK = false
			}
			items = append(items, map[string]any{
				"id": id, "sli": sli, "target": target, "observed": observed,
				"budget_remaining_bps": remaining, "burn_rate_bps": burn, "release_allowed": allowed,
			})
		}
	}
	jsonOK(w, map[string]any{"journey": journey, "budgets": items, "release_allowed": releaseOK})
}

func (a *app) loadRuns(w http.ResponseWriter, r *http.Request) {
	a.bump()
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Scenario      string         `json:"scenario"`
			ScaleTier     string         `json:"scale_tier"`
			VUs           int            `json:"vus"`
			DurationSec   int            `json:"duration_sec"`
			P95Ms         float64        `json:"p95_ms"`
			P99Ms         float64        `json:"p99_ms"`
			ErrorRate     float64        `json:"error_rate"`
			RPS           float64        `json:"rps"`
			OversellCount int            `json:"oversell_count"`
			Passed        bool           `json:"passed"`
			Metrics       map[string]any `json:"metrics"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.ScaleTier == "" {
			body.ScaleTier = "dev-lite"
		}
		id := ulid.New()
		metricsJSON, _ := json.Marshal(body.Metrics)
		_, err := a.pool.Exec(ctx, `
			INSERT INTO commerce.load_test_runs
				(id, scenario, scale_tier, vus, duration_sec, p95_ms, p99_ms, error_rate, rps, oversell_count, passed, metrics, finished_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
			id, body.Scenario, body.ScaleTier, body.VUs, body.DurationSec,
			body.P95Ms, body.P99Ms, body.ErrorRate, body.RPS, body.OversellCount, body.Passed, metricsJSON)
		if err != nil {
			httpErr(w, err)
			return
		}
		jsonOK(w, map[string]any{"run_id": id, "passed": body.Passed})
		return
	}
	scenario := r.URL.Query().Get("scenario")
	q := `SELECT id, scenario, scale_tier, vus, p95_ms, p99_ms, error_rate, rps, oversell_count, passed, started_at
		FROM commerce.load_test_runs`
	args := []any{}
	if scenario != "" {
		q += ` WHERE scenario=$1`
		args = append(args, scenario)
	}
	q += ` ORDER BY started_at DESC LIMIT 50`
	rows, err := a.pool.Query(ctx, q, args...)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var runs []map[string]any
	for rows.Next() {
		var id, sc, tier string
		var vus, oversell int
		var p95, p99, errRate, rps float64
		var passed bool
		var started any
		if rows.Scan(&id, &sc, &tier, &vus, &p95, &p99, &errRate, &rps, &oversell, &passed, &started) == nil {
			runs = append(runs, map[string]any{
				"id": id, "scenario": sc, "scale_tier": tier, "vus": vus,
				"p95_ms": p95, "p99_ms": p99, "error_rate": errRate, "rps": rps,
				"oversell_count": oversell, "passed": passed, "started_at": started,
			})
		}
	}
	jsonOK(w, map[string]any{"runs": runs})
}

func (a *app) tailLatency(w http.ResponseWriter, r *http.Request) {
	a.bump()
	if r.Method == http.MethodPost {
		var body struct {
			Service string  `json:"service"`
			Route   string  `json:"route"`
			P99Ms   float64 `json:"p99_ms"`
			P999Ms  float64 `json:"p999_ms"`
			Region  string  `json:"region"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Region == "" {
			body.Region = a.region.FromRequest(r)
		}
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.tail_latency_samples (service, route, p99_ms, p999_ms, region)
			VALUES ($1,$2,$3,$4,$5)`, body.Service, body.Route, body.P99Ms, body.P999Ms, body.Region)
		jsonOK(w, map[string]any{"recorded": true})
		return
	}
	svc := r.URL.Query().Get("service")
	jsonOK(w, map[string]any{"service": svc, "note": "POST samples or query Prometheus in prod"})
}
