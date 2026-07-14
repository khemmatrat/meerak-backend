package main

import (
	"encoding/json"
	"net/http"

	"github.com/aqond/aqond-v2/pkg/degrade"
)

func (a *app) degradeState(w http.ResponseWriter, r *http.Request) {
	a.bump()
	var level string
	var checkoutPri, browseShed int
	var feedFB, rankerFB bool
	err := a.pool.QueryRow(r.Context(), `
		SELECT level, checkout_priority, browse_shed_bps, feed_fallback, ranker_fallback
		FROM commerce.degradation_state WHERE id='global'`).
		Scan(&level, &checkoutPri, &browseShed, &feedFB, &rankerFB)
	if err != nil {
		level = "normal"
	}
	jsonOK(w, map[string]any{
		"level": level, "checkout_priority": checkoutPri, "browse_shed_bps": browseShed,
		"feed_fallback": feedFB, "ranker_fallback": rankerFB,
		"priorities": degrade.Priority,
	})
}

func (a *app) degradeShed(w http.ResponseWriter, r *http.Request) {
	a.bump()
	var body struct {
		Level          string `json:"level"`
		BrowseShedBps  int    `json:"browse_shed_bps"`
		FeedFallback   bool   `json:"feed_fallback"`
		RankerFallback bool   `json:"ranker_fallback"`
		Surface        string `json:"surface"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Level != "" {
		_, _ = a.pool.Exec(r.Context(), `
			UPDATE commerce.degradation_state SET level=$1, browse_shed_bps=$2, feed_fallback=$3,
				ranker_fallback=$4, updated_at=NOW() WHERE id='global'`,
			body.Level, body.BrowseShedBps, body.FeedFallback, body.RankerFallback)
	}
	shed := degrade.ShouldShed(body.Surface, body.Level)
	jsonOK(w, map[string]any{"surface": body.Surface, "level": body.Level, "should_shed": shed, "updated": body.Level != ""})
}

func (a *app) costMetrics(w http.ResponseWriter, r *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"period": "2026-Q2", "cost_per_order_micro": 45000, "cost_per_dau_micro": 120,
		"infra_usd": 850000, "spot_mix_pct": 40, "note": "P185 cost dashboard stub",
	})
}

func (a *app) lifecycleJobs(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"jobs": []map[string]any{
			{"data_class": "logs", "action": "purge", "retain_days": 90},
			{"data_class": "orders", "action": "archive", "retain_days": 2555},
			{"data_class": "content", "action": "compact", "retain_days": 365},
		},
	})
}

func (a *app) cdcStatus(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"pipelines": []map[string]any{
			{"source": "outbox", "sink": "warehouse", "lag_sec": 12, "status": "running"},
			{"source": "payment_events", "sink": "analytics", "lag_sec": 5, "status": "running"},
		},
	})
}

func (a *app) mlPlatform(w http.ResponseWriter, _ *http.Request) {
	a.bump()
	jsonOK(w, map[string]any{
		"models": []map[string]any{
			{"name": "ranker", "version": "heuristic-v1", "freshness_sec": 30, "skew_bps": 50, "status": "healthy"},
			{"name": "retrieval", "version": "embed-v1", "freshness_sec": 60, "skew_bps": 120, "status": "healthy"},
			{"name": "moderation", "version": "rules-v2", "freshness_sec": 5, "skew_bps": 0, "status": "healthy"},
		},
	})
}
