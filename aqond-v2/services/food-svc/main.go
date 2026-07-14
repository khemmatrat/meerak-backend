// food-svc — Phase 3 restaurant catalog, menu CRUD, food carts, delivery quote engine.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
	region *region.Router
}

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:   pool,
		router: shard.NewRouter(config.Int("SHARD_COUNT", 1)),
		region: region.NewRouter(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/v1/food/nearby", a.nearby)
	mux.HandleFunc("/v1/food/menu", a.menu)
	mux.HandleFunc("/v1/food/menu/items", a.menuItems)
	mux.HandleFunc("/v1/food/menu/bulk", a.menuBulk)
	mux.HandleFunc("/v1/food/cart", a.cartGet)
	mux.HandleFunc("/v1/food/cart/items", a.cartAdd)
	mux.HandleFunc("/v1/food/cart/delivery-mode", a.cartDeliveryMode)
	mux.HandleFunc("/v1/food/cart/clear", a.cartClear)
	mux.HandleFunc("/v1/food/delivery/quote", a.deliveryQuote)

	port := config.Int("PORT", 8141)
	log.Printf("food-svc :%d phase3", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "food-svc", "phase": 3})
}

func (a *app) nearby(w http.ResponseWriter, r *http.Request) {
	sortBy := r.URL.Query().Get("sort")
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, name, cuisine, emoji, rating, review_count, distance_km, prep_min,
		       delivery_fee_micro, min_order_micro, open_default, tags, zone_id, lat, lng
		FROM commerce.food_restaurants ORDER BY distance_km`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()

	var list []map[string]any
	for rows.Next() {
		rest, err := scanRestaurant(rows.Scan)
		if err != nil {
			continue
		}
		etaMin, etaMax := estimateEta(rest)
		list = append(list, map[string]any{
			"id": rest.ID, "name": rest.Name, "cuisine": rest.Cuisine, "emoji": rest.Emoji,
			"rating": rest.Rating, "review_count": rest.ReviewCount, "distance_km": rest.DistanceKm,
			"prep_min": rest.PrepMin, "delivery_fee_micro": rest.DeliveryFeeMicro,
			"min_order_micro": rest.MinOrderMicro, "open": rest.Open, "tags": rest.Tags,
			"zone_id": rest.ZoneID, "lat": rest.Lat, "lng": rest.Lng,
			"eta": map[string]any{
				"prep_min": rest.PrepMin, "travel_min": int(math.Max(5, math.Round(rest.DistanceKm*5+4))),
				"eta_min": etaMin, "eta_max": etaMax,
				"label": itoa(etaMin) + "–" + itoa(etaMax) + " นาที",
			},
		})
	}

	sort.Slice(list, func(i, j int) bool {
		oi, _ := list[i]["open"].(bool)
		oj, _ := list[j]["open"].(bool)
		if oi != oj {
			return oi
		}
		if sortBy == "rating" {
			ri, _ := list[i]["rating"].(float64)
			rj, _ := list[j]["rating"].(float64)
			return ri > rj
		}
		di, _ := list[i]["distance_km"].(float64)
		dj, _ := list[j]["distance_km"].(float64)
		return di < dj
	})

	jsonOK(w, map[string]any{"restaurants": list, "source": "food-svc"})
}

func (a *app) menu(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		a.menuDelete(w, r)
		return
	}
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	rest, err := a.loadRestaurant(ctx, merchantID)
	if err != nil {
		http.Error(w, "restaurant_not_found", http.StatusNotFound)
		return
	}
	etaMin, etaMax := estimateEta(rest)
	menu, err := a.loadMenuItems(ctx, merchantID)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{
		"restaurant": map[string]any{
			"id": rest.ID, "name": rest.Name, "cuisine": rest.Cuisine, "emoji": rest.Emoji,
			"rating": rest.Rating, "review_count": rest.ReviewCount, "distance_km": rest.DistanceKm,
			"prep_min": rest.PrepMin, "delivery_fee_micro": rest.DeliveryFeeMicro,
			"min_order_micro": rest.MinOrderMicro, "open": rest.Open, "tags": rest.Tags,
			"zone_id": rest.ZoneID, "lat": rest.Lat, "lng": rest.Lng,
			"eta": map[string]any{
				"prep_min": rest.PrepMin, "travel_min": int(math.Max(5, math.Round(rest.DistanceKm*5+4))),
				"eta_min": etaMin, "eta_max": etaMax,
				"label": itoa(etaMin) + "–" + itoa(etaMax) + " นาที",
			},
		},
		"menu": menu,
	})
}

func (a *app) menuItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		MerchantID  string `json:"merchant_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		PriceMicro  int64  `json:"price_micro"`
		Spicy       bool   `json:"spicy"`
		Popular     bool   `json:"popular"`
		Options     []any  `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" || strings.TrimSpace(body.Title) == "" {
		http.Error(w, "merchant_id and title required", http.StatusBadRequest)
		return
	}
	if body.PriceMicro < 100 {
		http.Error(w, "price_micro invalid", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if _, err := a.loadRestaurant(ctx, body.MerchantID); err != nil {
		http.Error(w, "restaurant_not_found", http.StatusNotFound)
		return
	}
	id := "dish-" + ulid.New()[:8]
	var optsJSON []byte
	if len(body.Options) > 0 {
		optsJSON, _ = json.Marshal(body.Options)
	}
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.food_menu_items (id, merchant_id, title, description, price_micro, spicy, popular, options_json)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		id, body.MerchantID, strings.TrimSpace(body.Title), nullableStr(body.Description),
		body.PriceMicro, body.Spicy, body.Popular, nullableBytes(optsJSON))
	if err != nil {
		httpErr(w, err)
		return
	}
	item, _ := a.loadMenuItem(ctx, id)
	jsonOK(w, map[string]any{"ok": true, "item": item})
}

func (a *app) menuDelete(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	itemID := r.URL.Query().Get("item_id")
	if merchantID == "" || itemID == "" {
		http.Error(w, "merchant_id and item_id required", http.StatusBadRequest)
		return
	}
	tag, err := a.pool.Exec(r.Context(), `
		DELETE FROM commerce.food_menu_items WHERE merchant_id=$1 AND id=$2`, merchantID, itemID)
	if err != nil {
		httpErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"ok": true})
}

func (a *app) cartGet(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner_id")
	if owner == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	cartID, mode, err := a.ensureFoodCart(r.Context(), owner, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	a.writeFoodCart(w, r.Context(), cartID, owner, mode)
}

func (a *app) cartAdd(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID        string           `json:"owner_id"`
		MerchantID     string           `json:"merchant_id"`
		ItemID         string           `json:"item_id"`
		Title          string           `json:"title"`
		Description    string           `json:"description"`
		ImageURL       string           `json:"image_url"`
		Qty            int              `json:"qty"`
		UnitPriceMicro int64            `json:"unit_price_micro"`
		Options        []map[string]any `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OwnerID == "" || body.MerchantID == "" || body.ItemID == "" {
		http.Error(w, "owner_id, merchant_id, item_id required", http.StatusBadRequest)
		return
	}
	if body.Qty == 0 {
		body.Qty = 1
	}
	ctx := r.Context()
	cartID, mode, err := a.ensureFoodCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	sig := optionsSignature(body.Options)
	var optsJSON []byte
	if len(body.Options) > 0 {
		optsJSON, _ = json.Marshal(body.Options)
	}
	var existingID string
	err = a.pool.QueryRow(ctx, `
		SELECT id FROM commerce.food_cart_items
		WHERE cart_id=$1 AND item_id=$2 AND options_sig=$3`, cartID, body.ItemID, sig).Scan(&existingID)
	if err == nil {
		_, err = a.pool.Exec(ctx, `
			UPDATE commerce.food_cart_items SET qty = qty + $2, title=$3, description=$4, image_url=$5,
			  unit_price_micro=$6, options_json=$7
			WHERE id=$1`, existingID, body.Qty, body.Title, nullableStr(body.Description),
			nullableStr(body.ImageURL), body.UnitPriceMicro, nullableBytes(optsJSON))
	} else {
		id := ulid.New()
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.food_cart_items
			  (id, cart_id, item_id, merchant_id, title, description, image_url, qty, unit_price_micro, options_json, options_sig)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, cartID, body.ItemID, body.MerchantID, body.Title, nullableStr(body.Description),
			nullableStr(body.ImageURL), body.Qty, body.UnitPriceMicro, nullableBytes(optsJSON), sig)
	}
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.food_carts SET updated_at=NOW() WHERE id=$1`, cartID)
	a.writeFoodCart(w, ctx, cartID, body.OwnerID, mode)
}

func (a *app) cartDeliveryMode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID      string `json:"owner_id"`
		DeliveryMode string `json:"delivery_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OwnerID == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	mode := deliveryMode(body.DeliveryMode)
	if mode == "" {
		mode = modeNormal
	}
	ctx := r.Context()
	cartID, _, err := a.ensureFoodCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.food_carts SET delivery_mode=$2, updated_at=NOW() WHERE id=$1`, cartID, string(mode))
	a.writeFoodCart(w, ctx, cartID, body.OwnerID, mode)
}

func (a *app) cartClear(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID string `json:"owner_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	cartID, mode, err := a.ensureFoodCart(ctx, body.OwnerID, a.region.FromRequest(r))
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `DELETE FROM commerce.food_cart_items WHERE cart_id=$1`, cartID)
	a.writeFoodCart(w, ctx, cartID, body.OwnerID, mode)
}

