// bff-svc implements Epoch 9 P142: thin BFF aggregation layer — the only API
// surface the storefront/mobile clients call. Composes existing microservices
// into view models; no business logic duplication.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	client *svcClient
	region *region.Router
}

var (
	mHome    atomic.Int64
	mPDP     atomic.Int64
	mSearch  atomic.Int64
	mAuth    atomic.Int64
	mRUM     atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, client: newClient(), region: region.NewRouter()}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)

	// P142 context + aggregation
	mux.HandleFunc("/v1/context", a.context)       // locale/region/consent gate
	mux.HandleFunc("/v1/home", a.home)               // P148
	mux.HandleFunc("/v1/product", a.product)         // P149
	mux.HandleFunc("/v1/search", a.search)           // P150
	mux.HandleFunc("/v1/suggest", a.suggest)         // P150
	mux.HandleFunc("/v1/cart", a.cartGet)            // P151
	mux.HandleFunc("/v1/cart/items", a.cartAdd)      // P151
	mux.HandleFunc("/v1/cart/coupon", a.cartCoupon)  // P151
	// Phase 3 food delivery
	mux.HandleFunc("/v1/food/nearby", a.foodNearby)
	mux.HandleFunc("/v1/food/menu", a.foodMenu)
	mux.HandleFunc("/v1/food/cart", a.foodCartGet)
	mux.HandleFunc("/v1/food/cart/items", a.foodCartAdd)
	mux.HandleFunc("/v1/food/cart/delivery-mode", a.foodCartDeliveryMode)
	mux.HandleFunc("/v1/food/cart/clear", a.foodCartClear)
	mux.HandleFunc("/v1/checkout", a.checkoutView)   // P152
	mux.HandleFunc("/v1/checkout/place", a.checkoutPlace)
	mux.HandleFunc("/v1/orders", a.orders)           // P153
	mux.HandleFunc("/v1/wallet", a.wallet)           // P154
	mux.HandleFunc("/v1/account", a.account)
	mux.HandleFunc("/v1/account/address", a.accountAddress)         // P155
	mux.HandleFunc("/v1/feed", a.feed)               // P156
	mux.HandleFunc("/v1/creator/studio", a.studio) // P159
	mux.HandleFunc("/v1/reviews", a.reviewsProxy)    // P160
	mux.HandleFunc("/v1/settings", a.settingsProxy)  // P161
	mux.HandleFunc("/v1/activity", a.activityProxy)  // P162
	mux.HandleFunc("/v1/notifications", a.notifProxy)

	// P144 auth
	mux.HandleFunc("/v1/auth/login", a.login)
	mux.HandleFunc("/v1/auth/register", a.register)
	mux.HandleFunc("/v1/auth/otp/request", a.otpRequest)
	mux.HandleFunc("/v1/auth/otp/verify", a.otpVerify)
	mux.HandleFunc("/v1/auth/line", a.lineLogin)
	mux.HandleFunc("/v1/auth/line/login-url", a.lineLoginURL)
	mux.HandleFunc("/v1/auth/line/oauth/callback", a.lineOAuthCallback)
	mux.HandleFunc("/v1/auth/me", a.me)
	mux.HandleFunc("/v1/auth/logout", a.logout)

	// P147 RUM
	mux.HandleFunc("/v1/rum", a.rum)

	// P163 mobile shell metadata
	mux.HandleFunc("/v1/mobile/shell", a.mobileShell)

	// P165 offline packs
	mux.HandleFunc("/v1/offline/packs", a.offlinePacks)

	// P167 QR/share
	mux.HandleFunc("/v1/share/qr", a.shareQR)

	// Tier 3 AI persistence (commerce PG)
	mux.HandleFunc("/v1/ai/tier3/", a.aiTier3Router)
	mux.HandleFunc("/v1/ai/tier3", a.aiTier3Router)

	port := config.Int("PORT", 8132)
	log.Printf("bff-svc :%d p142", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "bff-svc", "p142": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_bff_home_total %d\n", mHome.Load())
	fmt.Fprintf(w, "aqond_bff_pdp_total %d\n", mPDP.Load())
	fmt.Fprintf(w, "aqond_bff_search_total %d\n", mSearch.Load())
	fmt.Fprintf(w, "aqond_bff_auth_total %d\n", mAuth.Load())
	fmt.Fprintf(w, "aqond_bff_rum_total %d\n", mRUM.Load())
}

