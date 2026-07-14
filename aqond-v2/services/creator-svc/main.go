// creator-svc implements Epoch 11 P213-P225: EXP-AFFIL, EXP-MONEY, EXP-GIFT,
// EXP-LIVEAN, EXP-LIVEREC, EXP-FAN, EXP-SCHED, EXP-CMKT, EXP-CAMP, EXP-SUB, EXP-SOUND.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	region *region.Router
}

var mOps atomic.Int64

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, region: region.NewRouter()}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/studio", a.studio)
	mux.HandleFunc("/v1/affiliate/links", a.affiliateLinks)
	mux.HandleFunc("/v1/monetization", a.monetization)
	mux.HandleFunc("/v1/live/analytics", a.liveAnalytics)
	mux.HandleFunc("/v1/live/recordings", a.liveRecordings)
	mux.HandleFunc("/v1/live/gifts", a.liveGifts)
	mux.HandleFunc("/v1/fanclub", a.fanclub)
	mux.HandleFunc("/v1/schedule", a.schedule)
	mux.HandleFunc("/v1/marketplace", a.marketplace)
	mux.HandleFunc("/v1/campaigns", a.campaigns)
	mux.HandleFunc("/v1/subscriptions", a.subscriptions)
	mux.HandleFunc("/v1/sounds", a.sounds)

	port := config.Int("PORT", 8140)
	log.Printf("creator-svc :%d p213-p225", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "creator-svc", "p213_p225": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_creator_ops_total %d\n", mOps.Load())
}

func (a *app) creatorID(r *http.Request) string {
	id := r.URL.Query().Get("creator_id")
	if id == "" {
		id = r.Header.Get("X-User-Id")
	}
	return id
}

// studio aggregates dashboard for BFF P159.
func (a *app) studio(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	if cid == "" {
		http.Error(w, "creator_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	period := time.Now().Format("2006-01")
	var liveGifts, affiliate, ads, sub, payout int64
	_ = a.pool.QueryRow(ctx, `
		SELECT live_gifts_micro, affiliate_micro, ads_micro, subscription_micro, payout_micro
		FROM commerce.creator_revenue WHERE creator_id=$1 AND period=$2`, cid, period).
		Scan(&liveGifts, &affiliate, &ads, &sub, &payout)

	rows, _ := a.pool.Query(ctx, `SELECT id, product_id, short_code, clicks, conversions FROM commerce.affiliate_links WHERE creator_id=$1 AND active=TRUE LIMIT 20`, cid)
	defer rows.Close()
	var links []map[string]any
	for rows.Next() {
		var id, pid, code string
		var clicks, conv int
		if rows.Scan(&id, &pid, &code, &clicks, &conv) == nil {
			links = append(links, map[string]any{"id": id, "product_id": pid, "short_code": code, "clicks": clicks, "conversions": conv})
		}
	}

	srows, _ := a.pool.Query(ctx, `SELECT id, post_type, publish_at, status FROM commerce.scheduled_posts WHERE creator_id=$1 AND status='pending' ORDER BY publish_at LIMIT 10`, cid)
	defer srows.Close()
	var scheduled []map[string]any
	for srows.Next() {
		var id, pt, st string
		var pub time.Time
		if srows.Scan(&id, &pt, &pub, &st) == nil {
			scheduled = append(scheduled, map[string]any{"id": id, "post_type": pt, "publish_at": pub, "status": st})
		}
	}

	var views, followers, comments int
	_ = a.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(total_views),0), COALESCE(SUM(new_followers),0), COALESCE(SUM(comments),0)
		FROM commerce.live_analytics WHERE creator_id=$1`, cid).Scan(&views, &followers, &comments)

	mOps.Add(1)
	jsonOK(w, map[string]any{
		"creator_id": cid,
		"analytics": map[string]any{"views": views, "new_followers": followers, "comments": comments, "revenue_micro": liveGifts + affiliate + ads + sub},
		"revenue": map[string]any{"period": period, "live_gifts_micro": liveGifts, "affiliate_micro": affiliate, "ads_micro": ads, "subscription_micro": sub, "payout_micro": payout},
		"affiliate_links": links, "scheduled": scheduled,
	})
}

func (a *app) affiliateLinks(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			ProductID     string `json:"product_id"`
			CommissionBps int    `json:"commission_bps"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if cid == "" || body.ProductID == "" {
			http.Error(w, "creator_id and product_id required", http.StatusBadRequest)
			return
		}
		id := ulid.New()
		code := strings.ToLower(id[:8])
		if body.CommissionBps <= 0 {
			body.CommissionBps = 500
		}
		_, err := a.pool.Exec(ctx, `
			INSERT INTO commerce.affiliate_links (id, creator_id, product_id, commission_bps, short_code)
			VALUES ($1,$2,$3,$4,$5)`, id, cid, body.ProductID, body.CommissionBps, code)
		if err != nil {
			httpErr(w, err)
			return
		}
		mOps.Add(1)
		jsonOK(w, map[string]any{"id": id, "short_code": code})
		return
	}
	rows, err := a.pool.Query(ctx, `SELECT id, product_id, short_code, clicks, conversions, commission_bps FROM commerce.affiliate_links WHERE creator_id=$1`, cid)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, pid, code string
		var clicks, conv, bps int
		if rows.Scan(&id, &pid, &code, &clicks, &conv, &bps) == nil {
			out = append(out, map[string]any{"id": id, "product_id": pid, "short_code": code, "clicks": clicks, "conversions": conv, "commission_bps": bps})
		}
	}
	jsonOK(w, map[string]any{"creator_id": cid, "links": out})
}

