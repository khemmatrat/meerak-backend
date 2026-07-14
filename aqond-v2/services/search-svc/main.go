package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type app struct {
	pools   *db.Pools
	redis   *redis.Client
	backend string
}

var (
	mQueries    atomic.Int64
	mZeroResult atomic.Int64
	mIndexed    atomic.Int64
)

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	a := &app{
		pools:   pools,
		redis:   redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()}),
		backend: config.Get("SEARCH_BACKEND", "postgres"),
	}

	// P92: streaming index pipeline (optional; reindex/upsert always available).
	if config.Get("SEARCH_CONSUMER", "1") == "1" {
		go a.runIndexer(ctx)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/search", a.search)
	mux.HandleFunc("/v1/suggest", a.suggest)
	mux.HandleFunc("/v1/index/upsert", a.upsert)
	mux.HandleFunc("/v1/index/reindex", a.reindex)
	mux.HandleFunc("/v1/click", a.click)
	mux.HandleFunc("/v1/analytics", a.analytics)

	port := config.Int("PORT", 8122)
	log.Printf("search-svc :%d p91-p98 backend=%s", port, a.backend)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "search-svc", "backend": a.backend, "p91": true, "p98": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_search_queries_total %d\n", mQueries.Load())
	fmt.Fprintf(w, "aqond_search_zero_results_total %d\n", mZeroResult.Load())
	fmt.Fprintf(w, "aqond_search_indexed_total %d\n", mIndexed.Load())
}

type searchHit struct {
	EntityType string   `json:"entity_type"`
	EntityID   string   `json:"entity_id"`
	Title      string   `json:"title"`
	Category   string   `json:"category"`
	Tags       []string `json:"tags"`
	PriceMicro int64    `json:"price_micro"`
	Currency   string   `json:"currency"`
	Rating     float64  `json:"rating"`
	SoldCount  int64    `json:"sold_count"`
	ShipFrom   string   `json:"ship_from_region"`
	COD        bool     `json:"cod_available"`
	Score      float64  `json:"score"`
}

// P93/P94/P97: multi-tab search with filters, sort, and personalization.
func (a *app) search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	tab := def(r.URL.Query().Get("tab"), "product")
	sort := def(r.URL.Query().Get("sort"), "relevant")
	userID := r.URL.Query().Get("user_id")
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	if limit > 100 {
		limit = 100
	}
	start := time.Now()
	ctx := r.Context()

	args := []any{tab}
	where := []string{"entity_type = $1", "status = 'active'"}
	add := func(cond string, val any) {
		args = append(args, val)
		where = append(where, strings.Replace(cond, "$$", "$"+strconv.Itoa(len(args)), 1))
	}
	if c := r.URL.Query().Get("category"); c != "" {
		add("category = $$", c)
	}
	if sf := r.URL.Query().Get("ship_from"); sf != "" {
		add("ship_from_region = $$", sf)
	}
	if r.URL.Query().Get("cod") == "1" {
		where = append(where, "cod_available = TRUE")
	}
	if pmin := r.URL.Query().Get("price_min"); pmin != "" {
		add("price_micro >= $$", atoi64(pmin))
	}
	if pmax := r.URL.Query().Get("price_max"); pmax != "" {
		add("price_micro <= $$", atoi64(pmax))
	}

	// P96: Thai/typo tolerant matching via FTS + trigram similarity.
	relExpr := "0.0"
	if q != "" {
		args = append(args, q)
		qp := "$" + strconv.Itoa(len(args))
		where = append(where, fmt.Sprintf("(ts @@ plainto_tsquery('simple', %s) OR similarity(title, %s) > 0.2)", qp, qp))
		relExpr = fmt.Sprintf("ts_rank(ts, plainto_tsquery('simple', %s)) + similarity(title, %s)", qp, qp)
	}

	orderBy := "score DESC, sold_count DESC"
	switch sort {
	case "best_selling":
		orderBy = "sold_count DESC"
	case "rating":
		orderBy = "rating DESC, sold_count DESC"
	case "price_asc":
		orderBy = "price_micro ASC"
	case "price_desc":
		orderBy = "price_micro DESC"
	}

	args = append(args, limit)
	sql := fmt.Sprintf(`
		SELECT entity_type, entity_id, title, category, tags, price_micro, currency, rating, sold_count,
		       ship_from_region, cod_available, (%s + popularity*0.01) AS score
		FROM commerce.search_documents
		WHERE %s
		ORDER BY %s
		LIMIT $%d`, relExpr, strings.Join(where, " AND "), orderBy, len(args))

	rows, err := a.pools.Read.Query(ctx, sql, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	hits := []searchHit{}
	for rows.Next() {
		var h searchHit
		if err := rows.Scan(&h.EntityType, &h.EntityID, &h.Title, &h.Category, &h.Tags, &h.PriceMicro,
			&h.Currency, &h.Rating, &h.SoldCount, &h.ShipFrom, &h.COD, &h.Score); err == nil {
			hits = append(hits, h)
		}
	}

	// P97: personalize by boosting categories in the user's interest set.
	if userID != "" && len(hits) > 1 {
		interests, _ := a.redis.SMembers(ctx, "user:interests:"+userID).Result()
		if len(interests) > 0 {
			iset := map[string]bool{}
			for _, c := range interests {
				iset[c] = true
			}
			for i := range hits {
				if iset[hits[i].Category] {
					hits[i].Score += 0.5
				}
			}
			sortHits(hits)
		}
	}

	latency := int(time.Since(start).Milliseconds())
	a.logQuery(ctx, userID, q, tab, len(hits), latency)
	mQueries.Add(1)
	if len(hits) == 0 {
		mZeroResult.Add(1)
	}
	jsonOK(w, map[string]any{"query": q, "tab": tab, "sort": sort, "count": len(hits), "latency_ms": latency, "hits": hits, "facets": a.facets(ctx, tab)})
}