// P142/P168: resolve locale + region + consent gate for the storefront shell.
func (a *app) context(w http.ResponseWriter, r *http.Request) {
	reg := a.region.FromRequest(r)
	locale := r.URL.Query().Get("locale")
	path := "/v1/locale/resolve?region=" + reg
	if locale != "" {
		path += "&locale=" + locale
	}
	var loc map[string]any
	_ = a.client.getJSON(r.Context(), a.client.urls["locale"], path, reg, r, &loc)

	// consent check for personalization (P124 gate)
	userID := r.Header.Get("X-User-Id")
	personalize := true
	if userID != "" {
		var cons map[string]any
		if a.client.getJSON(r.Context(), a.client.urls["settings"], "/v1/settings?user_id="+userID, reg, r, &cons) == nil {
			if s, ok := cons["settings"].(map[string]any); ok {
				if p, ok := s["personalization"].(bool); ok {
					personalize = p
				}
			}
		}
	}
	jsonOK(w, map[string]any{"region": reg, "locale": loc, "personalization_allowed": personalize})
}

// P148: home view model — products + recs + categories + promotions from production services.
func (a *app) home(w http.ResponseWriter, r *http.Request) {
	reg := a.regionOf(r)
	ctx := r.Context()
	userID := r.Header.Get("X-User-Id")

	var products map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["catalog"], "/v1/products?limit=12", reg, r, &products)

	var recs map[string]any
	if userID != "" {
		_ = a.client.postJSON(ctx, a.client.urls["recsys"], "/v1/rank", reg, r, map[string]any{
			"user_id": userID, "surface": "home", "limit": 8,
		}, &recs)
	}

	var cats map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["promo"], "/v1/categories?mall=1", reg, r, &cats)
	categories := cats["categories"]
	if categories == nil {
		categories = []any{}
	}

	var promos map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["promo"], "/v1/promotions", reg, r, &promos)
	promotions := promos["promotions"]
	if promotions == nil {
		promotions = []any{}
	}

	resp := map[string]any{
		"region": reg, "products": products, "recommendations": recs,
		"categories": categories, "promotions": promotions,
	}
	if ads := a.mergeLegacyAdsPromo(r); ads != nil {
		resp["sponsored"] = ads
	}

	mHome.Add(1)
	jsonOK(w, resp)
}

// P149: PDP view model — product + i18n + reviews + shipping options.
func (a *app) product(w http.ResponseWriter, r *http.Request) {
	pid := r.URL.Query().Get("id")
	if pid == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	reg := a.regionOf(r)
	ctx := r.Context()
	locale := r.URL.Query().Get("locale")
	if locale == "" {
		locale = "th-TH"
	}

	var prod map[string]any
	if err := a.client.getJSON(ctx, a.client.urls["catalog"], "/v1/products/"+pid, reg, r, &prod); err != nil {
		http.Error(w, "product not found", http.StatusNotFound)
		return
	}

	var i18n map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["locale"], fmt.Sprintf("/v1/product-i18n?product_id=%s&locale=%s", pid, locale), reg, r, &i18n)

	var reviews map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["reviews"], "/v1/reviews/summary?product_id="+pid, reg, r, &reviews)

	var price map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["locale"], fmt.Sprintf("/v1/price?product_id=%s&market=%s", pid, reg), reg, r, &price)

	var shipping map[string]any
	_ = a.client.postJSON(ctx, a.client.urls["shipping"], "/v1/shipping/quote", reg, r, map[string]any{
		"from_region": "TH", "to_region": reg, "weight_grams": 500,
	}, &shipping)

	mPDP.Add(1)
	jsonOK(w, map[string]any{
		"product": prod, "i18n": i18n, "reviews": reviews, "price": price, "shipping": shipping,
	})
}

