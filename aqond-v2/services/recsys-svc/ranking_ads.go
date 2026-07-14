package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/ulid"
)

// ---- P101: learned ranking model serving with safe heuristic fallback ----

type rankCandidate struct {
	ItemID    string             `json:"item_id"`
	ItemType  string             `json:"item_type"`
	BaseScore float64            `json:"base_score"`
	Features  map[string]float64 `json:"features"`
	Score     float64            `json:"score"`
}

func defaultWeights() map[string]float64 {
	return map[string]float64{
		"watch_time": 0.30, "like": 0.20, "completion": 0.25,
		"purchase_signals": 0.40, "freshness": 0.10, "base": 1.0,
	}
}

func (a *app) rank(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID     string          `json:"user_id"`
		Candidates []rankCandidate `json:"candidates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	weights, modelVer, learned := a.activeRanker(ctx)
	userFeat := a.numericFeatures(ctx, "user", body.UserID)

	for i := range body.Candidates {
		c := &body.Candidates[i]
		feat := map[string]float64{"base": c.BaseScore}
		for k, v := range a.numericFeatures(ctx, "item", c.ItemID) {
			feat[k] = v
		}
		for k, v := range c.Features {
			feat[k] = v
		}
		for k, v := range userFeat {
			if k == "purchase_signals" {
				feat[k] = v
			}
		}
		z := 0.0
		for k, wk := range weights {
			z += wk * feat[k]
		}
		if learned {
			c.Score = sigmoid(z) // learned scorer outputs a probability-like score
		} else {
			c.Score = c.BaseScore + z*0.01 // heuristic fallback
		}
		a.logFeatures(ctx, body.UserID, c.ItemID, feat, c.Score)
	}
	sort.Slice(body.Candidates, func(i, j int) bool { return body.Candidates[i].Score > body.Candidates[j].Score })
	mRanked.Add(1)
	jsonOK(w, map[string]any{"items": body.Candidates, "model_version": modelVer, "learned": learned})
}

// activeRanker loads the active learned model weights, falling back to heuristic.
func (a *app) activeRanker(ctx context.Context) (map[string]float64, string, bool) {
	if config.Get("RANKER_ENABLED", "1") != "1" {
		return defaultWeights(), "heuristic-fallback", false
	}
	var version string
	var metrics []byte
	err := a.pools.Read.QueryRow(ctx, `
		SELECT version, metrics FROM commerce.model_registry
		WHERE kind='ranker' AND status='active' ORDER BY created_at DESC LIMIT 1`).Scan(&version, &metrics)
	if err != nil {
		return defaultWeights(), "heuristic-fallback", false
	}
	var meta struct {
		Weights map[string]float64 `json:"weights"`
	}
	if json.Unmarshal(metrics, &meta) != nil || len(meta.Weights) == 0 {
		return defaultWeights(), version, true
	}
	return meta.Weights, version, true
}

func (a *app) logFeatures(ctx context.Context, userID, itemID string, feat map[string]float64, score float64) {
	rec, _ := json.Marshal(map[string]any{"user": userID, "item": itemID, "features": feat, "score": score, "ts": time.Now().Unix()})
	_ = a.redis.LPush(ctx, "ranker:featurelog", rec).Err()
	_ = a.redis.LTrim(ctx, "ranker:featurelog", 0, 9999).Err()
}

func (a *app) numericFeatures(ctx context.Context, entity, id string) map[string]float64 {
	out := map[string]float64{}
	if id == "" {
		return out
	}
	vals, _ := a.redis.HGetAll(ctx, "feat:"+entity+":"+id).Result()
	for k, v := range vals {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			out[k] = f
		}
	}
	return out
}

// P101: model registry — register / list / promote (with rollback safety).
func (a *app) models(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodGet {
		rows, err := a.pools.Read.Query(ctx, `SELECT id, kind, version, status, metrics, created_at FROM commerce.model_registry ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var list []map[string]any
		for rows.Next() {
			var id, kind, version, status string
			var metrics []byte
			var created time.Time
			if rows.Scan(&id, &kind, &version, &status, &metrics, &created) == nil {
				list = append(list, map[string]any{"id": id, "kind": kind, "version": version, "status": status, "metrics": json.RawMessage(metrics), "created_at": created})
			}
		}
		jsonOK(w, map[string]any{"models": list})
		return
	}
	var body struct {
		Kind     string         `json:"kind"`
		Version  string         `json:"version"`
		Status   string         `json:"status"`
		Metrics  map[string]any `json:"metrics"`
		Artifact string         `json:"artifact_ref"`
		Promote  bool           `json:"promote"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Kind == "" || body.Version == "" {
		http.Error(w, "kind and version required", http.StatusBadRequest)
		return
	}
	if body.Status == "" {
		body.Status = "shadow"
	}
	mj, _ := json.Marshal(body.Metrics)
	id := ulid.New()
	_, err := a.pools.Write.Exec(ctx, `
		INSERT INTO commerce.model_registry (id, kind, version, status, metrics, artifact_ref)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6)
		ON CONFLICT (kind, version) DO UPDATE SET status=EXCLUDED.status, metrics=EXCLUDED.metrics, artifact_ref=EXCLUDED.artifact_ref`,
		id, body.Kind, body.Version, body.Status, string(mj), nullable(body.Artifact))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if body.Promote || body.Status == "active" {
		// demote previously active to rollback, then activate this version
		_, _ = a.pools.Write.Exec(ctx, `UPDATE commerce.model_registry SET status='rollback' WHERE kind=$1 AND status='active' AND version<>$2`, body.Kind, body.Version)
		_, _ = a.pools.Write.Exec(ctx, `UPDATE commerce.model_registry SET status='active' WHERE kind=$1 AND version=$2`, body.Kind, body.Version)
	}
	jsonOK(w, map[string]any{"registered": body.Version, "kind": body.Kind})
}

// ---- P102: real-time signal loop with decay + counterfactual logging ----

func (a *app) streamSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID string  `json:"user_id"`
		ItemID string  `json:"item_id"`
		Signal string  `json:"signal"`
		Value  float64 `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Signal == "" {
		http.Error(w, "signal required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	decay := 0.95
	apply := func(entity, id string) {
		if id == "" {
			return
		}
		key := "feat:" + entity + ":" + id
		cur, _ := a.redis.HGet(ctx, key, body.Signal).Float64()
		next := cur*decay + body.Value
		a.redis.HSet(ctx, key, body.Signal, next)
		a.redis.HSet(ctx, key, "_updated", time.Now().Unix())
	}
	apply("user", body.UserID)
	apply("item", body.ItemID)
	// counterfactual log: what we knew at decision time
	cf, _ := json.Marshal(map[string]any{"user": body.UserID, "item": body.ItemID, "signal": body.Signal, "value": body.Value, "ts": time.Now().UnixMilli()})
	_ = a.redis.LPush(ctx, "signal:counterfactual", cf).Err()
	_ = a.redis.LTrim(ctx, "signal:counterfactual", 0, 49999).Err()
	mFeatureWrites.Add(1)
	jsonOK(w, map[string]any{"applied": true})
}

// ---- P103: ads ranking + second-price auction with budget pacing ----

func (a *app) auction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID string `json:"user_id"`
		Slots  int    `json:"slots"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Slots <= 0 {
		body.Slots = 2
	}
	ctx := r.Context()
	rows, err := a.pools.Read.Query(ctx, `
		SELECT c.id, c.merchant_id, c.bid_micro, c.daily_budget_micro, c.spent_micro,
		       COALESCE((SELECT est_ctr FROM commerce.ad_creatives cr WHERE cr.campaign_id=c.id AND cr.status='active' ORDER BY est_ctr DESC LIMIT 1), 0.02),
		       COALESCE((SELECT product_id FROM commerce.ad_creatives cr WHERE cr.campaign_id=c.id AND cr.status='active' LIMIT 1), '')
		FROM commerce.ad_campaigns c
		WHERE c.status='active'`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type bidder struct {
		CampaignID string  `json:"campaign_id"`
		MerchantID string  `json:"merchant_id"`
		ProductID  string  `json:"product_id"`
		Bid        int64   `json:"bid_micro"`
		PCTR       float64 `json:"pctr"`
		Rank       float64 `json:"rank"`
		Charge     int64   `json:"charge_micro"`
	}
	var bidders []bidder
	for rows.Next() {
		var id, mid, pid string
		var bid, budget, spent int64
		var pctr float64
		if rows.Scan(&id, &mid, &bid, &budget, &spent, &pctr, &pid) != nil {
			continue
		}
		if budget > 0 && spent >= budget { // pacing: skip depleted
			continue
		}
		// frequency cap per user/campaign
		if body.UserID != "" {
			cnt, _ := a.redis.Get(ctx, "adcap:"+body.UserID+":"+id).Int()
			if cnt >= config.Int("AD_FREQ_CAP", 3) {
				continue
			}
		}
		bidders = append(bidders, bidder{CampaignID: id, MerchantID: mid, ProductID: pid, Bid: bid, PCTR: pctr, Rank: pctr * float64(bid)})
	}
	sort.Slice(bidders, func(i, j int) bool { return bidders[i].Rank > bidders[j].Rank })

	winners := []bidder{}
	for i := 0; i < len(bidders) && len(winners) < body.Slots; i++ {
		b := bidders[i]
		// second-price: charge based on the next bidder's rank (GSP-style)
		charge := b.Bid
		if i+1 < len(bidders) && b.PCTR > 0 {
			charge = int64(bidders[i+1].Rank/b.PCTR) + 1
		}
		if charge > b.Bid {
			charge = b.Bid
		}
		b.Charge = charge
		winners = append(winners, b)
		_, _ = a.pools.Write.Exec(ctx, `UPDATE commerce.ad_campaigns SET spent_micro=spent_micro+$2, status=CASE WHEN daily_budget_micro>0 AND spent_micro+$2>=daily_budget_micro THEN 'depleted' ELSE status END, updated_at=NOW() WHERE id=$1`, b.CampaignID, charge)
		if body.UserID != "" {
			a.redis.Incr(ctx, "adcap:"+body.UserID+":"+b.CampaignID)
			a.redis.Expire(ctx, "adcap:"+body.UserID+":"+b.CampaignID, 24*time.Hour)
		}
	}
	mAuctions.Add(1)
	jsonOK(w, map[string]any{"winners": winners, "slots": body.Slots})
}

func (a *app) campaigns(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		merchantID := r.URL.Query().Get("merchant_id")
		if merchantID == "" {
			http.Error(w, "merchant_id required", http.StatusBadRequest)
			return
		}
		rows, err := a.pools.Read.Query(r.Context(), `
			SELECT c.id, c.name, c.bid_micro, c.daily_budget_micro, c.status, c.spent_micro,
			       cr.product_id, cr.headline, cr.est_ctr
			FROM commerce.ad_campaigns c
			LEFT JOIN commerce.ad_creatives cr ON cr.campaign_id = c.id AND cr.status='active'
			WHERE c.merchant_id=$1 ORDER BY c.created_at DESC LIMIT 30`, merchantID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var out []map[string]any
		for rows.Next() {
			var id, name, status, pid, headline string
			var bid, budget, spent int64
			var ctr float64
			if rows.Scan(&id, &name, &bid, &budget, &status, &spent, &pid, &headline, &ctr) == nil {
				out = append(out, map[string]any{
					"id": id, "name": name, "bid_micro": bid, "daily_budget_micro": budget,
					"status": status, "spent_micro": spent, "product_id": pid, "headline": headline, "est_ctr": ctr,
				})
			}
		}
		jsonOK(w, map[string]any{"merchant_id": merchantID, "campaigns": out})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		MerchantID  string `json:"merchant_id"`
		Name        string `json:"name"`
		BidMicro    int64  `json:"bid_micro"`
		DailyBudget int64  `json:"daily_budget_micro"`
		ProductID   string `json:"product_id"`
		Headline    string `json:"headline"`
		EstCTR      float64 `json:"est_ctr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	if body.EstCTR == 0 {
		body.EstCTR = 0.02
	}
	cid := ulid.New()
	_, err := a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.ad_campaigns (id, merchant_id, shard_key, name, bid_micro, daily_budget_micro, status)
		VALUES ($1,$2,$2,$3,$4,$5,'active')`, cid, body.MerchantID, body.Name, body.BidMicro, body.DailyBudget)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	crid := ulid.New()
	_, _ = a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.ad_creatives (id, campaign_id, product_id, headline, est_ctr, status)
		VALUES ($1,$2,$3,$4,$5,'active')`, crid, cid, nullable(body.ProductID), body.Headline, body.EstCTR)
	jsonOK(w, map[string]any{"campaign_id": cid, "creative_id": crid})
}

