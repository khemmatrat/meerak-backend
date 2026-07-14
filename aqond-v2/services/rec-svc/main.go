package main

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sort"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type recApp struct {
	writePool    *pgxpool.Pool
	readPool     *pgxpool.Pool
	redis        *redis.Client
	epsilon      float64
	mreg         *metrics.Registry
	signalsTotal metrics.Counter
	mergeTotal   metrics.Counter
}

type candidate struct {
	PostID   string  `json:"post_id"`
	MediaID  string  `json:"media_id,omitempty"`
	AuthorID string  `json:"author_id,omitempty"`
	Source   string  `json:"source"`
	Score    float64 `json:"score"`
	ItemType string  `json:"item_type,omitempty"`
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	app := &recApp{
		writePool: pools.Write,
		readPool:  pools.Read,
		redis:     redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()}),
		epsilon:   0.08,
		mreg:      &metrics.Registry{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.mreg.Handler(app.metricsExtra))
	mux.HandleFunc("/v1/signals", app.handleSignals)
	mux.HandleFunc("/v1/candidates", app.handleCandidates)
	mux.HandleFunc("/v1/rank", app.handleRank)
	mux.HandleFunc("/v1/merge", app.handleMerge)
	mux.HandleFunc("/v1/interests", app.handleInterests)
	mux.HandleFunc("/v1/experiment", app.handleExperiment)
	mux.HandleFunc("/v1/metrics/feed", app.handleFeedMetrics)

	port := config.Int("PORT", 8117)
	log.Printf("rec-svc :%d p40-p45", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *recApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "rec-svc", "p40": true, "p45": true})
}

func (a *recApp) metricsExtra() string {
	return fmt.Sprintf("rec_signals_total %d\nrec_merge_total %d\nrec_epsilon %f\n",
		a.signalsTotal.Val(), a.mergeTotal.Val(), a.epsilon)
}

// P40: signal collection + Redis feature store
func (a *recApp) handleSignals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID    string  `json:"user_id"`
		VideoID   string  `json:"video_id"`
		PostID    string  `json:"post_id"`
		Signal    string  `json:"signal"`
		Value     float64 `json:"value"`
		ProductID string  `json:"product_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" || body.Signal == "" {
		http.Error(w, "user_id and signal required", http.StatusBadRequest)
		return
	}
	vid := body.VideoID
	if vid == "" {
		vid = body.PostID
	}
	ctx := r.Context()
	key := fmt.Sprintf("feat:user:%s", body.UserID)
	vkey := fmt.Sprintf("feat:video:%s", vid)
	pipe := a.redis.Pipeline()
	pipe.HIncrBy(ctx, key, body.Signal, int64(math.Max(1, body.Value)))
	pipe.HIncrBy(ctx, vkey, body.Signal, 1)
	pipe.ZIncrBy(ctx, "trending:videos", body.Value, vid)
	if body.ProductID != "" {
		pipe.HIncrBy(ctx, key, "purchase_signals", 1)
	}
	_, _ = pipe.Exec(ctx)
	a.signalsTotal.Inc()
	jsonOK(w, map[string]any{"recorded": true})
}

// P41: candidate generation
func (a *recApp) handleCandidates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	cands := a.generateCandidates(r.Context(), userID)
	jsonOK(w, map[string]any{"candidates": cands, "count": len(cands)})
}

func (a *recApp) generateCandidates(ctx context.Context, userID string) []candidate {
	var out []candidate

	// Trending
	trending, _ := a.redis.ZRevRangeWithScores(ctx, "trending:videos", 0, 49).Result()
	for _, z := range trending {
		out = append(out, candidate{PostID: z.Member.(string), Source: "trending", Score: z.Score, ItemType: "video"})
	}

	// Followed authors (from feature store)
	followed, _ := a.redis.SMembers(ctx, "follow:"+userID).Result()
	for _, author := range followed {
		posts, _ := a.redis.LRange(ctx, "author:posts:"+author, 0, 9).Result()
		for _, pid := range posts {
			out = append(out, candidate{PostID: pid, AuthorID: author, Source: "followed", Score: 2.0, ItemType: "video"})
		}
	}

	// Category affinity from interests
	interests := a.loadInterests(ctx, userID)
	for _, cat := range interests {
		posts, _ := a.redis.LRange(ctx, "cat:posts:"+cat, 0, 9).Result()
		for _, pid := range posts {
			out = append(out, candidate{PostID: pid, Source: "category:" + cat, Score: 1.5, ItemType: "video"})
		}
	}

	// Co-watch (users who watched same videos)
	cowatch, _ := a.redis.SMembers(ctx, "cowatch:"+userID).Result()
	for _, pid := range cowatch {
		out = append(out, candidate{PostID: pid, Source: "cowatch", Score: 1.2, ItemType: "video"})
	}

	// Popularity fallback for cold start
	if len(out) < 10 {
		rows, err := a.readPool.Query(ctx, `
			SELECT id, author_id, media_id FROM commerce.posts WHERE status='published' ORDER BY created_at DESC LIMIT 30`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var pid, aid, mid string
				if rows.Scan(&pid, &aid, &mid) == nil {
					out = append(out, candidate{PostID: pid, AuthorID: aid, MediaID: mid, Source: "popularity", Score: 0.8, ItemType: "video"})
				}
			}
		}
	}
	return dedupeCandidates(out)
}

// P42: ranking with weighted heuristic + online features
func (a *recApp) handleRank(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID     string      `json:"user_id"`
		Candidates []candidate `json:"candidates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" {
		body.UserID = "anon"
	}
	if len(body.Candidates) == 0 {
		body.Candidates = a.generateCandidates(r.Context(), body.UserID)
	}
	weights := a.experimentWeights(r.Context(), body.UserID)
	ranked := a.rankCandidates(r.Context(), body.UserID, body.Candidates, weights)
	jsonOK(w, map[string]any{"items": ranked})
}

