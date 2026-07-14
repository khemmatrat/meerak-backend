package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type readmodelApp struct {
	writePool *pgxpool.Pool
	readPool  *pgxpool.Pool
	redis     *redis.Client
	mreg      *metrics.Registry
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	app := &readmodelApp{
		writePool: pools.Write,
		readPool:  pools.Read,
		redis:     redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()}),
		mreg:      &metrics.Registry{},
	}

	go app.projectOutbox(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.metricsRegistry().Handler(app.metricsExtra))
	mux.HandleFunc("/v1/read/products/", app.readProduct)
	mux.HandleFunc("/v1/read/inventory/", app.readInventory)

	port := config.Int("PORT", 8114)
	log.Printf("readmodel-svc :%d p28=true", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *readmodelApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "readmodel-svc", "p28": true})
}

func (a *readmodelApp) projectOutbox(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.pollOnce(ctx)
		}
	}
}

func (a *readmodelApp) pollOnce(ctx context.Context) {
	rows, err := a.writePool.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload
		FROM commerce.outbox
		WHERE published_at IS NULL
		ORDER BY created_at ASC
		LIMIT 50`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var aggType, aggID, eventType string
		var payload []byte
		if err := rows.Scan(&id, &aggType, &aggID, &eventType, &payload); err != nil {
			continue
		}
		a.projectEvent(ctx, aggType, aggID, eventType, payload)
		_, _ = a.writePool.Exec(ctx, `UPDATE commerce.outbox SET published_at=NOW() WHERE id=$1`, id)
	}
}

func (a *readmodelApp) projectEvent(ctx context.Context, aggType, aggID, eventType string, payload []byte) {
	switch {
	case strings.HasPrefix(eventType, "catalog."):
		var p map[string]any
		if json.Unmarshal(payload, &p) != nil {
			return
		}
		productID, _ := p["product_id"].(string)
		if productID == "" {
			productID = aggID
		}
		a.redis.Set(ctx, "rm:product:"+productID, payload, 10*time.Minute)
	case eventType == "orders.confirmed" || strings.Contains(eventType, "inventory"):
		var p map[string]any
		if json.Unmarshal(payload, &p) != nil {
			return
		}
		variantID, _ := p["variant_id"].(string)
		if variantID == "" {
			return
		}
		a.refreshInventoryRead(ctx, variantID)
	}
}

func (a *readmodelApp) refreshInventoryRead(ctx context.Context, variantID string) {
	var avail, reserved int
	err := a.readPool.QueryRow(ctx, `SELECT available, reserved FROM commerce.inventory WHERE variant_id=$1`, variantID).
		Scan(&avail, &reserved)
	if err != nil {
		return
	}
	b, _ := json.Marshal(map[string]any{"variant_id": variantID, "available": avail, "reserved": reserved})
	a.redis.Set(ctx, "rm:inventory:"+variantID, b, 2*time.Minute)
}

func (a *readmodelApp) readProduct(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/read/products/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	if b, err := a.redis.Get(r.Context(), "rm:product:"+id).Bytes(); err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Read-Model", "redis")
		_, _ = w.Write(b)
		return
	}
	var title, status string
	var priceMicro int64
	err := a.readPool.QueryRow(r.Context(), `
		SELECT p.title, p.status, COALESCE(v.price_micro, 0)
		FROM commerce.products p
		LEFT JOIN commerce.product_variants v ON v.product_id = p.id
		WHERE p.id=$1 LIMIT 1`, id).Scan(&title, &status, &priceMicro)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	jsonOK(w, map[string]any{"product_id": id, "title": title, "status": status, "price_micro": priceMicro, "source": "postgres-read"})
}

func (a *readmodelApp) readInventory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/read/inventory/")
	if b, err := a.redis.Get(r.Context(), "rm:inventory:"+id).Bytes(); err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Read-Model", "redis")
		_, _ = w.Write(b)
		return
	}
	var avail, reserved int
	err := a.readPool.QueryRow(r.Context(), `SELECT available, reserved FROM commerce.inventory WHERE variant_id=$1`, id).
		Scan(&avail, &reserved)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	jsonOK(w, map[string]any{"variant_id": id, "available": avail, "reserved": reserved, "source": "postgres-read"})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
