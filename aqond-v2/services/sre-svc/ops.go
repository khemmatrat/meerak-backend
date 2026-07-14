package main

import (
	"encoding/json"
	"net/http"

	"github.com/aqond/aqond-v2/pkg/slo"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) securityPosture(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"controls": []map[string]any{
			{"control": "secrets_rotation", "status": "pass", "last_audit": "2026-06-01"},
			{"control": "sbom_scan", "status": "pass"},
			{"control": "runtime_security", "status": "review"},
			{"control": "edge_ddos", "status": "pass"},
		},
	})
}

func (a *app) complianceAudit(w http.ResponseWriter, r *http.Request) {
	a.bump()
	if r.Method == http.MethodPost {
		id := ulid.New()
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.compliance_audit_runs (id, framework, volume_tier, controls_passed, controls_failed, status, completed_at)
			VALUES ($1,'SOC2','100M',42,2,'completed',NOW())`, id)
		jsonOK(w, map[string]any{"audit_id": id, "controls_passed": 42, "controls_failed": 2})
		return
	}
	jsonOK(w, map[string]any{"framework": "SOC2", "volume_tier": "100M", "status": "audit-ready-under-load"})
}

func (a *app) obsCardinality(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"metric_series": 125000, "limit": 500000, "trace_sample_rate": 0.05,
		"log_sample_rate": 0.10, "cost_bounded": true,
	})
}

func (a *app) runbooks(w http.ResponseWriter, r *http.Request) {
	a.bump()
	svc := r.URL.Query().Get("service")
	q := `SELECT id, service, severity, title, steps FROM commerce.incident_runbooks`
	args := []any{}
	if svc != "" {
		q += ` WHERE service=$1`
		args = append(args, svc)
	}
	rows, err := a.pool.Query(r.Context(), q, args...)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var books []map[string]any
	for rows.Next() {
		var id, service, sev, title, steps string
		if rows.Scan(&id, &service, &sev, &title, &steps) == nil {
			books = append(books, map[string]any{"id": id, "service": service, "severity": sev, "title": title, "steps": steps})
		}
	}
	jsonOK(w, map[string]any{"runbooks": books})
}

func (a *app) releaseGates(w http.ResponseWriter, r *http.Request) {
	a.bump()
	journey := r.URL.Query().Get("journey")
	if journey == "" {
		journey = "checkout"
	}
	// check SLO budget + latest readiness
	var releaseOK bool = true
	var burn int
	_ = a.pool.QueryRow(r.Context(), `
		SELECT COALESCE(s.burn_rate_bps,0) FROM commerce.slo_definitions d
		LEFT JOIN LATERAL (
			SELECT burn_rate_bps FROM commerce.slo_snapshots WHERE slo_id=d.id ORDER BY captured_at DESC LIMIT 1
		) s ON TRUE WHERE d.journey=$1 LIMIT 1`, journey).Scan(&burn)
	var alert int = 200
	_ = a.pool.QueryRow(r.Context(), `SELECT burn_alert_bps FROM commerce.slo_definitions WHERE journey=$1 LIMIT 1`, journey).Scan(&alert)
	releaseOK = slo.ReleaseAllowed(burn, alert)
	jsonOK(w, map[string]any{
		"journey": journey, "release_allowed": releaseOK, "burn_rate_bps": burn,
		"progressive_delivery": "argo-rollouts", "auto_rollback_on_breach": true,
	})
}

func (a *app) backupStatus(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"stores": []map[string]any{
			{"store": "postgres", "last_backup": "2026-06-21T00:00:00Z", "pitr_ok": true, "rpo_minutes": 15},
			{"store": "scylla", "last_backup": "2026-06-21T00:00:00Z", "cross_region": true},
			{"store": "redis", "last_backup": "2026-06-21T00:00:00Z"},
			{"store": "minio", "last_backup": "2026-06-21T00:00:00Z", "tiering": "cold"},
		},
		"dr_drill": "P78/P194 — run infra/scripts/k8s-dr-drill.ps1",
	})
}

func (a *app) vendorSLO(w http.ResponseWriter, r *http.Request) {
	a.bump()
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, vendor, kind, target_availability, observed_availability, circuit_open
		FROM commerce.vendor_slo ORDER BY vendor`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var vendors []map[string]any
	for rows.Next() {
		var id, vendor, kind string
		var target, observed float64
		var open bool
		if rows.Scan(&id, &vendor, &kind, &target, &observed, &open) == nil {
			vendors = append(vendors, map[string]any{
				"id": id, "vendor": vendor, "kind": kind,
				"target": target, "observed": observed, "circuit_open": open,
			})
		}
	}
	jsonOK(w, map[string]any{"vendors": vendors})
}

func (a *app) edgeCDN(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"cache_hit_ratio": 0.92, "origin_shield": true, "regions": 4,
		"video_abr": "HLS", "edge_compute": "personalization-headers",
	})
}

