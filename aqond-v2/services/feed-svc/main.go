package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/scylla"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/gocql/gocql"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const topicPostsCreated = "posts.created"

type feedApp struct {
	writePool       *pgxpool.Pool
	scylla          *gocql.Session
	redis           *redis.Client
	brokers         []string
	hotThreshold    int
	fanoutWorkers   int
	cacheTTL        time.Duration
	recURL          string
	mreg            *metrics.Registry
	feedReads       metrics.Counter
	forYouReads     metrics.Counter
	fanoutPosts     metrics.Counter
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	cfg := scylla.LoadConfig()
	var session *gocql.Session
	for attempt := 1; attempt <= 30; attempt++ {
		session, err = scylla.NewSession(cfg)
		if err == nil {
			if err = scylla.Ping(session); err == nil {
				break
			}
			session.Close()
		}
		log.Printf("scylla not ready attempt %d: %v", attempt, err)
		time.Sleep(3 * time.Second)
	}
	if session == nil || err != nil {
		log.Fatal("scylla unavailable: ", err)
	}
	defer session.Close()

	brokers := config.LoadKafkaBrokers()
	_ = pkgkafka.EnsureTopic(ctx, brokers, topicPostsCreated, 4)

	app := &feedApp{
		writePool:     pools.Write,
		scylla:        session,
		redis:         redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()}),
		brokers:       brokers,
		hotThreshold:  config.Int("HOT_AUTHOR_THRESHOLD", 10000),
		fanoutWorkers: config.Int("FANOUT_WORKERS", 4),
		cacheTTL:      time.Duration(config.Int("FEED_CACHE_TTL_SEC", 30)) * time.Second,
		recURL:        config.Get("REC_SERVICE_URL", "http://rec-svc:8117"),
		mreg:          &metrics.Registry{},
	}

	go app.consumePostsCreated(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.mreg.Handler(nil))
	mux.HandleFunc("/v1/posts", app.handlePosts)
	mux.HandleFunc("/v1/follow", app.handleFollow)
	mux.HandleFunc("/v1/feed", app.handleFeed)
	mux.HandleFunc("/v1/feed/following", app.handleFollowingFeed)
	mux.HandleFunc("/v1/feed/for-you", app.handleForYouFeed)

	port := config.Int("PORT", 8115)
	log.Printf("feed-svc :%d scylla=%s p33-p35", port, cfg.Keyspace)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *feedApp) health(w http.ResponseWriter, _ *http.Request) {
	ok := a.scylla != nil
	jsonOK(w, map[string]any{
		"ok": ok, "service": "feed-svc",
		"p33": true, "p34": true, "p35": true,
		"hot_threshold": a.hotThreshold,
	})
}

func (a *feedApp) handlePosts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		AuthorID string `json:"author_id"`
		MediaID  string `json:"media_id"`
		Caption  string `json:"caption"`
		PostType string `json:"post_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.AuthorID == "" {
		http.Error(w, "author_id required", http.StatusBadRequest)
		return
	}
	if body.PostType == "" {
		body.PostType = "video"
	}
	postID := ulid.New()
	postTS := gocql.TimeUUID()
	payload := map[string]any{"caption": body.Caption}

	_, err := a.writePool.Exec(r.Context(), `
		INSERT INTO commerce.posts (id, author_id, media_id, post_type, caption, status, published_at)
		VALUES ($1,$2,$3,$4,$5,'published',NOW())`,
		postID, body.AuthorID, nullStr(body.MediaID), body.PostType, body.Caption)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	payloadJSON, _ := json.Marshal(payload)
	if err := a.scylla.Query(`
		INSERT INTO posts_by_author (author_id, post_ts, post_id, media_id, post_type, caption, payload)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		body.AuthorID, postTS, postID, body.MediaID, body.PostType, body.Caption, string(payloadJSON),
	).Exec(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	eventPayload := map[string]any{
		"post_id": postID, "author_id": body.AuthorID, "media_id": body.MediaID,
		"post_type": body.PostType, "caption": body.Caption, "post_ts": postTS.String(),
	}
	_ = outbox.Insert(r.Context(), a.writePool, outbox.Event{
		AggregateType: "post", AggregateID: postID, EventType: "posts.created",
		ShardKey: body.AuthorID, Payload: eventPayload,
	})

	wr := pkgkafka.NewWriter(a.brokers, topicPostsCreated)
	defer wr.Close()
	msg, _ := json.Marshal(eventPayload)
	_ = pkgkafka.PublishPartitioned(r.Context(), wr, []byte(body.AuthorID), msg)

	a.invalidateFeedCache(r.Context(), body.AuthorID)
	jsonOK(w, map[string]any{"post_id": postID, "post_ts": postTS.String(), "status": "published"})
}