// P150: search aggregation.
func (a *app) search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	tab := r.URL.Query().Get("tab")
	if tab == "" {
		tab = "products"
	}
	reg := a.regionOf(r)
	path := fmt.Sprintf("/v1/search?q=%s&tab=%s", q, tab)
	var out map[string]any
	if err := a.client.getJSON(r.Context(), a.client.urls["search"], path, reg, r, &out); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	mSearch.Add(1)
	jsonOK(w, out)
}

func (a *app) suggest(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	reg := a.regionOf(r)
	var out map[string]any
	if err := a.client.getJSON(r.Context(), a.client.urls["search"], "/v1/suggest?q="+q, reg, r, &out); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	jsonOK(w, out)
}

func (a *app) cartGet(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner_id")
	if owner == "" {
		owner = r.Header.Get("X-User-Id")
	}
	a.client.proxy(w, r, "cart", "/v1/cart?owner_id="+owner)
}

func (a *app) cartAdd(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "cart", "/v1/cart/items", body)
}

func (a *app) cartCoupon(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "cart", "/v1/cart/coupon", body)
}

// P152: checkout view model — cart + addresses + payment methods + tax.
func (a *app) checkoutView(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner_id")
	if owner == "" {
		owner = r.Header.Get("X-User-Id")
	}
	reg := a.regionOf(r)
	ctx := r.Context()

	var cart, addresses, methods, tax map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["cart"], "/v1/cart?owner_id="+owner, reg, r, &cart)
	_ = a.client.getJSON(ctx, a.client.urls["address"], "/v1/address?owner_id="+owner, reg, r, &addresses)
	_ = a.client.getJSON(ctx, a.client.urls["policy"], "/v1/payment-methods?region="+reg, reg, r, &methods)

	totalMicro := int64(0)
	if t, ok := cart["total_micro"].(float64); ok {
		totalMicro = int64(t)
	}
	_ = a.client.postJSON(ctx, a.client.urls["locale"], "/v1/tax/quote", reg, r, map[string]any{
		"market": reg, "amount_micro": totalMicro, "currency": "THB",
	}, &tax)

	jsonOK(w, map[string]any{"cart": cart, "addresses": addresses, "payment_methods": methods, "tax": tax})
}

func (a *app) checkoutPlace(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "checkout", "/v1/checkout", body)
}

func (a *app) orders(w http.ResponseWriter, r *http.Request) {
	buyer := r.URL.Query().Get("buyer_id")
	if buyer == "" {
		buyer = r.Header.Get("X-User-Id")
	}
	reg := a.regionOf(r)
	var out map[string]any
	if err := a.client.getJSON(r.Context(), a.client.urls["order"], "/v1/orders?buyer_id="+buyer, reg, r, &out); err != nil {
		jsonOK(w, map[string]any{"buyer_id": buyer, "orders": []any{}})
		return
	}
	jsonOK(w, out)
}

func (a *app) wallet(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = r.Header.Get("X-User-Id")
	}
	reg := a.regionOf(r)
	ctx := r.Context()

	var balance, ledger, coins, coupons map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["wallet"], "/v1/balance?owner_id="+userID+"&owner_type=buyer", reg, r, &balance)
	_ = a.client.getJSON(ctx, a.client.urls["wallet"], "/v1/ledger?owner_id="+userID, reg, r, &ledger)
	_ = a.client.getJSON(ctx, a.client.urls["coins"], "/v1/coins?user_id="+userID, reg, r, &coins)
	_ = a.client.getJSON(ctx, a.client.urls["coupon"], "/v1/coupons/wallet?user_id="+userID, reg, r, &coupons)

	balMicro := int64(0)
	if v, ok := balance["balance_micro"].(float64); ok {
		balMicro = int64(v)
	}
	coinBal := 0
	if v, ok := coins["balance"].(float64); ok {
		coinBal = int(v)
	}
	couponList := coupons["coupons"]
	if couponList == nil {
		couponList = []any{}
	}
	txns := ledger["entries"]
	if txns == nil {
		txns = []any{}
	}

	jsonOK(w, map[string]any{
		"balance_micro": balMicro, "currency": balance["currency"],
		"coins": coinBal, "coupons": couponList, "transactions": txns,
	})
}

