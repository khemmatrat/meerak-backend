package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/residency"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/segmentio/kafka-go"
)

type foundationApp struct {
	pools    *db.Pools
	router   *shard.Router
	catalog  *shard.Catalog
	region   *region.Router
	residency *residency.Enforcer
	shardMet *metrics.ShardRegistry
	brokers  []string
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	shardCount := config.Int("SHARD_COUNT", 2)
	catalog := shard.NewCatalog()
	_ = catalog.Load(ctx, pools.Read)
	router := shard.NewRouter(shardCount).WithCatalog(catalog)

	app := &foundationApp{
		pools:     pools,
		router:    router,
		catalog:   catalog,
		region:    region.NewRouter(),
		residency: residency.NewEnforcer(pools.Write),
		shardMet:  metrics.NewShardRegistry(),
		brokers:   config.LoadKafkaBrokers(),
	}

	port := config.Int("PORT", 8101)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/kafka/smoke", app.kafkaSmoke)
	mux.HandleFunc("/v1/shard/topology", app.shardTopology)
	mux.HandleFunc("/v1/shard/admin/report", app.crossShardReport)
	mux.HandleFunc("/v1/shard/metrics", app.shardMetrics)
	mux.HandleFunc("/v1/shard/region/route", app.regionRoute)
	mux.HandleFunc("/v1/shard/residency/check", app.residencyCheck)
	mux.HandleFunc("/v1/shard/mirror/sync", app.mirrorSync)

	addr := fmt.Sprintf(":%d", port)
	log.Printf("foundation-svc listening %s citus=%v p46-p58", addr, pools.CitusEnabled)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func (a *foundationApp) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "service": "foundation-svc",
		"p9": true, "p46": true, "p49": true, "p58": true,
		"citus_enabled": a.pools.CitusEnabled,
		"shard_count":   a.router.ShardCount,
		"regions":       a.catalog.Regions(),
	})
}

func (a *foundationApp) kafkaSmoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := pkgkafka.Ping(ctx, a.brokers); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	topic := pkgkafka.RegionalTopic("aqond.p9.smoke", config.LoadRegion())
	msg := fmt.Sprintf("p9-smoke-%d", time.Now().UnixNano())
	conn, err := kafka.DialContext(ctx, "tcp", a.brokers[0])
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_ = conn.CreateTopics(kafka.TopicConfig{Topic: topic, NumPartitions: 2, ReplicationFactor: 1})
	_ = conn.Close()
	writer := pkgkafka.NewWriter(a.brokers, topic)
	defer writer.Close()
	if err := pkgkafka.PublishPartitioned(ctx, writer, []byte("smoke"), []byte(msg)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "topic": topic, "message": msg, "p57": true})
}

func (a *foundationApp) shardTopology(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"catalog":       a.catalog.Snapshot(),
		"shard_count":   a.router.ShardCount,
		"citus_enabled": a.pools.CitusEnabled,
		"distribution_column": "shard_key",
	})
}

// P51: cross-shard admin report (scatter-gather safe paths only)
func (a *foundationApp) crossShardReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := a.pools.Read.Query(ctx, `
		SELECT shard_key, COUNT(*) AS orders
		FROM commerce.orders GROUP BY shard_key ORDER BY orders DESC LIMIT 20`)
	if err != nil {
		warn := shard.GuardWarn(`SELECT shard_key, COUNT(*) FROM commerce.orders GROUP BY shard_key`, false)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error(), "guard_warn": warn})
		return
	}
	defer rows.Close()
	type row struct {
		ShardKey string `json:"shard_key"`
		Orders   int    `json:"orders"`
	}
	var out []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.ShardKey, &x.Orders) == nil {
			out = append(out, x)
			a.shardMet.IncShard(x.ShardKey, a.router.HomeRegion(x.ShardKey), float64(x.Orders))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"report": "orders_by_shard", "rows": out,
		"guard_note": "admin scatter-gather — not for hot path",
	})
}

// P58: shard-aware metrics
func (a *foundationApp) shardMetrics(w http.ResponseWriter, _ *http.Request) {
	shards, regions := a.shardMet.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"by_shard":  shards,
		"by_region": regions,
		"hot_shards": a.shardMet.HotShards(2.0),
		"slo": map[string]any{
			"skew_factor_max": 2.0,
			"rebalance_trigger": "hot_shards non-empty",
		},
	})
}

// P53: region routing preview
func (a *foundationApp) regionRoute(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	home := a.router.HomeRegion(merchantID)
	reqRegion := a.region.FromRequest(r)
	writeMode := r.URL.Query().Get("write") == "1"
	target, allowed, reason := a.region.RouteTarget(home, reqRegion, writeMode)
	writeJSON(w, http.StatusOK, map[string]any{
		"merchant_id": merchantID, "home_region": home,
		"request_region": reqRegion, "target_region": target,
		"allowed": allowed, "reason": reason,
		"physical_node": a.router.PhysicalNode(merchantID),
	})
}

// P54: residency check
func (a *foundationApp) residencyCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		EntityType     string `json:"entity_type"`
		EntityID       string `json:"entity_id"`
		ShardKey       string `json:"shard_key"`
		HomeRegion     string `json:"home_region"`
		AttemptRegion  string `json:"attempt_region"`
		Action         string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	err := a.residency.CheckWrite(r.Context(), body.EntityType, body.EntityID, body.ShardKey,
		body.HomeRegion, body.AttemptRegion, body.Action)
	writeJSON(w, http.StatusOK, map[string]any{"allowed": err == nil, "error": errMsg(err)})
}

// P55: cross-region read mirror stub
func (a *foundationApp) mirrorSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SourceTable  string         `json:"source_table"`
		SourceID     string         `json:"source_id"`
		HomeRegion   string         `json:"home_region"`
		MirrorRegion string         `json:"mirror_region"`
		Payload      map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id := ulid.New()
	_, err := a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.region_read_mirrors (id, source_table, source_id, home_region, mirror_region, payload)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb)
		ON CONFLICT (source_table, source_id, mirror_region) DO UPDATE SET payload=$6::jsonb, synced_at=NOW()`,
		id, body.SourceTable, body.SourceID, body.HomeRegion, body.MirrorRegion, mustJSON(body.Payload))
	writeJSON(w, http.StatusOK, map[string]any{"mirrored": err == nil, "id": id, "error": errMsg(err)})
}

func mustJSON(v map[string]any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func errMsg(err error) any {
	if err == nil {
		return nil
	}
	return err.Error()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