func (a *feedApp) handleFollow(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.follow(w, r)
	case http.MethodDelete:
		a.unfollow(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *feedApp) follow(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FollowerID string `json:"follower_id"`
		FolloweeID string `json:"followee_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.FollowerID == "" || body.FolloweeID == "" || body.FollowerID == body.FolloweeID {
		http.Error(w, "follower_id and followee_id required", http.StatusBadRequest)
		return
	}
	now := time.Now()
	if err := a.scylla.Query(`
		INSERT INTO follow_graph (follower_id, followee_id, created_at) VALUES (?, ?, ?)`,
		body.FollowerID, body.FolloweeID, now,
	).Exec(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := a.scylla.Query(`
		INSERT INTO followers_by_user (followee_id, follower_id, created_at) VALUES (?, ?, ?)`,
		body.FolloweeID, body.FollowerID, now,
	).Exec(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var count int
	_ = a.scylla.Query(`SELECT COUNT(*) FROM followers_by_user WHERE followee_id = ?`, body.FolloweeID).Scan(&count)
	tier := "normal"
	if count >= a.hotThreshold {
		tier = "hot"
	}
	_ = a.scylla.Query(`
		INSERT INTO author_tier (author_id, tier, follower_count, updated_at) VALUES (?, ?, ?, ?)`,
		body.FolloweeID, tier, count, now,
	).Exec()

	go a.backfillTimeline(body.FollowerID, body.FolloweeID)
	a.invalidateFeedCache(r.Context(), body.FollowerID)
	jsonOK(w, map[string]any{"followed": true, "followee_followers": count, "tier": tier})
}

func (a *feedApp) unfollow(w http.ResponseWriter, r *http.Request) {
	follower := r.URL.Query().Get("follower_id")
	followee := r.URL.Query().Get("followee_id")
	if follower == "" || followee == "" {
		http.Error(w, "follower_id and followee_id required", http.StatusBadRequest)
		return
	}
	_ = a.scylla.Query(`DELETE FROM follow_graph WHERE follower_id = ? AND followee_id = ?`, follower, followee).Exec()
	_ = a.scylla.Query(`DELETE FROM followers_by_user WHERE followee_id = ? AND follower_id = ?`, followee, follower).Exec()
	a.invalidateFeedCache(r.Context(), follower)
	jsonOK(w, map[string]any{"unfollowed": true})
}

func (a *feedApp) handleFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	limit := queryInt(r, "limit", 20)
	cursor := r.URL.Query().Get("cursor")
	items, next, err := a.readTimeline(r.Context(), userID, cursor, limit, false)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.feedReads.Inc()
	jsonOK(w, map[string]any{"items": items, "next_cursor": next, "user_id": userID})
}

func (a *feedApp) handleFollowingFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	limit := queryInt(r, "limit", 20)
	cursor := r.URL.Query().Get("cursor")
	items, next, err := a.readTimeline(r.Context(), userID, cursor, limit, true)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"items": items, "next_cursor": next, "feed_type": "following"})
}

func (a *feedApp) handleForYouFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	limit := queryInt(r, "limit", 20)

	// Base timeline items
	items, _, err := a.readTimeline(r.Context(), userID, "", limit*2, false)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// P43: merge via rec-svc when available
	merged := items
	if a.recURL != "" {
		body, _ := json.Marshal(map[string]any{"user_id": userID, "organic": items, "limit": limit})
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, a.recURL+"/v1/merge", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			var out struct {
				Items []map[string]any `json:"items"`
			}
			_ = json.NewDecoder(resp.Body).Decode(&out)
			resp.Body.Close()
			if len(out.Items) > 0 {
				merged = out.Items
			}
		} else if resp != nil {
			resp.Body.Close()
		}
	}
	if len(merged) > limit {
		merged = merged[:limit]
	}
	a.forYouReads.Inc()
	jsonOK(w, map[string]any{"items": merged, "feed_type": "for_you", "user_id": userID})
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func queryInt(r *http.Request, key string, fallback int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return fallback
	}
	if n > 100 {
		return 100
	}
	return n
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
