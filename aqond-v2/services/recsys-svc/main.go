package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type app struct {
	pools *db.Pools
	redis *redis.Client
}

var (
	mFeatureWrites atomic.Int64
	mRanked        atomic.Int64
	mRetrievals    atomic.Int64
	mAuctions      atomic.Int64
)

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	a := &app{pools: pools, redis: redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()})}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/features", a.features)          // P99
	mux.HandleFunc("/v1/features/define", a.defineFeat) // P99
	mux.HandleFunc("/v1/embeddings/upsert", a.upsertEmbedding) // P100
	mux.HandleFunc("/v1/embeddings/query", a.queryEmbedding)   // P100 visual search
	mux.HandleFunc("/v1/retrieval", a.retrieval)        // P100
	mux.HandleFunc("/v1/rank", a.rank)                  // P101
	mux.HandleFunc("/v1/models", a.models)              // P101
	mux.HandleFunc("/v1/signals/stream", a.streamSignal) // P102
	mux.HandleFunc("/v1/ads/auction", a.auction)        // P103
	mux.HandleFunc("/v1/ads/campaigns", a.campaigns)    // P103
	mux.HandleFunc("/v1/affiliate/links", a.affiliateLinks) // P104
	mux.HandleFunc("/v1/affiliate/match", a.affiliateMatch) // P104

	port := config.Int("PORT", 8125)
	log.Printf("recsys-svc :%d p99-p104", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "recsys-svc", "p99": true, "p104": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_recsys_feature_writes_total %d\n", mFeatureWrites.Load())
	fmt.Fprintf(w, "aqond_recsys_ranked_total %d\n", mRanked.Load())
	fmt.Fprintf(w, "aqond_recsys_retrievals_total %d\n", mRetrievals.Load())
	fmt.Fprintf(w, "aqond_recsys_auctions_total %d\n", mAuctions.Load())
}

// ---- P99: online feature store (Redis) + offline definitions ----

