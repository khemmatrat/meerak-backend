// cart-svc implements Epoch 9 P151: persisted buyer carts — add/remove/qty,
// coupon apply, and landed-cost preview (delegates cross-border math to
// shipping-svc). Cart count + totals are computed server-side.
package main

import (
	"bytes"
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
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool        *pgxpool.Pool
	router      *shard.Router
	region      *region.Router
	shippingURL string
	http        *http.Client
}

var (
	mAdds    atomic.Int64
	mCoupons atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:        pool,
		router:      shard.NewRouter(config.Int("SHARD_COUNT", 1)),
		region:      region.NewRouter(),
		shippingURL: config.Get("SHIPPING_URL", "http://shipping-svc:8127"),
		http:        &http.Client{Timeout: 4 * time.Second},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/cart", a.getCart)
	mux.HandleFunc("/v1/cart/items", a.addItem)
	mux.HandleFunc("/v1/cart/items/remove", a.removeItem)
	mux.HandleFunc("/v1/cart/coupon", a.applyCoupon)
	mux.HandleFunc("/v1/cart/preview", a.preview)
	mux.HandleFunc("/v1/cart/clear", a.clear)

	port := config.Int("PORT", 8133)
	log.Printf("cart-svc :%d p151", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "cart-svc", "p151": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_cart_adds_total %d\n", mAdds.Load())
	fmt.Fprintf(w, "aqond_cart_coupons_total %d\n", mCoupons.Load())
}

// ensureCart returns the active cart id for an owner (creating one if needed).
func (a *app) ensureCart(ctx context.Context, owner, regionCode string) (string, error) {
	var id string
	err := a.pool.QueryRow(ctx, `SELECT id FROM commerce.carts WHERE owner_id=$1 AND status='active'`, owner).Scan(&id)
	if err == nil {
		return id, nil
	}
	id = ulid.New()
	sk := a.router.ShardKey(owner)
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.carts (id, owner_id, shard_key, region) VALUES ($1,$2,$3,$4)
		ON CONFLICT (owner_id, status) DO NOTHING`, id, owner, sk, regionCode)
	if err != nil {
		return "", err
	}
	// re-read in case of conflict race
	_ = a.pool.QueryRow(ctx, `SELECT id FROM commerce.carts WHERE owner_id=$1 AND status='active'`, owner).Scan(&id)
	return id, nil
}

func (a *app) getCart(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner_id")
	if owner == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, owner, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	a.writeCart(w, ctx, cartID, owner)
}

func (a *app) addItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID    string `json:"owner_id"`
		ProductID  string `json:"product_id"`
		VariantID  string `json:"variant_id"`
		MerchantID string `json:"merchant_id"`
		Title      string `json:"title"`
		Qty        int    `json:"qty"`
		UnitMicro  int64  `json:"unit_price_micro"`
		Currency   string `json:"currency"`
		ImageURL   string `json:"image_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OwnerID == "" || body.ProductID == "" {
		http.Error(w, "owner_id and product_id required", http.StatusBadRequest)
		return
	}
	if body.Qty == 0 {
		body.Qty = 1
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	if body.Qty < 0 {
		// negative qty decrements; remove if it reaches zero
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.cart_items SET qty = qty + $3
			WHERE cart_id=$1 AND product_id=$2 AND COALESCE(variant_id,'')=COALESCE($4,'')`,
			cartID, body.ProductID, body.Qty, nullable(body.VariantID))
		_, _ = a.pool.Exec(ctx, `DELETE FROM commerce.cart_items WHERE cart_id=$1 AND qty<=0`, cartID)
	} else {
		id := ulid.New()
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.cart_items (id, cart_id, product_id, variant_id, merchant_id, title, qty, unit_price_micro, currency, image_url)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT (cart_id, product_id, COALESCE(variant_id,'')) DO UPDATE SET
				qty = commerce.cart_items.qty + EXCLUDED.qty,
				unit_price_micro = EXCLUDED.unit_price_micro,
				title = EXCLUDED.title, image_url = EXCLUDED.image_url`,
			id, cartID, body.ProductID, nullable(body.VariantID), body.MerchantID, body.Title, body.Qty, body.UnitMicro, body.Currency, nullable(body.ImageURL))
		if err != nil {
			httpErr(w, err)
			return
		}
		mAdds.Add(1)
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.carts SET updated_at=NOW() WHERE id=$1`, cartID)
	a.writeCart(w, ctx, cartID, body.OwnerID)
}

func (a *app) removeItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID   string `json:"owner_id"`
		ProductID string `json:"product_id"`
		VariantID string `json:"variant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `
		DELETE FROM commerce.cart_items WHERE cart_id=$1 AND product_id=$2 AND COALESCE(variant_id,'')=COALESCE($3,'')`,
		cartID, body.ProductID, nullable(body.VariantID))
	a.writeCart(w, ctx, cartID, body.OwnerID)
}

func (a *app) applyCoupon(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID string `json:"owner_id"`
		Code    string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(body.Code))
	if code != "" {
		var active bool
		if a.pool.QueryRow(ctx, `SELECT active FROM commerce.coupons WHERE code=$1`, code).Scan(&active) != nil || !active {
			http.Error(w, "invalid coupon", http.StatusUnprocessableEntity)
			return
		}
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.carts SET coupon_code=$2, updated_at=NOW() WHERE id=$1`, cartID, nullable(code))
	mCoupons.Add(1)
	a.writeCart(w, ctx, cartID, body.OwnerID)
}

