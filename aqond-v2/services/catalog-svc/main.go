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
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type catalogApp struct {
	writePool *pgxpool.Pool
	readPool  *pgxpool.Pool
	redis     *redis.Client
	router    *shard.Router
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	app := &catalogApp{
		writePool: pools.Write,
		readPool:  pools.Read,
		redis:     redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()}),
		router:    shard.NewRouter(1),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/v1/stores", app.handleStores)
	mux.HandleFunc("/v1/products", app.handleProducts)
	mux.HandleFunc("/v1/products/", app.handleProductSub)
	mux.HandleFunc("/v1/variants", app.handleVariants)

	port := config.Int("PORT", 8110)
	log.Printf("catalog-svc :%d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *catalogApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "catalog-svc", "p11": true, "p29": true})
}

func (a *catalogApp) handleStores(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.createStore(w, r)
	case http.MethodGet:
		a.listStores(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *catalogApp) createStore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID  string `json:"merchant_id"`
		Slug        string `json:"slug"`
		DisplayName string `json:"display_name"`
		Region      string `json:"region"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" {
		body.MerchantID = ulid.New()
	}
	if body.Slug == "" {
		body.Slug = "store-" + body.MerchantID[:8]
	}
	if body.DisplayName == "" {
		body.DisplayName = body.Slug
	}
	if body.Region == "" {
		body.Region = "TH"
	}
	id := ulid.New()
	sk := a.router.ShardKey(body.MerchantID)
	_, err := a.writePool.Exec(r.Context(), `
		INSERT INTO commerce.merchants (id, shard_key, region, name) VALUES ($1,$2,$3,$4)
		ON CONFLICT (id) DO NOTHING`,
		body.MerchantID, sk, body.Region, body.DisplayName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_, err = a.writePool.Exec(r.Context(), `
		INSERT INTO commerce.stores (id, merchant_id, shard_key, region, slug, display_name)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		id, body.MerchantID, sk, body.Region, body.Slug, body.DisplayName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"store": map[string]any{"id": id, "merchant_id": body.MerchantID, "slug": body.Slug}})
}

func (a *catalogApp) listStores(w http.ResponseWriter, r *http.Request) {
	rows, err := a.readPool.Query(r.Context(), `SELECT id, merchant_id, slug, display_name, status FROM commerce.stores ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, mid, slug, name, status string
		if err := rows.Scan(&id, &mid, &slug, &name, &status); err != nil {
			continue
		}
		list = append(list, map[string]any{"id": id, "merchant_id": mid, "slug": slug, "display_name": name, "status": status})
	}
	jsonOK(w, map[string]any{"stores": list, "count": len(list)})
}

func (a *catalogApp) handleProducts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.createProduct(w, r)
	case http.MethodGet:
		a.listProducts(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *catalogApp) createProduct(w http.ResponseWriter, r *http.Request) {
	var body struct {
		StoreID              string         `json:"store_id"`
		MerchantID           string         `json:"merchant_id"`
		ExternalID           string         `json:"external_id"`
		Title                string         `json:"title"`
		Description          string         `json:"description"`
		Category             string         `json:"category"`
		Status               string         `json:"status"`
		PriceMicro           int64          `json:"price_micro"`
		Inventory            int            `json:"inventory"`
		SeoTags              []string       `json:"seo_tags"`
		Metadata             map[string]any `json:"metadata"`
		WeightGrams          int            `json:"weight_grams"`
		WidthCm              float64        `json:"width_cm"`
		LengthCm             float64        `json:"length_cm"`
		HeightCm             float64        `json:"height_cm"`
		PurchaseLimitPerUser int            `json:"purchase_limit_per_user"`
		OptionLabel          string         `json:"option_label"`
		OptionValue          string         `json:"option_value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	if body.ExternalID == "" {
		body.ExternalID = ulid.New()
	}
	if body.Status == "" {
		body.Status = "draft"
	}
	if body.Category == "" {
		body.Category = "general"
	}
	pid := ulid.New()
	vid := ulid.New()
	sk := a.router.ShardKey(body.MerchantID)
	if body.MerchantID == "" {
		body.MerchantID = ulid.New()
		sk = a.router.ShardKey(body.MerchantID)
	}
	if body.StoreID == "" {
		body.StoreID = ulid.New()
	}
	tags, _ := json.Marshal(body.SeoTags)
	meta, _ := json.Marshal(body.Metadata)
	if body.Metadata == nil {
		meta = []byte("{}")
	}
	if body.WeightGrams <= 0 {
		body.WeightGrams = 500
	}

	tx, err := a.writePool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		INSERT INTO commerce.products (id, store_id, merchant_id, shard_key, external_id, title, description, category, status, seo_tags, metadata,
		 weight_grams, width_cm, length_cm, height_cm, purchase_limit_per_user)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16)`,
		pid, body.StoreID, body.MerchantID, sk, body.ExternalID, body.Title, body.Description, body.Category, body.Status, string(tags), string(meta),
		body.WeightGrams, body.WidthCm, body.LengthCm, body.HeightCm, body.PurchaseLimitPerUser)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sku := "SKU-" + vid[:12]
	price := body.PriceMicro
	if price == 0 {
		price = 29900
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO commerce.product_variants (id, product_id, merchant_id, shard_key, sku, title, price_micro, weight_grams, width_cm, length_cm, height_cm, option_label, option_value)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		vid, pid, body.MerchantID, sk, sku, body.Title, price, body.WeightGrams, body.WidthCm, body.LengthCm, body.HeightCm, body.OptionLabel, body.OptionValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	qty := body.Inventory
	if qty == 0 {
		qty = 10
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO commerce.inventory (variant_id, merchant_id, shard_key, available) VALUES ($1,$2,$3,$4)`,
		vid, body.MerchantID, sk, qty)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = outbox.Insert(r.Context(), a.writePool, outbox.Event{
		AggregateType: "product",
		AggregateID:   pid,
		EventType:     "catalog.product.updated",
		ShardKey:      sk,
		Payload: map[string]any{
			"product_id": pid, "variant_id": vid, "status": body.Status, "title": body.Title,
		},
	})

	cacheKey := "catalog:product:" + pid
	payload, _ := json.Marshal(map[string]any{"id": pid, "title": body.Title, "status": body.Status})
	_ = a.redis.Set(r.Context(), cacheKey, payload, 5*time.Minute).Err()

	jsonOK(w, map[string]any{
		"product": map[string]any{"id": pid, "external_id": body.ExternalID, "title": body.Title, "status": body.Status},
		"variant": map[string]any{"id": vid, "sku": sku, "price_micro": price},
	})
}