func (a *app) features(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodPost:
		var body struct {
			Entity   string             `json:"entity"`
			ID       string             `json:"id"`
			Features map[string]float64 `json:"features"`
			TTLSec   int                `json:"ttl_sec"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Entity == "" || body.ID == "" {
			http.Error(w, "entity and id required", http.StatusBadRequest)
			return
		}
		key := fmt.Sprintf("feat:%s:%s", body.Entity, body.ID)
		pipe := a.redis.Pipeline()
		for k, v := range body.Features {
			pipe.HSet(ctx, key, k, v)
		}
		pipe.HSet(ctx, key, "_updated", time.Now().Unix())
		if body.TTLSec > 0 {
			pipe.Expire(ctx, key, time.Duration(body.TTLSec)*time.Second)
		}
		_, _ = pipe.Exec(ctx)
		mFeatureWrites.Add(1)
		jsonOK(w, map[string]any{"stored": true, "key": key})
	case http.MethodGet:
		key := fmt.Sprintf("feat:%s:%s", r.URL.Query().Get("entity"), r.URL.Query().Get("id"))
		vals, _ := a.redis.HGetAll(ctx, key).Result()
		fresh := a.freshness(vals)
		jsonOK(w, map[string]any{"features": vals, "freshness_sec": fresh})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) freshness(vals map[string]string) int64 {
	if u, ok := vals["_updated"]; ok {
		if ts, err := strconv.ParseInt(u, 10, 64); err == nil {
			return time.Now().Unix() - ts
		}
	}
	return -1
}

func (a *app) defineFeat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Entity      string `json:"entity"`
		Dtype       string `json:"dtype"`
		FreshnessSLA int   `json:"freshness_sla_sec"`
		Source      string `json:"source"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Dtype == "" {
		body.Dtype = "float"
	}
	if body.FreshnessSLA == 0 {
		body.FreshnessSLA = 300
	}
	_, err := a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.feature_definitions (name, entity, dtype, freshness_sla_sec, source, description)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (name) DO UPDATE SET entity=EXCLUDED.entity, dtype=EXCLUDED.dtype,
		  freshness_sla_sec=EXCLUDED.freshness_sla_sec, source=EXCLUDED.source, description=EXCLUDED.description`,
		body.Name, body.Entity, body.Dtype, body.FreshnessSLA, body.Source, body.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"defined": body.Name})
}

// ---- P100: embedding retrieval (two-tower) over item_embeddings ----

func (a *app) upsertEmbedding(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ItemID   string    `json:"item_id"`
		ItemType string    `json:"item_type"`
		Vector   []float64 `json:"vector"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.ItemID == "" || len(body.Vector) == 0 {
		http.Error(w, "item_id and vector required", http.StatusBadRequest)
		return
	}
	if body.ItemType == "" {
		body.ItemType = "video"
	}
	vec, _ := json.Marshal(body.Vector)
	_, err := a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.item_embeddings (item_id, item_type, dim, vector)
		VALUES ($1,$2,$3,$4::jsonb)
		ON CONFLICT (item_id) DO UPDATE SET item_type=EXCLUDED.item_type, dim=EXCLUDED.dim, vector=EXCLUDED.vector, updated_at=NOW()`,
		body.ItemID, body.ItemType, len(body.Vector), string(vec))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"upserted": body.ItemID, "dim": len(body.Vector)})
}

func (a *app) queryEmbedding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Vector   []float64 `json:"vector"`
		ItemType string    `json:"item_type"`
		TopK     int       `json:"k"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(body.Vector) == 0 {
		http.Error(w, "vector required", http.StatusBadRequest)
		return
	}
	topK := body.TopK
	if topK <= 0 {
		topK = 50
	}
	ctx := r.Context()
	q := `SELECT item_id, item_type, vector FROM commerce.item_embeddings`
	args := []any{}
	if body.ItemType != "" {
		q += ` WHERE item_type = $1`
		args = append(args, body.ItemType)
	}
	q += ` LIMIT 5000`
	rows, err := a.pools.Read.Query(ctx, q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type scored struct {
		ItemID   string  `json:"item_id"`
		ItemType string  `json:"item_type"`
		Score    float64 `json:"score"`
	}
	var out []scored
	for rows.Next() {
		var id, typ string
		var raw []byte
		if rows.Scan(&id, &typ, &raw) != nil {
			continue
		}
		var v []float64
		_ = json.Unmarshal(raw, &v)
		out = append(out, scored{ItemID: id, ItemType: typ, Score: cosine(body.Vector, v)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) > topK {
		out = out[:topK]
	}
	mRetrievals.Add(1)
	jsonOK(w, map[string]any{"candidates": out, "count": len(out)})
}

func (a *app) retrieval(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	topK := atoiDefault(r.URL.Query().Get("k"), 50)
	ctx := r.Context()
	uvec := a.userEmbedding(ctx, userID)

	rows, err := a.pools.Read.Query(ctx, `SELECT item_id, item_type, vector FROM commerce.item_embeddings LIMIT 5000`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type scored struct {
		ItemID   string  `json:"item_id"`
		ItemType string  `json:"item_type"`
		Score    float64 `json:"score"`
	}
	var out []scored
	for rows.Next() {
		var id, typ string
		var raw []byte
		if rows.Scan(&id, &typ, &raw) != nil {
			continue
		}
		var v []float64
		_ = json.Unmarshal(raw, &v)
		out = append(out, scored{ItemID: id, ItemType: typ, Score: cosine(uvec, v)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) > topK {
		out = out[:topK]
	}
	mRetrievals.Add(1)
	jsonOK(w, map[string]any{"candidates": out, "count": len(out)})
}

// userEmbedding builds a query vector from the online feature store (P99) or interests.
func (a *app) userEmbedding(ctx context.Context, userID string) []float64 {
	if userID == "" {
		return nil
	}
	if raw, err := a.redis.Get(ctx, "emb:user:"+userID).Result(); err == nil {
		var v []float64
		if json.Unmarshal([]byte(raw), &v) == nil {
			return v
		}
	}
	// derive a coarse embedding from interest count hash buckets
	interests, _ := a.redis.SMembers(ctx, "user:interests:"+userID).Result()
	vec := make([]float64, 8)
	for _, c := range interests {
		vec[hashBucket(c, 8)] += 1
	}
	return vec
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func atoiDefault(s string, d int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return d
}

func cosine(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	if n == 0 {
		return 0
	}
	var dot, na, nb float64
	for i := 0; i < n; i++ {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

func hashBucket(s string, mod int) int {
	h := 0
	for _, c := range s {
		h = (h*31 + int(c)) % mod
	}
	if h < 0 {
		h += mod
	}
	return h
}

var _ = pgxpool.Pool{}
var _ = ulid.New
