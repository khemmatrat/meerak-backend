// shipping-svc implements Epoch 8 Pillar B: cross-border logistics, landed cost,
// customs/HS handling, label generation and tracking (P118-P120).
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

var (
	mQuote   atomic.Int64
	mLabel   atomic.Int64
	mLanded  atomic.Int64
	mBlocked atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, router: shard.NewRouter(config.Int("SHARD_COUNT", 1)), region: region.NewRouter()}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/shipping/quote", a.quote)             // P120
	mux.HandleFunc("/v1/shipping/landed-cost", a.landedCost)  // P118
	mux.HandleFunc("/v1/shipping/label", a.label)             // P120
	mux.HandleFunc("/v1/shipping/label/", a.labelHTML)        // printable HTML
	mux.HandleFunc("/v1/shipping/fulfillment", a.fulfillment) // status updates
	mux.HandleFunc("/v1/shipping/track", a.track)             // P120
	mux.HandleFunc("/v1/customs", a.customs)                  // P119

	port := config.Int("PORT", 8127)
	log.Printf("shipping-svc :%d p118-p120", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "shipping-svc", "p118_p120": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_shipping_quote_total %d\n", mQuote.Load())
	fmt.Fprintf(w, "aqond_shipping_label_total %d\n", mLabel.Load())
	fmt.Fprintf(w, "aqond_shipping_landed_cost_total %d\n", mLanded.Load())
	fmt.Fprintf(w, "aqond_shipping_restricted_blocked_total %d\n", mBlocked.Load())
}

type carrierRate struct {
	ID          string `json:"carrier_id"`
	Name        string `json:"name"`
	ShippingMic int64  `json:"shipping_micro"`
	CrossBorder bool   `json:"cross_border"`
	COD         bool   `json:"cod_supported"`
}

// P120: quote available carriers + rates for a route + weight.
func (a *app) quote(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FromRegion  string `json:"from_region"`
		ToRegion    string `json:"to_region"`
		WeightGrams int    `json:"weight_grams"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.FromRegion == "" {
		body.FromRegion = a.region.FromRequest(r)
	}
	rates, err := a.rateCards(r.Context(), body.FromRegion, body.ToRegion, body.WeightGrams)
	if err != nil {
		httpErr(w, err)
		return
	}
	mQuote.Add(1)
	jsonOK(w, map[string]any{
		"from_region": body.FromRegion, "to_region": body.ToRegion,
		"cross_border": !strings.EqualFold(body.FromRegion, body.ToRegion),
		"rates": rates,
	})
}

func (a *app) rateCards(ctx context.Context, from, to string, weightGrams int) ([]carrierRate, error) {
	crossBorder := !strings.EqualFold(from, to) && to != ""
	rows, err := a.pool.Query(ctx, `
		SELECT id, name, base_micro, per_kg_micro, cross_border, cod_supported
		FROM commerce.carriers
		WHERE enabled AND ($1 = ANY(regions) OR regions = '{}')
		  AND (cross_border = TRUE OR $2 = FALSE)
		ORDER BY base_micro ASC`, strings.ToUpper(to), crossBorder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	kg := float64(weightGrams) / 1000.0
	if kg < 0.1 {
		kg = 0.1
	}
	var out []carrierRate
	for rows.Next() {
		var id, name string
		var base, perKg int64
		var xb, cod bool
		if rows.Scan(&id, &name, &base, &perKg, &xb, &cod) == nil {
			out = append(out, carrierRate{
				ID: id, Name: name, CrossBorder: xb, COD: cod,
				ShippingMic: base + int64(kg*float64(perKg)),
			})
		}
	}
	return out, nil
}

// P118: landed cost = item value + shipping + duty + import tax.
func (a *app) landedCost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProductID   string `json:"product_id"`
		FromRegion  string `json:"from_region"`
		ToRegion    string `json:"to_region"`
		ItemMicro   int64  `json:"item_micro"`
		WeightGrams int    `json:"weight_grams"`
		CarrierID   string `json:"carrier_id"`
		Currency    string `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.FromRegion == "" {
		body.FromRegion = "TH"
	}
	if body.ToRegion == "" {
		body.ToRegion = a.region.FromRequest(r)
	}
	ctx := r.Context()

	// restricted-item gate (P119)
	if blocked, hs := a.isRestricted(ctx, body.ProductID, body.ToRegion); blocked {
		mBlocked.Add(1)
		w.WriteHeader(http.StatusUnprocessableEntity)
		jsonOK(w, map[string]any{"allowed": false, "reason": "restricted_destination", "hs_code": hs, "to_region": body.ToRegion})
		return
	}

	// shipping for chosen carrier (or cheapest)
	rates, _ := a.rateCards(ctx, body.FromRegion, body.ToRegion, body.WeightGrams)
	var shipMicro int64
	if len(rates) > 0 {
		shipMicro = rates[0].ShippingMic
		for _, rc := range rates {
			if rc.ID == body.CarrierID {
				shipMicro = rc.ShippingMic
			}
		}
	}

	crossBorder := !strings.EqualFold(body.FromRegion, body.ToRegion)
	dutyMicro := int64(0)
	taxMicro := int64(0)
	if crossBorder {
		dutyBps, taxBps := a.dutyAndTax(ctx, body.ToRegion)
		dutyMicro = body.ItemMicro * int64(dutyBps) / 10000
		// import tax applies to (item + duty + shipping)
		taxMicro = (body.ItemMicro + dutyMicro + shipMicro) * int64(taxBps) / 10000
	}
	landed := body.ItemMicro + shipMicro + dutyMicro + taxMicro
	mLanded.Add(1)
	jsonOK(w, map[string]any{
		"allowed": true, "cross_border": crossBorder,
		"item_micro": body.ItemMicro, "shipping_micro": shipMicro,
		"duty_micro": dutyMicro, "tax_micro": taxMicro, "landed_total_micro": landed,
		"currency": body.Currency, "carriers": rates,
	})
}