func (a *app) monetization(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	period := r.URL.Query().Get("period")
	if period == "" {
		period = time.Now().Format("2006-01")
	}
	var liveGifts, affiliate, ads, sub, payout int64
	var currency string
	err := a.pool.QueryRow(r.Context(), `
		SELECT live_gifts_micro, affiliate_micro, ads_micro, subscription_micro, payout_micro, currency
		FROM commerce.creator_revenue WHERE creator_id=$1 AND period=$2`, cid, period).
		Scan(&liveGifts, &affiliate, &ads, &sub, &payout, &currency)
	if err != nil {
		jsonOK(w, map[string]any{"creator_id": cid, "period": period, "total_micro": 0, "currency": "THB"})
		return
	}
	jsonOK(w, map[string]any{
		"creator_id": cid, "period": period, "currency": currency,
		"live_gifts_micro": liveGifts, "affiliate_micro": affiliate, "ads_micro": ads,
		"subscription_micro": sub, "payout_micro": payout,
		"total_micro": liveGifts + affiliate + ads + sub,
	})
}

func (a *app) liveAnalytics(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	liveID := r.URL.Query().Get("live_id")
	ctx := r.Context()
	if liveID != "" {
		var views, peak, followers, comments, gifts, dur int
		err := a.pool.QueryRow(ctx, `
			SELECT total_views, peak_viewers, new_followers, comments, gifts_total, duration_sec
			FROM commerce.live_analytics WHERE live_id=$1`, liveID).
			Scan(&views, &peak, &followers, &comments, &gifts, &dur)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"live_id": liveID, "total_views": views, "peak_viewers": peak, "new_followers": followers, "comments": comments, "gifts_total": gifts, "duration_sec": dur})
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT live_id, total_views, peak_viewers, new_followers, comments, duration_sec
		FROM commerce.live_analytics WHERE creator_id=$1 ORDER BY ended_at DESC NULLS LAST LIMIT 20`, cid)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var lid string
		var views, peak, followers, comments, dur int
		if rows.Scan(&lid, &views, &peak, &followers, &comments, &dur) == nil {
			out = append(out, map[string]any{"live_id": lid, "total_views": views, "peak_viewers": peak, "new_followers": followers, "comments": comments, "duration_sec": dur})
		}
	}
	jsonOK(w, map[string]any{"creator_id": cid, "sessions": out})
}

func (a *app) liveRecordings(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, live_id, title, replay_url, duration_sec, scheduled_at, status
		FROM commerce.live_recordings WHERE creator_id=$1 ORDER BY COALESCE(published_at, scheduled_at) DESC LIMIT 20`, cid)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, lid, title, url, st string
		var dur int
		var sched *time.Time
		if rows.Scan(&id, &lid, &title, &url, &dur, &sched, &st) == nil {
			out = append(out, map[string]any{"id": id, "live_id": lid, "title": title, "replay_url": url, "duration_sec": dur, "scheduled_at": sched, "status": st})
		}
	}
	jsonOK(w, map[string]any{"creator_id": cid, "recordings": out})
}