func (a *app) account(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-Id")
	reg := a.regionOf(r)
	ctx := r.Context()
	var settings, addresses, profile map[string]any
	_ = a.client.getJSON(ctx, a.client.urls["settings"], "/v1/settings?user_id="+userID, reg, r, &settings)
	_ = a.client.getJSON(ctx, a.client.urls["address"], "/v1/address?owner_id="+userID, reg, r, &addresses)
	_ = a.client.getJSON(ctx, a.client.urls["account"], "/v1/profile?user_id="+userID, reg, r, &profile)
	addrList := addresses
	if nested, ok := addresses["addresses"].([]any); ok {
		addrList = map[string]any{"items": nested}
	}
	jsonOK(w, map[string]any{"user_id": userID, "settings": settings, "addresses": addrList, "profile": profile})
}

func (a *app) accountAddress(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "address", "/v1/address", body)
}

// P156: feed view model.
func (a *app) feed(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "for-you"
	}
	reg := a.regionOf(r)
	path := "/v1/feed/for-you"
	if kind == "following" {
		path = "/v1/feed/following"
	}
	userID := r.Header.Get("X-User-Id")
	path += "?user_id=" + userID
	var out map[string]any
	if err := a.client.getJSON(r.Context(), a.client.urls["feed"], path, reg, r, &out); err != nil {
		jsonOK(w, map[string]any{"posts": []any{}, "kind": kind})
		return
	}
	jsonOK(w, out)
}

func (a *app) studio(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-Id")
	reg := a.regionOf(r)
	var out map[string]any
	if err := a.client.getJSON(r.Context(), a.client.urls["creator"], "/v1/studio?creator_id="+userID, reg, r, &out); err != nil {
		jsonOK(w, map[string]any{"creator_id": userID, "posts": []any{}, "analytics": map[string]any{"views": 0, "revenue_micro": 0}})
		return
	}
	jsonOK(w, out)
}

func (a *app) reviewsProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		pid := r.URL.Query().Get("product_id")
		a.client.proxy(w, r, "reviews", "/v1/reviews?product_id="+pid)
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	a.client.proxyPost(w, r, "reviews", "/v1/reviews", body)
}