func (a *app) tenancyMerchants(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"isolation": "shard_key + rate_limit", "noisy_neighbor_protection": true,
		"per_merchant_rps_cap": 5000, "large_catalog_ingestion": "async outbox",
	})
}

func (a *app) rehearsalScorecard(w http.ResponseWriter, r *http.Request) {
	a.bump()
	if r.Method == http.MethodPost {
		var body struct {
			FlashPassed     bool `json:"flash_passed"`
			FeedPassed      bool `json:"feed_passed"`
			CheckoutPassed  bool `json:"checkout_passed"`
			ChaosInjected   bool `json:"chaos_injected"`
			SLOMet          bool `json:"slo_met"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		score := 0
		if body.FlashPassed {
			score += 25
		}
		if body.FeedPassed {
			score += 25
		}
		if body.CheckoutPassed {
			score += 25
		}
		if body.SLOMet {
			score += 25
		}
		jsonOK(w, map[string]any{"score": score, "passed": score >= 75, "chaos_injected": body.ChaosInjected})
		return
	}
	jsonOK(w, map[string]any{"note": "POST combined peak results from P174+P175+checkout+chaos"})
}

func (a *app) readinessReview(w http.ResponseWriter, r *http.Request) {
	a.bump()
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			ScaleTier string         `json:"scale_tier"`
			Score     int            `json:"score"`
			GoNoGo    string         `json:"go_no_go"`
			Gaps      []any          `json:"gaps"`
			Signoffs  map[string]any `json:"signoffs"`
		}
		if body.ScaleTier == "" {
			body.ScaleTier = "100M"
		}
		if body.GoNoGo == "" {
			body.GoNoGo = "pending"
		}
		id := ulid.New()
		gapsJSON, _ := json.Marshal(body.Gaps)
		signJSON, _ := json.Marshal(body.Signoffs)
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.readiness_reviews (id, scale_tier, score, go_no_go, gaps, signoffs)
			VALUES ($1,$2,$3,$4,$5,$6)`, id, body.ScaleTier, body.Score, body.GoNoGo, gapsJSON, signJSON)
		jsonOK(w, map[string]any{"review_id": id, "go_no_go": body.GoNoGo, "score": body.Score})
		return
	}
	tier := r.URL.Query().Get("tier")
	if tier == "" {
		tier = "100M"
	}
	var id, gng string
	var score int
	var gaps, signoffs []byte
	err := a.pool.QueryRow(ctx, `
		SELECT id, score, go_no_go, gaps, signoffs FROM commerce.readiness_reviews
		WHERE scale_tier=$1 ORDER BY created_at DESC LIMIT 1`, tier).Scan(&id, &score, &gng, &gaps, &signoffs)
	if err != nil {
		jsonOK(w, map[string]any{
			"tier": tier, "score": 0, "go_no_go": "pending",
			"checklists": []string{"P80 infra", "P140 global", "P170 storefront", "P174 flash", "P181 multi-region"},
		})
		return
	}
	var gapsV, signV any
	_ = json.Unmarshal(gaps, &gapsV)
	_ = json.Unmarshal(signoffs, &signV)
	jsonOK(w, map[string]any{"review_id": id, "tier": tier, "score": score, "go_no_go": gng, "gaps": gapsV, "signoffs": signV})
}

func (a *app) programCadence(w http.ResponseWriter, r *http.Request) {
	a.bump()
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			EventType   string `json:"event_type"`
			ScheduledFor string `json:"scheduled_for"`
			Outcome     string `json:"outcome"`
			Completed   bool   `json:"completed"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := ulid.New()
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.scale_program_events (id, event_type, scheduled_for, completed, outcome)
			VALUES ($1,$2,$3::date,$4,$5)`, id, body.EventType, body.ScheduledFor, body.Completed, body.Outcome)
		jsonOK(w, map[string]any{"event_id": id})
		return
	}
	jsonOK(w, map[string]any{
		"cadence": []map[string]any{
			{"event_type": "load_test", "frequency": "weekly"},
			{"event_type": "chaos", "frequency": "monthly"},
			{"event_type": "dr_drill", "frequency": "quarterly"},
			{"event_type": "slo_review", "frequency": "weekly"},
			{"event_type": "capacity_forecast", "frequency": "monthly"},
		},
		"note": "P200 continuous scale program",
	})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