func (a *app) liveGifts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct {
			LiveID    string `json:"live_id"`
			SenderID  string `json:"sender_id"`
			CreatorID string `json:"creator_id"`
			GiftKind  string `json:"gift_kind"`
			Diamonds  int    `json:"diamonds"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := ulid.New()
		amount := int64(body.Diamonds) * 10000
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.live_gifts (id, live_id, sender_id, creator_id, gift_kind, diamonds, amount_micro)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, body.LiveID, body.SenderID, body.CreatorID, body.GiftKind, body.Diamonds, amount)
		mOps.Add(1)
		jsonOK(w, map[string]any{"gift_id": id, "diamonds": body.Diamonds})
		return
	}
	liveID := r.URL.Query().Get("live_id")
	rows, _ := a.pool.Query(r.Context(), `
		SELECT id, sender_id, gift_kind, diamonds, amount_micro, created_at
		FROM commerce.live_gifts WHERE live_id=$1 ORDER BY created_at DESC LIMIT 50`, liveID)
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, sender, kind string
		var diamonds int
		var micro int64
		var created any
		if rows.Scan(&id, &sender, &kind, &diamonds, &micro, &created) == nil {
			out = append(out, map[string]any{"id": id, "sender_id": sender, "gift_kind": kind, "diamonds": diamonds, "amount_micro": micro})
		}
	}
	jsonOK(w, map[string]any{"live_id": liveID, "gifts": out})
}

func (a *app) fanclub(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	ctx := r.Context()
	var clubID, name string
	var tiers, members int
	err := a.pool.QueryRow(ctx, `SELECT id, name, tier_count, member_count FROM commerce.fan_clubs WHERE creator_id=$1`, cid).
		Scan(&clubID, &name, &tiers, &members)
	if err != nil {
		clubID = ulid.New()
		_, _ = a.pool.Exec(ctx, `INSERT INTO commerce.fan_clubs (id, creator_id, name) VALUES ($1,$2,$3)`, clubID, cid, "Fan Club")
		name = "Fan Club"
		tiers, members = 3, 0
	}
	jsonOK(w, map[string]any{"creator_id": cid, "club_id": clubID, "name": name, "tier_count": tiers, "member_count": members})
}

func (a *app) schedule(w http.ResponseWriter, r *http.Request) {
	cid := a.creatorID(r)
	if r.Method == http.MethodPost {
		var body struct {
			PostType  string         `json:"post_type"`
			PublishAt time.Time      `json:"publish_at"`
			Payload   map[string]any `json:"payload"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := ulid.New()
		payload, _ := json.Marshal(body.Payload)
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.scheduled_posts (id, creator_id, post_type, payload, publish_at)
			VALUES ($1,$2,$3,$4,$5)`, id, cid, body.PostType, payload, body.PublishAt)
		jsonOK(w, map[string]any{"id": id, "status": "pending"})
		return
	}
	rows, _ := a.pool.Query(r.Context(), `SELECT id, post_type, publish_at, status FROM commerce.scheduled_posts WHERE creator_id=$1 ORDER BY publish_at`, cid)
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, pt, st string
		var pub time.Time
		if rows.Scan(&id, &pt, &pub, &st) == nil {
			out = append(out, map[string]any{"id": id, "post_type": pt, "publish_at": pub, "status": st})
		}
	}
	jsonOK(w, map[string]any{"creator_id": cid, "scheduled": out})
}

func (a *app) marketplace(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, brand_id, title, budget_micro, commission_bps, ends_at
		FROM commerce.marketplace_campaigns
		WHERE active=TRUE AND (region='*' OR region=$1)`, reg)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, brand, title string
		var budget int64
		var bps int
		var ends *time.Time
		if rows.Scan(&id, &brand, &title, &budget, &bps, &ends) == nil {
			out = append(out, map[string]any{"id": id, "brand_id": brand, "title": title, "budget_micro": budget, "commission_bps": bps, "ends_at": ends})
		}
	}
	jsonOK(w, map[string]any{"campaigns": out})
}

