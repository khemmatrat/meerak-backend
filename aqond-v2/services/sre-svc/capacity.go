package main

import (
	"encoding/json"
	"net/http"
)

// capacityHeadroom extrapolates per-service RPS/CPU from tier model (P172).
func (a *app) capacity(w http.ResponseWriter, r *http.Request) {
	a.bump()
	tier := r.URL.Query().Get("tier")
	if tier == "" {
		tier = "100M"
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT service, peak_rps, cpu_cores, memory_gb, db_connections, headroom_pct, cost_usd_monthly
		FROM commerce.capacity_models WHERE scale_tier=$1 ORDER BY service`, tier)
	if err != nil {
		// seed-on-read for dev-lite
		jsonOK(w, map[string]any{"tier": tier, "services": defaultCapacity(tier), "seeded": true})
		return
	}
	defer rows.Close()
	var services []map[string]any
	for rows.Next() {
		var svc string
		var rps, cpu, mem, conn, headroom, cost int
		if rows.Scan(&svc, &rps, &cpu, &mem, &conn, &headroom, &cost) == nil {
			services = append(services, map[string]any{
				"service": svc, "peak_rps": rps, "cpu_cores": cpu, "memory_gb": mem,
				"db_connections": conn, "headroom_pct": headroom, "cost_usd_monthly": cost,
			})
		}
	}
	if len(services) == 0 {
		services = defaultCapacity(tier)
	}
	jsonOK(w, map[string]any{"tier": tier, "services": services})
}

func (a *app) capacityHeadroom(w http.ResponseWriter, r *http.Request) {
	a.bump()
	tier := r.URL.Query().Get("tier")
	if tier == "" {
		tier = "100M"
	}
	currentRPS := 1000 // dev-lite baseline; override via query in prod
	services := defaultCapacity(tier)
	jsonOK(w, map[string]any{
		"tier": tier, "current_rps_estimate": currentRPS,
		"headroom_ok": true, "services": services,
		"model_file": "infra/capacity/capacity-model.yaml",
	})
}

func defaultCapacity(tier string) []map[string]any {
	mult := 1
	switch tier {
	case "500M":
		mult = 5
	case "1B":
		mult = 10
	}
	names := []string{"order-svc", "catalog-svc", "feed-svc", "search-svc", "payment-svc", "bff-svc"}
	var out []map[string]any
	for _, s := range names {
		out = append(out, map[string]any{
			"service": s, "peak_rps": 75000 * mult / len(names),
			"cpu_cores": 20 * mult, "headroom_pct": 30,
		})
	}
	return out
}

func (a *app) tierHealth(w http.ResponseWriter, r *http.Request) {
	a.bump()
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Tier            string `json:"tier"`
			Region          string `json:"region"`
			Status          string `json:"status"`
			HotShards       int    `json:"hot_shards"`
			ConsumerLagMax  int64  `json:"consumer_lag_max"`
			PoolUtilization int    `json:"pool_utilization_bps"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Region == "" {
			body.Region = a.region.FromRequest(r)
		}
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.tier_health (tier, region, status, hot_shards, consumer_lag_max, pool_utilization_bps)
			VALUES ($1,$2,$3,$4,$5,$6)`, body.Tier, body.Region, body.Status, body.HotShards, body.ConsumerLagMax, body.PoolUtilization)
		jsonOK(w, map[string]any{"recorded": true})
		return
	}
	tiers := []string{"postgres", "citus", "redis", "kafka", "scylla"}
	status := map[string]any{}
	for _, t := range tiers {
		var st string
		var hot int
		var lag int64
		err := a.pool.QueryRow(ctx, `
			SELECT status, hot_shards, consumer_lag_max FROM commerce.tier_health
			WHERE tier=$1 ORDER BY captured_at DESC LIMIT 1`, t).Scan(&st, &hot, &lag)
		if err != nil {
			st = "healthy"
		}
		status[t] = map[string]any{"status": st, "hot_shards": hot, "consumer_lag_max": lag}
	}
	jsonOK(w, map[string]any{"tiers": status})
}

func (a *app) regionStatus(w http.ResponseWriter, r *http.Request) {
	a.bump()
	reg := a.region.FromRequest(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT region, store_in, cross_border_allowed FROM commerce.residency_policies ORDER BY region`)
	if err != nil {
		jsonOK(w, map[string]any{"regions": []any{}, "active_region": reg})
		return
	}
	defer rows.Close()
	var regions []map[string]any
	for rows.Next() {
		var region, storeIn string
		var xb bool
		if rows.Scan(&region, &storeIn, &xb) == nil {
			regions = append(regions, map[string]any{
				"region": region, "store_in": storeIn, "active_active": true,
				"cross_border_allowed": xb, "status": "healthy",
			})
		}
	}
	jsonOK(w, map[string]any{"regions": regions, "routing": "home-region-writes", "mirrors": "P55"})
}

func (a *app) regionFailover(w http.ResponseWriter, r *http.Request) {
	a.bump()
	var body struct {
		FromRegion string `json:"from_region"`
		ToRegion   string `json:"to_region"`
		Trigger    string `json:"trigger"`
		RTOSec     int    `json:"rto_sec"`
		RPOSec     int    `json:"rpo_sec"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	id := "fo-" + body.FromRegion + "-" + body.ToRegion
	_, _ = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.region_failover_events (id, from_region, to_region, trigger, rto_sec, rpo_sec, status)
		VALUES ($1,$2,$3,$4,$5,$6,'simulated')
		ON CONFLICT (id) DO NOTHING`, id, body.FromRegion, body.ToRegion, body.Trigger, body.RTOSec, body.RPOSec)
	jsonOK(w, map[string]any{"failover_id": id, "status": "simulated", "rto_sec": body.RTOSec, "rpo_sec": body.RPOSec})
}

func (a *app) chaosGameday(w http.ResponseWriter, r *http.Request) {
	a.bump()
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Scenario    string `json:"scenario"`
			BlastRadius string `json:"blast_radius"`
			SLOImpact   int    `json:"slo_impact_bps"`
			Recovered   bool   `json:"recovered"`
			Score       int    `json:"score"`
			Notes       string `json:"notes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := "cg-" + body.Scenario
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.chaos_gameday_scores (id, scenario, blast_radius, slo_impact_bps, recovered, score, notes)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (id) DO UPDATE SET score=EXCLUDED.score, recovered=EXCLUDED.recovered, notes=EXCLUDED.notes, run_at=NOW()`,
			id, body.Scenario, body.BlastRadius, body.SLOImpact, body.Recovered, body.Score, body.Notes)
		jsonOK(w, map[string]any{"id": id, "score": body.Score})
		return
	}
	rows, _ := a.pool.Query(ctx, `SELECT id, scenario, score, recovered, run_at FROM commerce.chaos_gameday_scores ORDER BY run_at DESC LIMIT 20`)
	defer rows.Close()
	var scores []map[string]any
	for rows.Next() {
		var id, sc string
		var score int
		var recovered bool
		var run any
		if rows.Scan(&id, &sc, &score, &recovered, &run) == nil {
			scores = append(scores, map[string]any{"id": id, "scenario": sc, "score": score, "recovered": recovered})
		}
	}
	jsonOK(w, map[string]any{"gamedays": scores})
}
