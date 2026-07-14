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
	"github.com/aqond/aqond-v2/pkg/metrics"
	redisclient "github.com/aqond/aqond-v2/pkg/redisclient"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	buckets := config.Int("INV_SHARD_BUCKETS", 8)
	app := &inventoryApp{
		pool:     pools.Write,
		readPool: pools.Read,
		redis:    redisclient.NewUniversal(),
		cache:   newInventoryCache(config.Int("READ_CACHE_TTL_MS", 500)),
		buckets: buckets,
		mreg:    &metrics.Registry{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.mreg.Handler(nil))
	mux.HandleFunc("/v1/inventory/", app.handleInventory)
	mux.HandleFunc("/v1/reserve", app.reserve)
	mux.HandleFunc("/v1/commit", app.commit)
	mux.HandleFunc("/v1/release", app.release)

	port := config.Int("PORT", 8111)
	log.Printf("inventory-svc :%d buckets=%d", port, buckets)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *inventoryApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{
		"ok": true, "service": "inventory-svc", "p12": true, "p25": true, "p29": true,
		"shard_buckets": a.shardBuckets(), "cache_ttl_ms": config.Int("READ_CACHE_TTL_MS", 500),
		"p56_redis_cluster": config.RedisClusterMode(),
	})
}

func (a *inventoryApp) handleInventory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	variantID := r.URL.Path[len("/v1/inventory/"):]
	avail, reserved, err := a.readInventoryCoalesced(r.Context(), variantID)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"variant_id": variantID, "available": avail, "reserved": reserved})
}

func (a *inventoryApp) reserve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		VariantID  string `json:"variant_id"`
		OrderID    string `json:"order_id"`
		MerchantID string `json:"merchant_id"`
		ShardKey   string `json:"shard_key"`
		Qty        int    `json:"qty"`
		TTLSeconds int    `json:"ttl_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Qty < 1 {
		body.Qty = 1
	}
	if body.TTLSeconds < 1 {
		body.TTLSeconds = 900
	}
	ctx := r.Context()
	_ = a.syncShardedRedis(ctx, body.VariantID)

	res, err := a.reserveSharded(ctx, body.VariantID, body.Qty)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if res == 0 {
		_ = a.syncShardedRedis(ctx, body.VariantID)
		res, err = a.reserveSharded(ctx, body.VariantID, body.Qty)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if res != 1 {
		a.mreg.ReserveConflicts.Inc()
		jsonOK(w, map[string]any{"ok": false, "error": "insufficient_stock"})
		return
	}

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		a.releaseSharded(ctx, body.VariantID, body.Qty)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE commerce.inventory SET available = available - $2, reserved = reserved + $2, version = version + 1, updated_at = NOW()
		WHERE variant_id = $1 AND available >= $2`, body.VariantID, body.Qty)
	if err != nil || tag.RowsAffected() == 0 {
		_ = a.releaseSharded(ctx, body.VariantID, body.Qty)
		jsonOK(w, map[string]any{"ok": false, "error": "db_insufficient_stock"})
		return
	}

	rid := ulid.New()
	expires := time.Now().Add(time.Duration(body.TTLSeconds) * time.Second)
	_, err = tx.Exec(ctx, `
		INSERT INTO commerce.inventory_reservations (id, variant_id, order_id, merchant_id, shard_key, qty, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		rid, body.VariantID, body.OrderID, body.MerchantID, body.ShardKey, body.Qty, expires)
	if err != nil {
		_ = a.releaseSharded(ctx, body.VariantID, body.Qty)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.invalidateCache(body.VariantID)
	jsonOK(w, map[string]any{"ok": true, "reservation_id": rid, "status": "held"})
}

func (a *inventoryApp) commit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		OrderID   string `json:"order_id"`
		VariantID string `json:"variant_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx := r.Context()
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.inventory_reservations SET status='committed' WHERE order_id=$1 AND variant_id=$2 AND status='held'`, body.OrderID, body.VariantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	var qty int
	_ = a.pool.QueryRow(ctx, `SELECT qty FROM commerce.inventory_reservations WHERE order_id=$1 AND variant_id=$2`, body.OrderID, body.VariantID).Scan(&qty)
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.inventory SET reserved = reserved - $2 WHERE variant_id=$1`, body.VariantID, qty)
	a.invalidateCache(body.VariantID)
	jsonOK(w, map[string]any{"ok": true, "status": "committed"})
}

func (a *inventoryApp) release(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		OrderID   string `json:"order_id"`
		VariantID string `json:"variant_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx := r.Context()
	var qty int
	err := a.pool.QueryRow(ctx, `SELECT qty FROM commerce.inventory_reservations WHERE order_id=$1 AND variant_id=$2 AND status='held'`, body.OrderID, body.VariantID).Scan(&qty)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	_, _ = a.pool.Exec(ctx, `
		UPDATE commerce.inventory_reservations SET status='released' WHERE order_id=$1 AND variant_id=$2`, body.OrderID, body.VariantID)
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.inventory SET available = available + $2, reserved = reserved - $2 WHERE variant_id=$1`, body.VariantID, qty)
	_ = a.syncShardedRedis(ctx, body.VariantID)
	a.invalidateCache(body.VariantID)
	jsonOK(w, map[string]any{"ok": true, "status": "released"})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