func (a *app) campaigns(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = r.Header.Get("X-User-Id")
	}
	reg := a.region.FromRequest(r)
	if r.Method == http.MethodPost {
		var body struct{ CampaignID string `json:"campaign_id"` }
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.campaign_enrollments (campaign_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, body.CampaignID, userID)
		jsonOK(w, map[string]any{"enrolled": true})
		return
	}
	rows, _ := a.pool.Query(r.Context(), `
		SELECT c.id, c.slug, c.title, c.kind, c.reward_coins, COALESCE(e.progress,0), COALESCE(e.redeemed,FALSE)
		FROM commerce.community_campaigns c
		LEFT JOIN commerce.campaign_enrollments e ON e.campaign_id=c.id AND e.user_id=$1
		WHERE c.active=TRUE AND (c.region='*' OR c.region=$2)`, userID, reg)
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, slug, title, kind string
		var reward, progress int
		var redeemed bool
		if rows.Scan(&id, &slug, &title, &kind, &reward, &progress, &redeemed) == nil {
			out = append(out, map[string]any{"id": id, "slug": slug, "title": title, "kind": kind, "reward_coins": reward, "progress": progress, "redeemed": redeemed})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "campaigns": out})
}

func (a *app) subscriptions(w http.ResponseWriter, r *http.Request) {
	creatorID := r.URL.Query().Get("creator_id")
	subscriberID := r.URL.Query().Get("subscriber_id")
	if subscriberID == "" {
		subscriberID = r.Header.Get("X-User-Id")
	}
	if r.Method == http.MethodPost {
		id := ulid.New()
		expires := time.Now().AddDate(0, 1, 0)
		_, _ = a.pool.Exec(r.Context(), `
			INSERT INTO commerce.subscriptions (id, creator_id, subscriber_id, expires_at)
			VALUES ($1,$2,$3,$4) ON CONFLICT (creator_id, subscriber_id) DO UPDATE SET status='active', expires_at=EXCLUDED.expires_at`,
			id, creatorID, subscriberID, expires)
		jsonOK(w, map[string]any{"subscription_id": id, "status": "active"})
		return
	}
	rows, _ := a.pool.Query(r.Context(), `
		SELECT id, creator_id, tier, price_micro, currency, status, expires_at
		FROM commerce.subscriptions WHERE subscriber_id=$1 AND status='active'`, subscriberID)
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, cid, cur, st string
		var tier int
		var price int64
		var exp time.Time
		if rows.Scan(&id, &cid, &tier, &price, &cur, &st, &exp) == nil {
			out = append(out, map[string]any{"id": id, "creator_id": cid, "tier": tier, "price_micro": price, "currency": cur, "status": st, "expires_at": exp})
		}
	}
	jsonOK(w, map[string]any{"subscriber_id": subscriberID, "subscriptions": out})
}

func (a *app) sounds(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, title, artist, duration_sec, preview_url, usage_count, trending_score
		FROM commerce.sounds ORDER BY trending_score DESC LIMIT 30`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, title, artist, preview string
		var dur, usage, score int
		if rows.Scan(&id, &title, &artist, &dur, &preview, &usage, &score) == nil {
			out = append(out, map[string]any{"id": id, "title": title, "artist": artist, "duration_sec": dur, "preview_url": preview, "usage_count": usage, "trending_score": score})
		}
	}
	jsonOK(w, map[string]any{"sounds": out})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
