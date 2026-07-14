package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type app struct {
	pool       *pgxpool.Pool
	router     *shard.Router
	region     *region.Router
	http       *http.Client
	paymentURL string
	orderURL   string
	feesRedis  redis.UniversalClient
}

var (
	mStarted   atomic.Int64
	mCompleted atomic.Int64
	mFailed    atomic.Int64
	mCompensated atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:       pool,
		router:     shard.NewRouter(config.Int("SHARD_COUNT", 1)),
		region:     region.NewRouter(),
		http:       &http.Client{Timeout: 8 * time.Second},
		paymentURL: config.Get("PAYMENT_SERVICE_URL", "http://payment-svc:8120"),
		orderURL:   config.Get("ORDER_SERVICE_URL", "http://order-svc:8113"),
	}
	a.initFeesRedis()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/checkout", a.checkout)

	port := config.Int("PORT", 8121)
	log.Printf("checkout-svc :%d p84", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "checkout-svc", "p84": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_checkout_started_total %d\n", mStarted.Load())
	fmt.Fprintf(w, "aqond_checkout_completed_total %d\n", mCompleted.Load())
	fmt.Fprintf(w, "aqond_checkout_failed_total %d\n", mFailed.Load())
	fmt.Fprintf(w, "aqond_checkout_compensated_total %d\n", mCompensated.Load())
}

type checkoutItem struct {
	VariantID      string `json:"variant_id"`
	ProductID      string `json:"product_id"`
	Title          string `json:"title"`
	Qty            int    `json:"qty"`
	UnitPriceMicro int64  `json:"unit_price_micro"`
}

type checkoutReq struct {
	MerchantID      string         `json:"merchant_id"`
	BuyerID         string         `json:"buyer_id"`
	Method          string         `json:"method"`
	Currency        string         `json:"currency"`
	Items           []checkoutItem `json:"items"`
	CouponMicro     int64          `json:"coupon_discount_micro"`
	ShippingMicro   int64          `json:"shipping_micro"`
	Device          string         `json:"device"`
	IP              string         `json:"ip"`
	IdempotencyKey  string         `json:"idempotency_key"`
	OrderType       string         `json:"order_type"`
	Recipient       string         `json:"recipient"`
	ShippingAddress string         `json:"shipping_address"`
	PostalCode      string         `json:"postal_code"`
	Phone           string         `json:"phone"`
	HandoffNote     string         `json:"handoff_note"`
	AddressID       string         `json:"address_id"`
	ShippingAddressID string       `json:"shipping_address_id"`
	CarrierID       string         `json:"carrier_id"`
	MerchantName    string         `json:"merchant_name"`
	PromoCode       string         `json:"promo_code"`
	DeliveryEta     string         `json:"delivery_eta_label"`
}