// ---- P104: affiliate / creator-product matching (commission + brand-safety aware) ----

func (a *app) affiliateLinks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CreatorID     string `json:"creator_id"`
		ProductID     string `json:"product_id"`
		MerchantID    string `json:"merchant_id"`
		CommissionBps int    `json:"commission_bps"`
		BrandSafe     *bool  `json:"brand_safe"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.CreatorID == "" || body.ProductID == "" {
		http.Error(w, "creator_id and product_id required", http.StatusBadRequest)
		return
	}
	if body.CommissionBps == 0 {
		body.CommissionBps = 500
	}
	safe := true
	if body.BrandSafe != nil {
		safe = *body.BrandSafe
	}
	id := ulid.New()
	_, err := a.pools.Write.Exec(r.Context(), `
		INSERT INTO commerce.affiliate_links (id, creator_id, product_id, merchant_id, shard_key, commission_bps, brand_safe, status)
		VALUES ($1,$2,$3,$4,$4,$5,$6,'active')
		ON CONFLICT (creator_id, product_id) DO UPDATE SET commission_bps=EXCLUDED.commission_bps, brand_safe=EXCLUDED.brand_safe`,
		id, body.CreatorID, body.ProductID, body.MerchantID, body.CommissionBps, safe)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"link_id": id})
}

func (a *app) affiliateMatch(w http.ResponseWriter, r *http.Request) {
	creatorID := r.URL.Query().Get("creator_id")
	if creatorID == "" {
		http.Error(w, "creator_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pools.Read.Query(r.Context(), `
		SELECT product_id, merchant_id, commission_bps, clicks, conversions
		FROM commerce.affiliate_links
		WHERE creator_id=$1 AND status='active' AND brand_safe=TRUE
		ORDER BY commission_bps DESC, conversions DESC LIMIT 50`, creatorID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var matches []map[string]any
	for rows.Next() {
		var pid, mid string
		var bps int
		var clicks, conv int64
		if rows.Scan(&pid, &mid, &bps, &clicks, &conv) == nil {
			cr := 0.0
			if clicks > 0 {
				cr = float64(conv) / float64(clicks)
			}
			matches = append(matches, map[string]any{
				"product_id": pid, "merchant_id": mid, "commission_bps": bps,
				"conversion_rate": cr, "expected_value": float64(bps) * (1 + cr),
			})
		}
	}
	jsonOK(w, map[string]any{"creator_id": creatorID, "matches": matches})
}

func sigmoid(z float64) float64 { return 1.0 / (1.0 + math.Exp(-z)) }

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