func (a *app) clear(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID string `json:"owner_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `DELETE FROM commerce.cart_items WHERE cart_id=$1`, cartID)
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.carts SET coupon_code=NULL, updated_at=NOW() WHERE id=$1`, cartID)
	a.writeCart(w, ctx, cartID, body.OwnerID)
}

// preview returns cart totals + a landed-cost estimate from shipping-svc.
func (a *app) preview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID     string `json:"owner_id"`
		ToRegion    string `json:"to_region"`
		WeightGrams int    `json:"weight_grams"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, err := a.ensureCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	c := a.computeCart(ctx, cartID)
	if body.WeightGrams == 0 {
		body.WeightGrams = 500
	}
	landed := a.landedPreview(ctx, c.total, body.ToRegion, body.WeightGrams)
	jsonOK(w, map[string]any{
		"cart_id": cartID, "subtotal_micro": c.subtotal, "discount_micro": c.discount,
		"total_micro": c.total, "currency": c.currency, "count": c.count, "landed": landed,
	})
}

type cartTotals struct {
	subtotal, discount, total int64
	count                     int
	currency, coupon          string
}

func (a *app) computeCart(ctx context.Context, cartID string) cartTotals {
	var t cartTotals
	t.currency = "THB"
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(currency,'THB'), COALESCE(coupon_code,'') FROM commerce.carts WHERE id=$1`, cartID).
		Scan(&t.currency, &t.coupon)
	rows, err := a.pool.Query(ctx, `SELECT qty, unit_price_micro FROM commerce.cart_items WHERE cart_id=$1`, cartID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var qty int
			var unit int64
			if rows.Scan(&qty, &unit) == nil {
				t.subtotal += int64(qty) * unit
				t.count += qty
			}
		}
	}
	if t.coupon != "" {
		t.discount = a.couponDiscount(ctx, t.coupon, t.subtotal)
	}
	t.total = t.subtotal - t.discount
	if t.total < 0 {
		t.total = 0
	}
	return t
}

func (a *app) couponDiscount(ctx context.Context, code string, subtotal int64) int64 {
	var kind string
	var valueBps int
	var valueMicro, minSub int64
	var active bool
	err := a.pool.QueryRow(ctx, `
		SELECT kind, value_bps, value_micro, min_subtotal_micro, active FROM commerce.coupons WHERE code=$1`, code).
		Scan(&kind, &valueBps, &valueMicro, &minSub, &active)
	if err != nil || !active || subtotal < minSub {
		return 0
	}
	if kind == "percent" {
		return subtotal * int64(valueBps) / 10000
	}
	if valueMicro > subtotal {
		return subtotal
	}
	return valueMicro
}

func (a *app) writeCart(w http.ResponseWriter, ctx context.Context, cartID, owner string) {
	t := a.computeCart(ctx, cartID)
	rows, err := a.pool.Query(ctx, `
		SELECT product_id, COALESCE(variant_id,''), merchant_id, title, qty, unit_price_micro, COALESCE(image_url,'')
		FROM commerce.cart_items WHERE cart_id=$1 ORDER BY added_at`, cartID)
	var items []map[string]any
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pid, vid, mid, title, img string
			var qty int
			var unit int64
			if rows.Scan(&pid, &vid, &mid, &title, &qty, &unit, &img) == nil {
				items = append(items, map[string]any{
					"product_id": pid, "variant_id": vid, "merchant_id": mid, "title": title,
					"qty": qty, "unit_price_micro": unit, "line_micro": int64(qty) * unit, "image_url": img,
				})
			}
		}
	}
	jsonOK(w, map[string]any{
		"cart_id": cartID, "owner_id": owner, "items": items,
		"count": t.count, "subtotal_micro": t.subtotal, "discount_micro": t.discount,
		"total_micro": t.total, "currency": t.currency, "coupon_code": t.coupon,
	})
}

// landedPreview asks shipping-svc for a landed-cost estimate; degrades gracefully.
func (a *app) landedPreview(ctx context.Context, itemMicro int64, toRegion string, weight int) map[string]any {
	if toRegion == "" {
		return map[string]any{"available": false}
	}
	payload, _ := json.Marshal(map[string]any{
		"from_region": "TH", "to_region": toRegion, "item_micro": itemMicro, "weight_grams": weight,
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, a.shippingURL+"/v1/shipping/landed-cost", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.http.Do(req)
	if err != nil {
		return map[string]any{"available": false}
	}
	defer resp.Body.Close()
	var out map[string]any
	if json.NewDecoder(resp.Body).Decode(&out) != nil {
		return map[string]any{"available": false}
	}
	out["available"] = true
	return out
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