func (a *app) deliveryQuote(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantIDs  []string     `json:"merchant_ids"`
		DeliveryMode deliveryMode `json:"delivery_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var restaurants []restaurantRow
	for _, mid := range body.MerchantIDs {
		rest, err := a.loadRestaurant(ctx, mid)
		if err == nil {
			restaurants = append(restaurants, rest)
		}
	}
	q := quoteFoodDelivery(restaurants, body.DeliveryMode)
	jsonOK(w, q)
}

func (a *app) ensureFoodCart(ctx context.Context, owner, regionCode string) (string, deliveryMode, error) {
	var id, mode string
	err := a.pool.QueryRow(ctx, `SELECT id, delivery_mode FROM commerce.food_carts WHERE owner_id=$1`, owner).Scan(&id, &mode)
	if err == nil {
		return id, deliveryMode(mode), nil
	}
	id = ulid.New()
	sk := a.router.ShardKey(owner)
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.food_carts (id, owner_id, shard_key, region, delivery_mode)
		VALUES ($1,$2,$3,$4,'normal') ON CONFLICT (owner_id) DO NOTHING`, id, owner, sk, regionCode)
	if err != nil {
		return "", modeNormal, err
	}
	_ = a.pool.QueryRow(ctx, `SELECT id, delivery_mode FROM commerce.food_carts WHERE owner_id=$1`, owner).Scan(&id, &mode)
	return id, deliveryMode(mode), nil
}