func (a *app) settingsProxy(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-Id")
	if r.Method == http.MethodGet {
		a.client.proxy(w, r, "settings", "/v1/settings?user_id="+userID)
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	a.client.proxyPost(w, r, "settings", "/v1/settings", body)
}

func (a *app) activityProxy(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-Id")
	a.client.proxy(w, r, "settings", "/v1/activity?user_id="+userID)
}

func (a *app) notifProxy(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-Id")
	a.client.proxy(w, r, "settings", "/v1/settings/notifications?user_id="+userID)
}

// P144: dev-lite auth — creates a session token bound to user_sessions.
func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Device   string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	userID := "user-" + strings.Split(body.Email, "@")[0]
	token := newToken()
	hash := sha256Hex(token)
	sid := ulid.New()
	ctx := r.Context()
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.user_sessions (id, user_id, device, ip, user_agent, token_hash, auth_method)
		VALUES ($1,$2,$3,$4,$5,$6,'email')`,
		sid, userID, body.Device, r.RemoteAddr, r.UserAgent(), hash)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, userID)
	mAuth.Add(1)
	jsonOK(w, map[string]any{"token": token, "session_id": sid, "user_id": userID})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	a.login(w, r) // dev-lite: same flow
}

func (a *app) me(w http.ResponseWriter, r *http.Request) {
	sid := r.Header.Get("X-Session-Id")
	token := bearerToken(r)
	if uid, ok := a.validateSession(r.Context(), sid, token); ok {
		jsonOK(w, map[string]any{"user_id": uid, "authenticated": true})
		return
	}
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	sid := r.Header.Get("X-Session-Id")
	if sid != "" {
		_, _ = a.pool.Exec(r.Context(), `UPDATE commerce.user_sessions SET revoked=TRUE WHERE id=$1`, sid)
	}
	jsonOK(w, map[string]any{"logged_out": true})
}

// P147: ingest Core Web Vitals samples.
func (a *app) rum(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Region string  `json:"region"`
		Route  string  `json:"route"`
		Metric string  `json:"metric"`
		Value  float64 `json:"value"`
		Rating string  `json:"rating"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = a.regionOf(r)
	}
	_, _ = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.rum_samples (region, route, metric, value, rating) VALUES ($1,$2,$3,$4,$5)`,
		body.Region, body.Route, body.Metric, body.Value, body.Rating)
	mRUM.Add(1)
	jsonOK(w, map[string]any{"recorded": true})
}

// P163: Lynx-style mobile shell metadata (shared BFF view models + nav).
func (a *app) mobileShell(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]any{
		"engine": "lynx-style", "version": "1.0",
		"tabs": []map[string]string{
			{"id": "home", "route": "/m/home", "embed": "/storefront?p=/m/home"},
			{"id": "food", "route": "/m/food", "embed": "/storefront?p=/m/food"},
			{"id": "cart", "route": "/m/cart", "embed": "/storefront?p=/m/cart"},
			{"id": "account", "route": "/m/account", "embed": "/storefront?p=/m/account"},
		},
		"bff_base":    "/api/v2/merchant",
		"food_base":   "/api/v2/merchant/food",
		"rider_base":  "/api/v2/rider-merch",
		"legacy_base": "/api",
		"storefront_handoff": "/m/auth/handoff",
	})
}

// P165: offline download pack definitions.
func (a *app) offlinePacks(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{
		"packs": []map[string]any{
			{"quality": "480p", "max_mb": 60},
			{"quality": "720p", "max_mb": 120},
			{"quality": "1080p", "max_mb": 240},
		},
	})
}

// P167: QR/share payload for profile or product.
func (a *app) shareQR(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	ref := r.URL.Query().Get("ref")
	if kind == "" || ref == "" {
		http.Error(w, "kind and ref required", http.StatusBadRequest)
		return
	}
	deepLink := fmt.Sprintf("https://aqond.app/%s/%s", kind, ref)
	jsonOK(w, map[string]any{
		"kind": kind, "ref": ref, "deep_link": deepLink,
		"qr_payload": deepLink, "copy_link": deepLink,
	})
}

func (a *app) foodNearby(w http.ResponseWriter, r *http.Request) {
	sort := r.URL.Query().Get("sort")
	path := "/v1/food/nearby"
	if sort != "" {
		path += "?sort=" + sort
	}
	a.client.proxy(w, r, "food", path)
}

func (a *app) foodMenu(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	a.client.proxy(w, r, "food", "/v1/food/menu?merchant_id="+merchantID)
}

func (a *app) foodCartGet(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner_id")
	if owner == "" {
		owner = r.Header.Get("X-User-Id")
	}
	a.client.proxy(w, r, "food", "/v1/food/cart?owner_id="+owner)
}

func (a *app) foodCartAdd(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "food", "/v1/food/cart/items", body)
}

func (a *app) foodCartDeliveryMode(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "food", "/v1/food/cart/delivery-mode", body)
}

func (a *app) foodCartClear(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	a.client.proxyPost(w, r, "food", "/v1/food/cart/clear", body)
}

func (a *app) regionOf(r *http.Request) string {
	return a.region.FromRequest(r)
}

func newToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