func (a *recApp) rankCandidates(ctx context.Context, userID string, cands []candidate, weights map[string]float64) []candidate {
	userFeat, _ := a.redis.HGetAll(ctx, "feat:user:"+userID).Result()
	for i := range cands {
		c := &cands[i]
		vfeat, _ := a.redis.HGetAll(ctx, "feat:video:"+c.PostID).Result()
		score := c.Score
		score += weights["trending"] * parseFloat(vfeat["watch_time"], 0) / 100.0
		score += weights["engagement"] * parseFloat(vfeat["like"], 0)
		score += weights["completion"] * parseFloat(vfeat["completion"], 0)
		score += weights["purchase"] * parseFloat(userFeat["purchase_signals"], 0)
		switch c.Source {
		case "followed":
			score += weights["follow_boost"]
		case "popularity":
			score += weights["cold_start"]
		}
		c.Score = score
	}
	sort.Slice(cands, func(i, j int) bool { return cands[i].Score > cands[j].Score })
	return cands
}

// P43: personalized feed merge (organic + shop + ads)
func (a *recApp) handleMerge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID  string           `json:"user_id"`
		Organic []map[string]any `json:"organic"`
		Limit   int              `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Limit <= 0 {
		body.Limit = 20
	}
	cands := a.generateCandidates(r.Context(), body.UserID)
	weights := a.experimentWeights(r.Context(), body.UserID)
	ranked := a.rankCandidates(r.Context(), body.UserID, cands, weights)

	merged := make([]map[string]any, 0, body.Limit)
	seen := map[string]bool{}
	addOrganic := func(it map[string]any) {
		id, _ := it["post_id"].(string)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		it["item_type"] = "video"
		merged = append(merged, it)
	}
	for _, it := range body.Organic {
		addOrganic(it)
	}
	for _, c := range ranked {
		if len(merged) >= body.Limit {
			break
		}
		if seen[c.PostID] {
			continue
		}
		seen[c.PostID] = true
		merged = append(merged, map[string]any{
			"post_id": c.PostID, "media_id": c.MediaID, "author_id": c.AuthorID,
			"source": c.Source, "score": c.Score, "item_type": "video",
		})
	}

	// Shop/live promo slots every 5 items
	shopCards := a.shopPromoCards(r.Context(), body.UserID)
	adIdx := 0
	maxAds := 3
	consecutiveAds := 0
	var final []map[string]any
	for i, it := range merged {
		final = append(final, it)
		consecutiveAds = 0
		if (i+1)%5 == 0 && adIdx < len(shopCards) && adIdx < maxAds {
			final = append(final, shopCards[adIdx])
			adIdx++
			consecutiveAds++
		}
		if consecutiveAds > 1 {
			break
		}
		if len(final) >= body.Limit {
			break
		}
	}
	a.mergeTotal.Inc()
	jsonOK(w, map[string]any{"items": final, "organic_count": len(body.Organic), "merged_count": len(final)})
}

func (a *recApp) shopPromoCards(ctx context.Context, userID string) []map[string]any {
	rows, err := a.readPool.Query(ctx, `
		SELECT id, title, category FROM commerce.products WHERE status='published' ORDER BY updated_at DESC LIMIT 5`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var cards []map[string]any
	for rows.Next() {
		var id, title, cat string
		if rows.Scan(&id, &title, &cat) == nil {
			cards = append(cards, map[string]any{
				"item_type": "shop_card", "product_id": id, "title": title,
				"category": cat, "source": "promo",
			})
		}
	}
	return cards
}

// P44: cold start + exploration
func (a *recApp) handleInterests(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var body struct {
			UserID    string   `json:"user_id"`
			Interests []string `json:"interests"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.UserID == "" {
			http.Error(w, "user_id required", http.StatusBadRequest)
			return
		}
		data, _ := json.Marshal(body.Interests)
		_, _ = a.writePool.Exec(r.Context(), `
			INSERT INTO commerce.user_interests (user_id, interests) VALUES ($1,$2::jsonb)
			ON CONFLICT (user_id) DO UPDATE SET interests=$2::jsonb, updated_at=NOW()`, body.UserID, string(data))
		ctx := r.Context()
		for _, cat := range body.Interests {
			_ = a.redis.SAdd(ctx, "user:interests:"+body.UserID, cat).Err()
		}
		jsonOK(w, map[string]any{"saved": true, "interests": body.Interests})
	case http.MethodGet:
		userID := r.URL.Query().Get("user_id")
		jsonOK(w, map[string]any{"interests": a.loadInterests(r.Context(), userID)})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *recApp) loadInterests(ctx context.Context, userID string) []string {
	if userID == "" {
		return nil
	}
	vals, _ := a.redis.SMembers(ctx, "user:interests:"+userID).Result()
	if len(vals) > 0 {
		return vals
	}
	var raw string
	if err := a.readPool.QueryRow(ctx, `SELECT interests::text FROM commerce.user_interests WHERE user_id=$1`, userID).Scan(&raw); err != nil {
		return nil
	}
	var interests []string
	_ = json.Unmarshal([]byte(raw), &interests)
	return interests
}