func (a *app) writeFoodCart(w http.ResponseWriter, ctx context.Context, cartID, owner string, mode deliveryMode) {
	rows, err := a.pool.Query(ctx, `
		SELECT item_id, merchant_id, title, description, image_url, qty, unit_price_micro, options_json
		FROM commerce.food_cart_items WHERE cart_id=$1 ORDER BY added_at`, cartID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()

	type cartItem struct {
		ItemID         string
		MerchantID     string
		Title          string
		Description    *string
		ImageURL       *string
		Qty            int
		UnitPriceMicro int64
		Options        []map[string]any
	}
	var items []cartItem
	merchantSet := map[string]bool{}
	for rows.Next() {
		var it cartItem
		var desc, img *string
		var optsRaw []byte
		if rows.Scan(&it.ItemID, &it.MerchantID, &it.Title, &desc, &img, &it.Qty, &it.UnitPriceMicro, &optsRaw) != nil {
			continue
		}
		it.Description = desc
		it.ImageURL = img
		if len(optsRaw) > 0 {
			_ = json.Unmarshal(optsRaw, &it.Options)
		}
		items = append(items, it)
		merchantSet[it.MerchantID] = true
	}

	merchantIDs := make([]string, 0, len(merchantSet))
	for mid := range merchantSet {
		merchantIDs = append(merchantIDs, mid)
	}
	sort.Strings(merchantIDs)

	var restaurants []restaurantRow
	for _, mid := range merchantIDs {
		if rest, err := a.loadRestaurant(ctx, mid); err == nil {
			restaurants = append(restaurants, rest)
		}
	}
	quote := quoteFoodDelivery(restaurants, mode)

	shops := make([]map[string]any, 0, len(merchantIDs))
	for _, mid := range merchantIDs {
		var shopItems []map[string]any
		var subtotal int64
		var rest *restaurantRow
		for i := range restaurants {
			if restaurants[i].ID == mid {
				rest = &restaurants[i]
				break
			}
		}
		for _, it := range items {
			if it.MerchantID != mid {
				continue
			}
			lineUnit := lineUnitMicro(it.UnitPriceMicro, it.Options)
			subtotal += lineUnit * int64(it.Qty)
			m := map[string]any{
				"item_id": it.ItemID, "merchant_id": it.MerchantID, "title": it.Title,
				"qty": it.Qty, "unit_price_micro": it.UnitPriceMicro,
			}
			if it.Description != nil {
				m["description"] = *it.Description
			}
			if it.ImageURL != nil {
				m["image_url"] = *it.ImageURL
			}
			if len(it.Options) > 0 {
				m["options"] = it.Options
			}
			shopItems = append(shopItems, m)
		}
		minOrder := int64(0)
		if rest != nil {
			minOrder = rest.MinOrderMicro
		}
		if len(merchantIDs) > 1 && quote.BatchEligible {
			minOrder = int64(math.Min(float64(minOrder), 6500))
		}
		meets := subtotal >= minOrder
		deliveryCharged := int64(0)
		for _, p := range quote.PerShop {
			if p.MerchantID == mid {
				deliveryCharged = p.ChargedMicro
				break
			}
		}
		shop := map[string]any{
			"merchant_id": mid, "items": shopItems, "subtotal_micro": subtotal,
			"min_order_micro": minOrder, "meets_minimum": meets,
			"shortfall_micro": int64(0), "delivery_charged_micro": deliveryCharged,
		}
		if !meets {
			shop["shortfall_micro"] = minOrder - subtotal
		}
		if rest != nil {
			shop["merchant_name"] = rest.Name
			shop["emoji"] = rest.Emoji
			shop["cuisine"] = rest.Cuisine
			shop["rating"] = rest.Rating
			shop["distance_km"] = rest.DistanceKm
			shop["zone_id"] = rest.ZoneID
		} else {
			shop["merchant_name"] = mid
		}
		shops = append(shops, shop)
	}

	var flatItems []map[string]any
	var count int
	for _, it := range items {
		m := map[string]any{
			"item_id": it.ItemID, "merchant_id": it.MerchantID, "title": it.Title,
			"qty": it.Qty, "unit_price_micro": it.UnitPriceMicro,
		}
		if it.Description != nil {
			m["description"] = *it.Description
		}
		if it.ImageURL != nil {
			m["image_url"] = *it.ImageURL
		}
		if len(it.Options) > 0 {
			m["options"] = it.Options
		}
		flatItems = append(flatItems, m)
		count += it.Qty
	}

	subtotal := int64(0)
	deliveryFee := int64(0)
	meetsAll := len(items) > 0
	for _, sh := range shops {
		subtotal += sh["subtotal_micro"].(int64)
		deliveryFee += sh["delivery_charged_micro"].(int64)
		if !sh["meets_minimum"].(bool) {
			meetsAll = false
		}
	}

	var first map[string]any
	if len(shops) > 0 {
		first = shops[0]
	}
	out := map[string]any{
		"owner_id": owner, "items": flatItems, "shops": shops,
		"shop_count": len(shops), "count": count,
		"subtotal_micro": subtotal, "delivery_fee_micro": deliveryFee,
		"delivery_mode": string(mode), "delivery_quote": quote,
		"total_micro": subtotal + deliveryFee, "meets_minimum": meetsAll,
		"eta_label": quote.EtaLabel, "source": "food-svc",
	}
	if first != nil {
		out["merchant_id"] = first["merchant_id"]
		if len(shops) > 1 {
			out["merchant_name"] = fmt.Sprintf("%d ร้าน", len(shops))
		} else {
			out["merchant_name"] = first["merchant_name"]
		}
		out["min_order_micro"] = first["min_order_micro"]
		if quote.EtaLabel != "" {
			out["eta"] = map[string]any{"label": quote.EtaLabel, "prep_min": 0, "travel_min": 0}
		}
	}
	jsonOK(w, out)
}

func (a *app) loadRestaurant(ctx context.Context, id string) (restaurantRow, error) {
	var rest restaurantRow
	var tagsRaw []byte
	var lat, lng *float64
	err := a.pool.QueryRow(ctx, `
		SELECT id, name, cuisine, emoji, rating, review_count, distance_km, prep_min,
		       delivery_fee_micro, min_order_micro, open_default, tags, zone_id, lat, lng
		FROM commerce.food_restaurants WHERE id=$1`, id).Scan(
		&rest.ID, &rest.Name, &rest.Cuisine, &rest.Emoji, &rest.Rating, &rest.ReviewCount,
		&rest.DistanceKm, &rest.PrepMin, &rest.DeliveryFeeMicro, &rest.MinOrderMicro,
		&rest.Open, &tagsRaw, &rest.ZoneID, &lat, &lng)
	if err != nil {
		return rest, err
	}
	rest.Lat = lat
	rest.Lng = lng
	if len(tagsRaw) > 0 {
		_ = json.Unmarshal(tagsRaw, &rest.Tags)
	}
	return rest, nil
}

func (a *app) loadMenuItems(ctx context.Context, merchantID string) ([]map[string]any, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT id, merchant_id, title, description, price_micro, image_url, spicy, popular, options_json, sold_out
		FROM commerce.food_menu_items WHERE merchant_id=$1 ORDER BY created_at`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		item, err := scanMenuRow(rows.Scan)
		if err != nil {
			continue
		}
		out = append(out, item)
	}
	return out, nil
}

func (a *app) loadMenuItem(ctx context.Context, id string) (map[string]any, error) {
	row := a.pool.QueryRow(ctx, `
		SELECT id, merchant_id, title, description, price_micro, image_url, spicy, popular, options_json, sold_out
		FROM commerce.food_menu_items WHERE id=$1`, id)
	return scanMenuRow(row.Scan)
}

func scanRestaurant(scan func(dest ...any) error) (restaurantRow, error) {
	var rest restaurantRow
	var tagsRaw []byte
	var lat, lng *float64
	err := scan(&rest.ID, &rest.Name, &rest.Cuisine, &rest.Emoji, &rest.Rating, &rest.ReviewCount,
		&rest.DistanceKm, &rest.PrepMin, &rest.DeliveryFeeMicro, &rest.MinOrderMicro,
		&rest.Open, &tagsRaw, &rest.ZoneID, &lat, &lng)
	if len(tagsRaw) > 0 {
		_ = json.Unmarshal(tagsRaw, &rest.Tags)
	}
	rest.Lat = lat
	rest.Lng = lng
	return rest, err
}

func scanMenuRow(scan func(dest ...any) error) (map[string]any, error) {
	var id, merchantID, title string
	var desc, img *string
	var price int64
	var spicy, popular, soldOut bool
	var optsRaw []byte
	err := scan(&id, &merchantID, &title, &desc, &price, &img, &spicy, &popular, &optsRaw, &soldOut)
	if err != nil {
		return nil, err
	}
	m := map[string]any{
		"id": id, "merchant_id": merchantID, "title": title, "price_micro": price,
		"spicy": spicy, "popular": popular, "sold_out": soldOut,
	}
	if desc != nil {
		m["description"] = *desc
	}
	if img != nil {
		m["image_url"] = *img
	}
	if len(optsRaw) > 0 {
		var opts any
		_ = json.Unmarshal(optsRaw, &opts)
		m["options"] = opts
	}
	return m, nil
}

func nullableStr(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func nullableBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