// P84: checkout saga. cart -> price -> payment_intent -> authorize -> capture -> place order.
// Compensation: if order placement fails after capture, refund the payment.
func (a *app) checkout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body checkoutReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" || body.BuyerID == "" || len(body.Items) == 0 {
		http.Error(w, "merchant_id, buyer_id, items required", http.StatusBadRequest)
		return
	}
	if body.IdempotencyKey == "" {
		body.IdempotencyKey = "co-" + ulid.New()
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	if body.Method == "" {
		body.Method = "card"
	}
	mStarted.Add(1)
	ctx := r.Context()
	sk := a.router.ShardKey(body.MerchantID)
	reg := a.region.FromRequest(r)
	orderID := ulid.New()

	if err := a.applyAddress(ctx, reg, &body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Step 1: price the cart (P84 price/coupon calc).
	var subtotal int64
	for _, it := range body.Items {
		q := int64(it.Qty)
		if q <= 0 {
			q = 1
		}
		subtotal += it.UnitPriceMicro * q
	}
	orderType := body.OrderType
	if orderType == "" {
		orderType = "marketplace"
	}
	platformFeeMicro, subtotalWithFee := a.applyPlatformFee(ctx, subtotal, orderType)
	total := subtotalWithFee - body.CouponMicro + body.ShippingMicro
	if total < 0 {
		total = 0
	}

	// Step 2: create payment intent (idempotent; scores fraud).
	intentResp, err := a.postJSON(ctx, a.paymentURL+"/v1/intents", reg, map[string]any{
		"order_id": orderID, "merchant_id": body.MerchantID, "buyer_id": body.BuyerID, "method": body.Method,
		"amount_micro": total, "currency": body.Currency, "idempotency_key": body.IdempotencyKey + ":pay",
		"device": body.Device, "ip": body.IP,
		"metadata": map[string]any{"customer_email": body.BuyerID + "@aqond.local"},
	})
	if err != nil {
		a.fail(w, "payment_intent_failed", err)
		return
	}
	intentID, _ := dig(intentResp, "intent", "id")
	fraudDecision, _ := intentResp["fraud_decision"].(string)
	if fraudDecision == "block" {
		mFailed.Add(1)
		jsonOK(w, map[string]any{"status": "rejected", "reason": "fraud_blocked", "intent_id": intentID})
		return
	}

	// Step 3: authorize.
	authResp, err := a.postJSON(ctx, a.paymentURL+"/v1/intents/authorize", reg, map[string]any{"intent_id": intentID})
	if err != nil {
		a.fail(w, "authorize_failed", err)
		return
	}

	asyncPayso := body.Method == "promptpay" && config.Get("PAYSO_ENABLED", "0") == "1"

	// Step 4: capture (COD and async PaySo capture later via webhook/inquiry).
	captured := false
	if body.Method != "cod" && !asyncPayso {
		if _, err := a.postJSON(ctx, a.paymentURL+"/v1/intents/capture", reg, map[string]any{"intent_id": intentID, "amount_micro": total}); err != nil {
			a.fail(w, "capture_failed", err)
			return
		}
		captured = true
	}

	// Step 5: place order.
	placed := a.placeOrder(ctx, reg, orderID, body, sk, total, intentID, asyncPayso)
	if !placed && captured {
		// Compensation: refund the captured payment (P84 saga rollback).
		_, _ = a.postJSON(ctx, a.paymentURL+"/v1/refund", reg, map[string]any{
			"intent_id": intentID, "amount_micro": total, "reason": "order_placement_failed",
			"idempotency_key": body.IdempotencyKey + ":compensate",
		})
		mCompensated.Add(1)
		mFailed.Add(1)
		jsonOK(w, map[string]any{"status": "compensated", "intent_id": intentID, "reason": "order_placement_failed"})
		return
	}

	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "checkout", AggregateID: orderID, EventType: "checkout.completed", ShardKey: sk,
		Payload: map[string]any{"order_id": orderID, "intent_id": intentID, "amount_micro": total, "method": body.Method, "captured": captured},
	})
	mCompleted.Add(1)
	status := "completed"
	if asyncPayso {
		status = "pending_payment"
	}
	jsonOK(w, map[string]any{
		"status": status, "order_id": orderID, "intent_id": intentID,
		"subtotal_micro": subtotal, "platform_fee_micro": platformFeeMicro,
		"total_micro": total, "captured": captured,
		"qr_code_url": authResp["qr_code_url"], "payso_reference_id": authResp["payso_reference_id"],
		"redirect_url": authResp["redirect_url"],
	})
}

// placeOrder calls order-svc if configured; otherwise records the order via outbox
// so the existing order pipeline can pick it up. Returns true on success.
func (a *app) placeOrder(ctx context.Context, reg, orderID string, body checkoutReq, sk string, total int64, intentID string, paymentPending bool) bool {
	if a.orderURL != "" {
		orderType := body.OrderType
		if orderType == "" {
			orderType = "marketplace"
		}
		meta := map[string]any{}
		if paymentPending {
			meta["payment_status"] = "pending"
		} else if body.Method != "cod" {
			meta["payment_status"] = "paid"
		}
		_, err := a.postJSON(ctx, a.orderURL+"/v1/orders", reg, map[string]any{
			"order_id": orderID, "merchant_id": body.MerchantID, "buyer_id": body.BuyerID,
			"amount_micro": total, "currency": body.Currency, "idempotency_key": body.IdempotencyKey + ":order",
			"intent_id": intentID, "items": body.Items, "order_type": orderType,
			"recipient": body.Recipient, "shipping_address": body.ShippingAddress,
			"shipping_address_id": body.ShippingAddressID, "address_id": body.AddressID,
			"postal_code": body.PostalCode, "phone": body.Phone, "handoff_note": body.HandoffNote,
			"carrier_id": body.CarrierID, "payment_method": body.Method, "merchant_name": body.MerchantName,
			"promo_code": body.PromoCode, "discount_micro": body.CouponMicro, "shipping_micro": body.ShippingMicro,
			"delivery_eta_label": body.DeliveryEta, "metadata": meta,
		})
		return err == nil
	}
	_ = outbox.Insert(ctx, a.pool, outbox.Event{
		AggregateType: "order", AggregateID: orderID, EventType: "order.requested", ShardKey: sk,
		Payload: map[string]any{"merchant_id": body.MerchantID, "buyer_id": body.BuyerID, "amount_micro": total, "intent_id": intentID, "region": reg},
	})
	return true
}

func (a *app) fail(w http.ResponseWriter, reason string, err error) {
	mFailed.Add(1)
	log.Printf("checkout failed: %s: %v", reason, err)
	http.Error(w, reason, http.StatusBadGateway)
}

func (a *app) postJSON(ctx context.Context, url, reg string, payload map[string]any) (map[string]any, error) {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(region.HeaderRegion, reg)
	resp, err := a.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s -> %d: %s", url, resp.StatusCode, string(data))
	}
	var out map[string]any
	_ = json.Unmarshal(data, &out)
	return out, nil
}

func dig(m map[string]any, keys ...string) (string, bool) {
	cur := any(m)
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return "", false
		}
		cur = mm[k]
	}
	s, ok := cur.(string)
	return s, ok
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