// P94: facet counts for the active tab (category breakdown).
func (a *app) facets(ctx context.Context, tab string) map[string]any {
	rows, err := a.pools.Read.Query(ctx, `
		SELECT category, COUNT(*) FROM commerce.search_documents
		WHERE entity_type=$1 AND status='active' GROUP BY category ORDER BY COUNT(*) DESC LIMIT 12`, tab)
	if err != nil {
		return map[string]any{}
	}
	defer rows.Close()
	cats := []map[string]any{}
	for rows.Next() {
		var c string
		var n int
		if rows.Scan(&c, &n) == nil {
			cats = append(cats, map[string]any{"category": c, "count": n})
		}
	}
	return map[string]any{"category": cats}
}

// P95: autocomplete suggestions + trending searches.
func (a *app) suggest(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	ctx := r.Context()
	out := []string{}
	if q != "" {
		rows, err := a.pools.Read.Query(ctx, `
			SELECT DISTINCT title FROM commerce.search_documents
			WHERE status='active' AND (title ILIKE $1 OR similarity(title,$2) > 0.2)
			ORDER BY title LIMIT 10`, q+"%", q)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var t string
				if rows.Scan(&t) == nil {
					out = append(out, t)
				}
			}
		}
	}
	trending, _ := a.redis.ZRevRange(ctx, "search:trending", 0, 9).Result()
	jsonOK(w, map[string]any{"suggestions": out, "trending": trending})
}

// P92: push upsert of a single document (used by indexer + other services/tests).
func (a *app) upsert(w http.ResponseWriter, r *http.Request) {
	var d searchDoc
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := a.upsertDoc(r.Context(), d); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mIndexed.Add(1)
	jsonOK(w, map[string]any{"indexed": true, "id": d.EntityType + ":" + d.EntityID})
}

// P92: backfill/reindex from source-of-truth tables.
func (a *app) reindex(w http.ResponseWriter, r *http.Request) {
	n := a.reindexAll(r.Context())
	jsonOK(w, map[string]any{"reindexed": n})
}

// P98: record a click for search quality (CTR / conversion-from-search).
func (a *app) click(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Query    string `json:"query"`
		EntityID string `json:"entity_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	_, _ = a.pools.Write.Exec(r.Context(), `
		UPDATE commerce.search_queries SET clicked_entity_id=$2
		WHERE id = (SELECT id FROM commerce.search_queries WHERE query=$1 ORDER BY created_at DESC LIMIT 1)`,
		body.Query, body.EntityID)
	jsonOK(w, map[string]any{"recorded": true})
}

// P98: search quality analytics.
func (a *app) analytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var total, zero, clicked, avgLat int64
	_ = a.pools.Read.QueryRow(ctx, `SELECT COUNT(*) FROM commerce.search_queries`).Scan(&total)
	_ = a.pools.Read.QueryRow(ctx, `SELECT COUNT(*) FROM commerce.search_queries WHERE result_count=0`).Scan(&zero)
	_ = a.pools.Read.QueryRow(ctx, `SELECT COUNT(*) FROM commerce.search_queries WHERE clicked_entity_id IS NOT NULL`).Scan(&clicked)
	_ = a.pools.Read.QueryRow(ctx, `SELECT COALESCE(AVG(latency_ms),0)::bigint FROM commerce.search_queries`).Scan(&avgLat)
	ctr := 0.0
	if total > 0 {
		ctr = float64(clicked) / float64(total)
	}
	zeroRate := 0.0
	if total > 0 {
		zeroRate = float64(zero) / float64(total)
	}
	jsonOK(w, map[string]any{"total_queries": total, "zero_result_rate": zeroRate, "ctr": ctr, "avg_latency_ms": avgLat})
}

func (a *app) logQuery(ctx context.Context, userID, q, tab string, count, latency int) {
	if q == "" {
		return
	}
	_, _ = a.pools.Write.Exec(ctx, `
		INSERT INTO commerce.search_queries (user_id, query, tab, result_count, latency_ms)
		VALUES ($1,$2,$3,$4,$5)`, nullable(userID), q, tab, count, latency)
	_ = a.redis.ZIncrBy(ctx, "search:trending", 1, q).Err()
}

// ---- helpers ----

func sortHits(h []searchHit) {
	for i := 1; i < len(h); i++ {
		for j := i; j > 0 && h[j].Score > h[j-1].Score; j-- {
			h[j], h[j-1] = h[j-1], h[j]
		}
	}
}

func def(v, d string) string {
	if strings.TrimSpace(v) == "" {
		return d
	}
	return v
}

func atoiDefault(s string, d int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return d
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

var _ = pgxpool.Pool{}
