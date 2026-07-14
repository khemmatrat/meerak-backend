package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
}

var (
	mReviews atomic.Int64
	mSpam    atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, router: shard.NewRouter(config.Int("SHARD_COUNT", 1))}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/reviews", a.reviews)
	mux.HandleFunc("/v1/reviews/vote", a.vote)
	mux.HandleFunc("/v1/reviews/summary", a.summary)

	port := config.Int("PORT", 8123)
	log.Printf("reviews-svc :%d p108", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "reviews-svc", "p108": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_reviews_total %d\n", mReviews.Load())
	fmt.Fprintf(w, "aqond_reviews_spam_flagged_total %d\n", mSpam.Load())
}

func (a *app) reviews(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.create(w, r)
	case http.MethodGet:
		a.list(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProductID  string `json:"product_id"`
		MerchantID string `json:"merchant_id"`
		AuthorID   string `json:"author_id"`
		OrderID    string `json:"order_id"`
		Rating     int    `json:"rating"`
		Title      string `json:"title"`
		Body       string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.ProductID == "" || body.AuthorID == "" || body.Rating < 1 || body.Rating > 5 {
		http.Error(w, "product_id, author_id, rating(1-5) required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	sk := a.router.ShardKey(body.MerchantID)

	verified := a.isVerifiedPurchase(ctx, body.AuthorID, body.ProductID, body.OrderID)
	spam := spamScore(body.Title, body.Body)
	status := "published"
	if spam >= 70 {
		status = "pending"
		mSpam.Add(1)
	}
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.reviews (id, product_id, merchant_id, shard_key, author_id, order_id, rating, title, body, verified_purchase, spam_score, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (product_id, author_id, order_id) DO UPDATE SET rating=EXCLUDED.rating, title=EXCLUDED.title, body=EXCLUDED.body`,
		id, body.ProductID, body.MerchantID, sk, body.AuthorID, nullable(body.OrderID), body.Rating, body.Title, body.Body, verified, spam, status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "review", AggregateID: id, EventType: "reviews.created", ShardKey: sk,
		Payload: map[string]any{"product_id": body.ProductID, "rating": body.Rating, "verified": verified, "status": status},
	})
	mReviews.Add(1)
	jsonOK(w, map[string]any{"review_id": id, "status": status, "verified_purchase": verified, "spam_score": spam})
}

func (a *app) isVerifiedPurchase(ctx context.Context, buyerID, productID, orderID string) bool {
	var n int
	if orderID != "" {
		_ = a.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM commerce.order_items oi
			JOIN commerce.orders o ON o.id = oi.order_id
			WHERE oi.product_id=$1 AND o.buyer_id=$2 AND o.id=$3 AND o.status IN ('confirmed','refunded')`,
			productID, buyerID, orderID).Scan(&n)
	} else {
		_ = a.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM commerce.order_items oi
			JOIN commerce.orders o ON o.id = oi.order_id
			WHERE oi.product_id=$1 AND o.buyer_id=$2 AND o.status IN ('confirmed','refunded')`,
			productID, buyerID).Scan(&n)
	}
	return n > 0
}

func (a *app) list(w http.ResponseWriter, r *http.Request) {
	productID := r.URL.Query().Get("product_id")
	authorID := r.URL.Query().Get("author_id")
	if productID == "" && authorID == "" {
		http.Error(w, "product_id or author_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var rows pgx.Rows
	var err error
	if authorID != "" {
		rows, err = a.pool.Query(ctx, `
			SELECT id, product_id, rating, title, body, verified_purchase, helpful_count, created_at
			FROM commerce.reviews WHERE author_id=$1 AND status='published'
			ORDER BY created_at DESC LIMIT 50`, authorID)
	} else {
		rows, err = a.pool.Query(ctx, `
			SELECT id, author_id, rating, title, body, verified_purchase, helpful_count, created_at
			FROM commerce.reviews WHERE product_id=$1 AND status='published'
			ORDER BY helpful_count DESC, created_at DESC LIMIT 50`, productID)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		if authorID != "" {
			var id, pid, title, body string
			var rating int
			var verified bool
			var helpful int64
			var created any
			if rows.Scan(&id, &pid, &rating, &title, &body, &verified, &helpful, &created) == nil {
				out = append(out, map[string]any{
					"id": id, "product_id": pid, "author_id": authorID,
					"rating": rating, "title": title, "body": body,
					"verified_purchase": verified, "helpful_count": helpful, "created_at": created,
				})
			}
			continue
		}
		var id, author, title, body string
		var rating int
		var verified bool
		var helpful int64
		var created any
		if rows.Scan(&id, &author, &rating, &title, &body, &verified, &helpful, &created) == nil {
			out = append(out, map[string]any{
				"id": id, "author_id": author, "rating": rating, "title": title, "body": body,
				"verified_purchase": verified, "helpful_count": helpful, "created_at": created,
			})
		}
	}
	jsonOK(w, map[string]any{"product_id": productID, "author_id": authorID, "reviews": out})
}

func (a *app) vote(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ReviewID string `json:"review_id"`
		VoterID  string `json:"voter_id"`
		Helpful  bool   `json:"helpful"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	tag, _ := a.pool.Exec(ctx, `
		INSERT INTO commerce.review_votes (review_id, voter_id, helpful) VALUES ($1,$2,$3)
		ON CONFLICT (review_id, voter_id) DO NOTHING`, body.ReviewID, body.VoterID, body.Helpful)
	if tag.RowsAffected() > 0 && body.Helpful {
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.reviews SET helpful_count=helpful_count+1 WHERE id=$1`, body.ReviewID)
	}
	jsonOK(w, map[string]any{"voted": true})
}

func (a *app) summary(w http.ResponseWriter, r *http.Request) {
	productID := r.URL.Query().Get("product_id")
	if productID == "" {
		http.Error(w, "product_id required", http.StatusBadRequest)
		return
	}
	var count int64
	var avg float64
	_ = a.pool.QueryRow(r.Context(), `
		SELECT COUNT(*), COALESCE(AVG(rating),0) FROM commerce.reviews WHERE product_id=$1 AND status='published'`,
		productID).Scan(&count, &avg)
	dist := map[int]int64{}
	rows, err := a.pool.Query(r.Context(), `
		SELECT rating, COUNT(*) FROM commerce.reviews WHERE product_id=$1 AND status='published' GROUP BY rating`, productID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var rt int
			var n int64
			if rows.Scan(&rt, &n) == nil {
				dist[rt] = n
			}
		}
	}
	jsonOK(w, map[string]any{"product_id": productID, "count": count, "avg_rating": avg, "distribution": dist})
}

// spamScore is a simple heuristic for fake/spam review detection (P108).
func spamScore(title, body string) int {
	score := 0
	text := strings.ToLower(title + " " + body)
	if len(strings.TrimSpace(body)) < 5 {
		score += 30
	}
	if strings.Contains(text, "http://") || strings.Contains(text, "https://") || strings.Contains(text, "www.") {
		score += 40
	}
	for _, w := range []string{"free money", "click here", "promo code", "telegram", "whatsapp"} {
		if strings.Contains(text, w) {
			score += 25
		}
	}
	if hasLongRepeat(text) {
		score += 20
	}
	if score > 100 {
		score = 100
	}
	return score
}

func hasLongRepeat(s string) bool {
	run, prev := 0, rune(0)
	for _, c := range s {
		if c == prev {
			run++
			if run >= 6 {
				return true
			}
		} else {
			run, prev = 0, c
		}
	}
	return false
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