func (a *app) dutyAndTax(ctx context.Context, market string) (dutyBps, taxBps int) {
	dutyBps = config.Int("DEFAULT_DUTY_BPS", 500) // 5% default import duty
	_ = a.pool.QueryRow(ctx, `SELECT rate_bps FROM commerce.tax_rules WHERE market=$1 AND tax_category='standard'`, market).Scan(&taxBps)
	return dutyBps, taxBps
}

func (a *app) isRestricted(ctx context.Context, productID, toRegion string) (bool, string) {
	if productID == "" {
		return false, ""
	}
	var hs string
	var restricted []string
	err := a.pool.QueryRow(ctx, `
		SELECT hs_code, restricted_destinations FROM commerce.product_customs WHERE product_id=$1`, productID).
		Scan(&hs, &restricted)
	if err != nil {
		return false, ""
	}
	for _, d := range restricted {
		if strings.EqualFold(d, toRegion) {
			return true, hs
		}
	}
	return false, hs
}

// P120: create shipment + generate label/tracking.
func (a *app) label(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OrderID            string `json:"order_id"`
		MerchantID         string `json:"merchant_id"`
		CarrierID          string `json:"carrier_id"`
		FromRegion         string `json:"from_region"`
		ToRegion           string `json:"to_region"`
		WeightGrams        int    `json:"weight_grams"`
		ItemMicro          int64  `json:"item_micro"`
		ProductID          string `json:"product_id"`
		Currency           string `json:"currency"`
		ShowCarrierHeader  bool   `json:"show_carrier_header"`
		LabelTemplate      string `json:"label_template"`
		RecipientSnapshot  map[string]any `json:"recipient_snapshot"`
		SenderSnapshot     map[string]any `json:"sender_snapshot"`
		ProductName        string `json:"product_name"`
		Qty                int    `json:"qty"`
		WidthCm            float64 `json:"width_cm"`
		LengthCm           float64 `json:"length_cm"`
		HeightCm           float64 `json:"height_cm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.CarrierID == "" {
		http.Error(w, "order_id and carrier_id required", http.StatusBadRequest)
		return
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	if body.WeightGrams <= 0 {
		body.WeightGrams = 500
	}
	if body.Qty <= 0 {
		body.Qty = 1
	}
	if body.LabelTemplate == "" {
		body.LabelTemplate = "aqond"
	}
	recipientJSON, _ := json.Marshal(body.RecipientSnapshot)
	if body.RecipientSnapshot == nil {
		recipientJSON = []byte("{}")
	}
	senderJSON, _ := json.Marshal(body.SenderSnapshot)
	if body.SenderSnapshot == nil {
		senderJSON = []byte(`{"name":"AQOND Merchant"}`)
	}
	ctx := r.Context()
	crossBorder := !strings.EqualFold(body.FromRegion, body.ToRegion) && body.ToRegion != ""

	rates, _ := a.rateCards(ctx, body.FromRegion, body.ToRegion, body.WeightGrams)
	var shipMicro int64
	for _, rc := range rates {
		if rc.ID == body.CarrierID {
			shipMicro = rc.ShippingMic
		}
	}
	dutyMicro, taxMicro := int64(0), int64(0)
	if crossBorder {
		dutyBps, taxBps := a.dutyAndTax(ctx, body.ToRegion)
		dutyMicro = body.ItemMicro * int64(dutyBps) / 10000
		taxMicro = (body.ItemMicro + dutyMicro + shipMicro) * int64(taxBps) / 10000
	}
	landed := body.ItemMicro + shipMicro + dutyMicro + taxMicro

	id := ulid.New()
	tracking := "AQ" + strings.ToUpper(ulid.New()[:12])
	sk := a.router.ShardKey(body.MerchantID)
	customs := map[string]any{}
	if crossBorder {
		var hs string
		_ = a.pool.QueryRow(ctx, `SELECT hs_code FROM commerce.product_customs WHERE product_id=$1`, body.ProductID).Scan(&hs)
		customs = map[string]any{"hs_code": hs, "declared_value_micro": body.ItemMicro}
	}
	customsJSON, _ := json.Marshal(customs)

	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.shipments
			(id, order_id, merchant_id, shard_key, carrier_id, ship_from_region, ship_to_region, cross_border,
			 weight_grams, shipping_micro, duty_micro, tax_micro, landed_total_micro, currency, tracking_no, status, customs,
			 label_template, show_carrier_header, recipient_snapshot, sender_snapshot)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'label_generated',$16,$17,$18,$19,$20)`,
		id, body.OrderID, body.MerchantID, sk, body.CarrierID, body.FromRegion, body.ToRegion, crossBorder,
		body.WeightGrams, shipMicro, dutyMicro, taxMicro, landed, body.Currency, tracking, customsJSON,
		body.LabelTemplate, body.ShowCarrierHeader, recipientJSON, senderJSON)
	if err != nil {
		httpErr(w, err)
		return
	}
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "shipment", AggregateID: id, EventType: "shipment.label_generated", ShardKey: sk,
		Payload: map[string]any{"order_id": body.OrderID, "tracking_no": tracking, "cross_border": crossBorder},
	})
	mLabel.Add(1)
	jsonOK(w, map[string]any{
		"shipment_id": id, "tracking_no": tracking, "carrier_id": body.CarrierID,
		"cross_border": crossBorder, "landed_total_micro": landed, "currency": body.Currency,
		"label_html_path": fmt.Sprintf("/v1/shipping/label/%s/html", id),
		"weight_grams": body.WeightGrams,
		"dimensions_cm": map[string]float64{"w": body.WidthCm, "l": body.LengthCm, "h": body.HeightCm},
	})
}