func (a *catalogApp) listProducts(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "published"
	}
	rows, err := a.readPool.Query(r.Context(), `
		SELECT p.id, p.external_id, p.title, p.category, p.status, v.id, v.price_micro, i.available, p.metadata
		FROM commerce.products p
		JOIN commerce.product_variants v ON v.product_id = p.id
		LEFT JOIN commerce.inventory i ON i.variant_id = v.id
		WHERE p.status = $1 ORDER BY p.created_at DESC LIMIT 100`, status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var pid, ext, title, cat, st, vid string
		var price int64
		var avail *int
		var metaRaw []byte
		if err := rows.Scan(&pid, &ext, &title, &cat, &st, &vid, &price, &avail, &metaRaw); err != nil {
			continue
		}
		inv := 0
		if avail != nil {
			inv = *avail
		}
		var meta map[string]any
		_ = json.Unmarshal(metaRaw, &meta)
		item := map[string]any{
			"id": pid, "external_id": ext, "title": title, "category": cat, "status": st,
			"variant_id": vid, "price_micro": price, "price_thb": float64(price) / 100, "inventory": inv,
		}
		if len(meta) > 0 {
			item["metadata"] = meta
			if u, ok := meta["image_url"].(string); ok && u != "" {
				item["image_url"] = u
			}
		}
		list = append(list, item)
	}
	jsonOK(w, map[string]any{"products": list, "count": len(list)})
}

func (a *catalogApp) handleProductSub(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/products/")
	parts := strings.Split(path, "/")
	id := parts[0]
	if id == "" {
		http.NotFound(w, r)
		return
	}
	if len(parts) == 2 && parts[1] == "publish" && r.Method == http.MethodPost {
		a.publishProduct(w, r, id)
		return
	}
	if r.Method == http.MethodGet {
		a.getProduct(w, r, id)
		return
	}
	http.NotFound(w, r)
}

func (a *catalogApp) publishProduct(w http.ResponseWriter, r *http.Request, id string) {
	tag, err := a.writePool.Exec(r.Context(), `UPDATE commerce.products SET status='published', updated_at=NOW() WHERE id=$1`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "id": id, "status": "published"})
}

func (a *catalogApp) getProduct(w http.ResponseWriter, r *http.Request, id string) {
	// Always read DB — redis cache from createProduct lacks metadata/image_url (P4).
	var title, status, ext string
	var metaRaw []byte
	err := a.readPool.QueryRow(r.Context(), `SELECT title, status, external_id, metadata FROM commerce.products WHERE id=$1`, id).Scan(&title, &status, &ext, &metaRaw)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var meta map[string]any
	_ = json.Unmarshal(metaRaw, &meta)
	out := map[string]any{"id": id, "title": title, "status": status, "external_id": ext}
	if len(meta) > 0 {
		out["metadata"] = meta
		if u, ok := meta["image_url"].(string); ok && u != "" {
			out["image_url"] = u
		}
	}
	payload, _ := json.Marshal(out)
	_ = a.redis.Set(r.Context(), "catalog:product:"+id, payload, 5*time.Minute).Err()
	jsonOK(w, out)
}

func (a *catalogApp) handleVariants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	productID := r.URL.Query().Get("product_id")
	if productID == "" {
		http.Error(w, "product_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.readPool.Query(r.Context(), `SELECT id, sku, price_micro FROM commerce.product_variants WHERE product_id=$1`, productID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, sku string
		var price int64
		_ = rows.Scan(&id, &sku, &price)
		list = append(list, map[string]any{"id": id, "sku": sku, "price_micro": price})
	}
	jsonOK(w, map[string]any{"variants": list})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