// P45: A/B experiment bucketing
func (a *recApp) handleExperiment(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	expID := r.URL.Query().Get("experiment_id")
	if expID == "" {
		expID = "feed_rank_v1"
	}
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	variant := a.assignVariant(r.Context(), userID, expID)
	jsonOK(w, map[string]any{"user_id": userID, "experiment_id": expID, "variant": variant})
}

func (a *recApp) assignVariant(ctx context.Context, userID, expID string) string {
	var existing string
	if err := a.readPool.QueryRow(ctx, `
		SELECT variant FROM commerce.feed_experiments WHERE user_id=$1 AND experiment_id=$2`, userID, expID).Scan(&existing); err == nil {
		return existing
	}
	h := fnv.New32a()
	h.Write([]byte(userID + ":" + expID))
	variant := "control"
	if h.Sum32()%2 == 1 {
		variant = "treatment"
	}
	_, _ = a.writePool.Exec(ctx, `
		INSERT INTO commerce.feed_experiments (user_id, experiment_id, variant) VALUES ($1,$2,$3)
		ON CONFLICT DO NOTHING`, userID, expID, variant)
	return variant
}

func (a *recApp) experimentWeights(ctx context.Context, userID string) map[string]float64 {
	base := map[string]float64{
		"trending": 0.4, "engagement": 0.3, "completion": 0.5, "purchase": 0.6,
		"follow_boost": 1.5, "cold_start": 0.5,
	}
	if a.assignVariant(ctx, userID, "feed_rank_v1") == "treatment" {
		base["trending"] = 0.6
		base["engagement"] = 0.5
		base["completion"] = 0.7
	}
	// P44: epsilon-greedy exploration slot
	if rand.Float64() < a.epsilon {
		base["exploration"] = 1.0
	}
	return base
}

// P45: feed observability metrics
func (a *recApp) handleFeedMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	watchTime, _ := a.redis.Get(ctx, "metric:watch_time_total").Float64()
	clicks, _ := a.redis.Get(ctx, "metric:feed_clicks").Float64()
	conversions, _ := a.redis.Get(ctx, "metric:feed_conversions").Float64()
	impressions, _ := a.redis.Get(ctx, "metric:feed_impressions").Float64()
	ctr := 0.0
	if impressions > 0 {
		ctr = clicks / impressions
	}
	jsonOK(w, map[string]any{
		"watch_time_total": watchTime, "ctr": ctr,
		"conversion_from_feed": conversions, "impressions": impressions,
		"slo": map[string]any{
			"feed_p99_ms": 200, "ctr_target": 0.05, "watch_time_target_sec": 30,
		},
	})
}

func dedupeCandidates(cands []candidate) []candidate {
	seen := map[string]bool{}
	var out []candidate
	for _, c := range cands {
		if seen[c.PostID] {
			continue
		}
		seen[c.PostID] = true
		out = append(out, c)
	}
	return out
}

func parseFloat(s string, fallback float64) float64 {
	if s == "" {
		return fallback
	}
	var f float64
	if _, err := fmt.Sscan(s, &f); err != nil {
		return fallback
	}
	return f
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