// fulfillment updates order + shipment status (live commerce flow).
func (a *app) fulfillment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		OrderID    string `json:"order_id"`
		Status     string `json:"status"`
		TrackingNo string `json:"tracking_no"`
		Note       string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.Status == "" {
		http.Error(w, "order_id and status required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.orders SET fulfillment_status=$2, updated_at=NOW() WHERE id=$1`, body.OrderID, body.Status)
	evID := ulid.New()
	_, _ = a.pool.Exec(ctx, `INSERT INTO commerce.fulfillment_events (id, order_id, status, note) VALUES ($1,$2,$3,$4)`, evID, body.OrderID, body.Status, body.Note)
	if body.TrackingNo != "" {
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.shipments SET status='in_transit', updated_at=NOW() WHERE tracking_no=$1`, body.TrackingNo)
	}
	jsonOK(w, map[string]any{"order_id": body.OrderID, "status": body.Status, "updated": true})
}

// P120: tracking status (and POST to advance status).
func (a *app) track(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			TrackingNo string `json:"tracking_no"`
			Status     string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		tag, err := a.pool.Exec(ctx, `
			UPDATE commerce.shipments SET status=$2, updated_at=NOW() WHERE tracking_no=$1`,
			body.TrackingNo, body.Status)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		eid := ulid.New()
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.shipment_tracking_events (id, tracking_no, carrier_id, status, note)
			SELECT $1, tracking_no, carrier_id, $2, 'status_update' FROM commerce.shipments WHERE tracking_no=$3`,
			eid, body.Status, body.TrackingNo)
		jsonOK(w, map[string]any{"tracking_no": body.TrackingNo, "status": body.Status, "updated": true})
		return
	}
	tracking := r.URL.Query().Get("tracking_no")
	if tracking == "" {
		http.Error(w, "tracking_no required", http.StatusBadRequest)
		return
	}
	var orderID, carrier, status, currency string
	var landed int64
	var crossBorder bool
	err := a.pool.QueryRow(ctx, `
		SELECT order_id, carrier_id, status, cross_border, landed_total_micro, currency
		FROM commerce.shipments WHERE tracking_no=$1`, tracking).
		Scan(&orderID, &carrier, &status, &crossBorder, &landed, &currency)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	events := []map[string]any{}
	evRows, _ := a.pool.Query(ctx, `
		SELECT status, location, note, occurred_at
		FROM commerce.shipment_tracking_events
		WHERE tracking_no=$1 ORDER BY occurred_at ASC`, tracking)
	if evRows != nil {
		defer evRows.Close()
		for evRows.Next() {
			var st, loc, note string
			var at any
			if evRows.Scan(&st, &loc, &note, &at) == nil {
				events = append(events, map[string]any{
					"status": st, "location": loc, "note": note, "occurred_at": at,
				})
			}
		}
	}
	if len(events) == 0 {
		events = append(events, map[string]any{"status": status, "note": "สร้างพัสดุแล้ว"})
	}
	jsonOK(w, map[string]any{
		"tracking_no": tracking, "order_id": orderID, "carrier_id": carrier,
		"status": status, "cross_border": crossBorder, "landed_total_micro": landed, "currency": currency,
		"events": events,
	})
}

// P119: HS code + restricted-destination registry.
func (a *app) customs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		pid := r.URL.Query().Get("product_id")
		if pid == "" {
			http.Error(w, "product_id required", http.StatusBadRequest)
			return
		}
		var hs, origin string
		var declared int64
		var restricted []string
		err := a.pool.QueryRow(ctx, `
			SELECT hs_code, origin_country, declared_value_micro, restricted_destinations
			FROM commerce.product_customs WHERE product_id=$1`, pid).
			Scan(&hs, &origin, &declared, &restricted)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{
			"product_id": pid, "hs_code": hs, "origin_country": origin,
			"declared_value_micro": declared, "restricted_destinations": restricted,
		})
	case http.MethodPost:
		var body struct {
			ProductID      string   `json:"product_id"`
			HSCode         string   `json:"hs_code"`
			OriginCountry  string   `json:"origin_country"`
			DeclaredMicro  int64    `json:"declared_value_micro"`
			RestrictedDest []string `json:"restricted_destinations"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.OriginCountry == "" {
			body.OriginCountry = "TH"
		}
		if body.RestrictedDest == nil {
			body.RestrictedDest = []string{}
		}
		_, err := a.pool.Exec(ctx, `
			INSERT INTO commerce.product_customs (product_id, hs_code, origin_country, declared_value_micro, restricted_destinations)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (product_id) DO UPDATE SET
				hs_code=EXCLUDED.hs_code, origin_country=EXCLUDED.origin_country,
				declared_value_micro=EXCLUDED.declared_value_micro,
				restricted_destinations=EXCLUDED.restricted_destinations, updated_at=NOW()`,
			body.ProductID, body.HSCode, body.OriginCountry, body.DeclaredMicro, body.RestrictedDest)
		if err != nil {
			httpErr(w, err)
			return
		}
		jsonOK(w, map[string]any{"product_id": body.ProductID, "saved": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
