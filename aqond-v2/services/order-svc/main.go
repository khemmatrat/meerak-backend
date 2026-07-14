package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aqond/aqond-v2/pkg/backpressure"
	"github.com/aqond/aqond-v2/pkg/circuit"
	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	pkgkafka "github.com/aqond/aqond-v2/pkg/kafka"
	"github.com/aqond/aqond-v2/pkg/metrics"
	"github.com/aqond/aqond-v2/pkg/outbox"
	"github.com/aqond/aqond-v2/pkg/ratelimit"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const topicOrdersPlaced = "orders.placed"

type orderApp struct {
	writePool        *pgxpool.Pool
	readPool         *pgxpool.Pool
	redis            *redis.Client
	router           *shard.Router
	brokers          []string
	inventoryURL     string
	walletURL        string
	walletKey        string
	limiter          *backpressure.TrackedLimiter
	inventoryBreaker *circuit.Breaker
	walletBreaker    *circuit.Breaker
	httpClient       *http.Client
	buyerRate        *ratelimit.Window
	merchantRate     *ratelimit.Window
	mreg             *metrics.Registry
	rateRetrySec     int
	orderPartitions  int
}

func main() {
	ctx := context.Background()
	pools, err := db.NewPools(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pools.Write.Close()
	defer pools.Read.Close()

	capacity := config.Int("ORDER_QUEUE_CAPACITY", 256)
	partitions := config.Int("ORDER_TOPIC_PARTITIONS", 4)
	brokers := config.LoadKafkaBrokers()
	_ = pkgkafka.EnsureTopic(ctx, brokers, topicOrdersPlaced, partitions)

	rdb := redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()})
	app := &orderApp{
		writePool:        pools.Write,
		readPool:         pools.Read,
		redis:            rdb,
		router:           shard.NewRouter(1),
		brokers:          brokers,
		inventoryURL:     config.Get("INVENTORY_SERVICE_URL", "http://inventory-svc:8111"),
		walletURL:        config.Get("WALLET_SERVICE_URL", "http://wallet-svc:8112"),
		walletKey:        config.Get("WALLET_API_KEY", os.Getenv("ESCROW_API_KEY")),
		limiter:          backpressure.NewTracked(capacity),
		inventoryBreaker: circuit.New(5, 10*time.Second),
		walletBreaker:    circuit.New(5, 10*time.Second),
		httpClient:       &http.Client{Timeout: 15 * time.Second},
		buyerRate:        ratelimit.NewWindow(rdb, config.Int("RATE_BUYER_PER_MIN", 30), 60),
		merchantRate:     ratelimit.NewWindow(rdb, config.Int("RATE_MERCHANT_PER_MIN", 600), 60),
		mreg:             &metrics.Registry{},
		rateRetrySec:     60,
		orderPartitions:  partitions,
	}

	go app.consumeOrders(ctx)
	go app.runFlashAdmitter(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.health)
	mux.HandleFunc("/metrics", app.mreg.Handler(app.metricsExtra))
	mux.HandleFunc("/v1/orders/payment-captured", app.paymentCaptured)
	mux.HandleFunc("/v1/orders", app.ordersRoot)
	mux.HandleFunc("/v1/orders/", app.orderSubroutes)
	mux.HandleFunc("/v1/flash/buy", app.flashBuy)
	mux.HandleFunc("/v1/flash/queue", app.flashQueueJoin)
	mux.HandleFunc("/v1/flash/queue/status", app.flashQueueStatus)

	port := config.Int("PORT", 8113)
	log.Printf("order-svc :%d partitions=%d queue=%d p24-p32", port, partitions, capacity)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *orderApp) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{
		"ok": true, "service": "order-svc", "p13": true, "p24": true, "p26": true,
		"p27": true, "p30": true, "p31": true, "p32": true,
		"topic": topicOrdersPlaced, "partitions": a.orderPartitions,
		"queue_depth": a.limiter.Depth(),
		"inventory_breaker_open": a.inventoryBreaker.Open(),
		"wallet_breaker_open":    a.walletBreaker.Open(),
	})
}

func (a *orderApp) admit(w http.ResponseWriter) bool {
	if a.limiter.TryAcquire() {
		return true
	}
	a.mreg.OrdersShed.Inc()
	w.Header().Set("Retry-After", "2")
	http.Error(w, "queue_full", http.StatusServiceUnavailable)
	return false
}

type orderBody struct {
	MerchantID string `json:"merchant_id"`
	StoreID    string `json:"store_id"`
	BuyerID    string `json:"buyer_id"`
	VariantID  string `json:"variant_id"`
	ProductID  string `json:"product_id"`
	Qty        int    `json:"qty"`
}

func (a *orderApp) parseOrderBody(r *http.Request) (orderBody, error) {
	var body orderBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return body, err
	}
	if body.BuyerID == "" || body.VariantID == "" {
		return body, fmt.Errorf("buyer_id and variant_id required")
	}
	if body.Qty < 1 {
		body.Qty = 1
	}
	if body.MerchantID == "" {
		body.MerchantID = ulid.New()
	}
	if body.StoreID == "" {
		body.StoreID = ulid.New()
	}
	if body.ProductID == "" {
		body.ProductID = ulid.New()
	}
	return body, nil
}

func (a *orderApp) lookupByIdempotency(ctx context.Context, sk, idem string) (orderID, status string, ok bool) {
	err := a.readPool.QueryRow(ctx, `SELECT id, status FROM commerce.orders WHERE shard_key=$1 AND idempotency_key=$2`, sk, idem).
		Scan(&orderID, &status)
	return orderID, status, err == nil
}

func (a *orderApp) ordersRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		a.listOrders(w, r)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a.placeOrder(w, r)
}

// P204: buyer order list for production storefront (replaces BFF stub).
func (a *orderApp) listOrders(w http.ResponseWriter, r *http.Request) {
	buyerID := r.URL.Query().Get("buyer_id")
	if buyerID == "" {
		http.Error(w, "buyer_id required", http.StatusBadRequest)
		return
	}
	limit := config.Int("ORDER_LIST_LIMIT", 50)
	rows, err := a.readPool.Query(r.Context(), `
		SELECT id, merchant_id, status, fulfillment_status, amount_micro, created_at, metadata
		FROM commerce.orders WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT $2`, buyerID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	orders := []map[string]any{}
	for rows.Next() {
		var id, merchantID, status, fulfillment string
		var amount int64
		var created any
		var meta []byte
		if rows.Scan(&id, &merchantID, &status, &fulfillment, &amount, &created, &meta) == nil {
			o := flattenOrderFromMeta(id, status, amount, created, meta)
			o["merchant_id"] = merchantID
			o["fulfillment_status"] = fulfillment
			orders = append(orders, o)
		}
	}
	jsonOK(w, map[string]any{"buyer_id": buyerID, "orders": orders})
}

func (a *orderApp) placeOrder(w http.ResponseWriter, r *http.Request) {
	if !a.admit(w) {
		return
	}
	defer a.limiter.Release()

	idem := r.Header.Get("Idempotency-Key")
	if idem == "" {
		idem = ulid.New()
	}

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var peek map[string]any
	if json.Unmarshal(raw, &peek) == nil {
		if items, ok := peek["items"].([]any); ok && len(items) > 0 {
			a.placeCheckoutOrder(w, r, raw, idem)
			return
		}
	}

	var body orderBody
	if err := json.Unmarshal(raw, &body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.BuyerID == "" || body.VariantID == "" {
		http.Error(w, "buyer_id and variant_id required", http.StatusBadRequest)
		return
	}
	if body.Qty < 1 {
		body.Qty = 1
	}
	if body.MerchantID == "" {
		body.MerchantID = ulid.New()
	}
	if body.StoreID == "" {
		body.StoreID = ulid.New()
	}
	if body.ProductID == "" {
		body.ProductID = ulid.New()
	}
	if !a.checkAppRateLimit(w, r, body) {
		return
	}

	sk := a.router.ShardKey(body.MerchantID)
	if existingID, status, ok := a.lookupByIdempotency(r.Context(), sk, idem); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "order_id": existingID, "status": status, "idempotency_key": idem,
		})
		return
	}

	orderID, amount, err := a.insertPendingOrder(r.Context(), body, sk, idem, false)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	a.publishPlaced(r.Context(), orderID, body, sk, amount, false)
	a.mreg.OrdersAccepted.Inc()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "order_id": orderID, "status": "pending", "idempotency_key": idem,
	})
}

func (a *orderApp) flashBuy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !a.admit(w) {
		return
	}
	defer a.limiter.Release()

	idem := r.Header.Get("Idempotency-Key")
	if idem == "" {
		http.Error(w, "Idempotency-Key required for flash buy", http.StatusBadRequest)
		return
	}

	body, err := a.parseOrderBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !a.checkAppRateLimit(w, r, body) {
		return
	}
	if !a.requireFlashAdmit(w, r) {
		return
	}

	sk := a.router.ShardKey(body.MerchantID)
	if existingID, status, ok := a.lookupByIdempotency(r.Context(), sk, idem); ok {
		jsonOK(w, map[string]any{
			"ok": true, "order_id": existingID, "status": status, "reserved": true, "idempotency_key": idem,
		})
		return
	}

	orderID := ulid.New()
	if !a.inventoryBreaker.Allow() {
		w.Header().Set("Retry-After", "5")
		http.Error(w, "dependency_unavailable", http.StatusServiceUnavailable)
		return
	}
	reserved, err := a.callReserve(orderID, body, sk)
	if err != nil {
		a.inventoryBreaker.RecordFailure()
		w.Header().Set("Retry-After", "2")
		http.Error(w, "reserve_failed", http.StatusServiceUnavailable)
		return
	}
	if !reserved {
		a.inventoryBreaker.RecordSuccess()
		a.mreg.ReserveConflicts.Inc()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "insufficient_stock"})
		return
	}
	a.inventoryBreaker.RecordSuccess()

	amount, err := a.insertPendingOrderWithID(r.Context(), orderID, body, sk, idem, true)
	if err != nil {
		if err.Error() == "duplicate_idempotency" {
			if existingID, status, ok := a.lookupByIdempotency(r.Context(), sk, idem); ok {
				jsonOK(w, map[string]any{
					"ok": true, "order_id": existingID, "status": status, "reserved": true, "idempotency_key": idem,
				})
				return
			}
		}
		a.releaseInventory(orderID, body.VariantID)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	a.publishPlaced(r.Context(), orderID, body, sk, amount, true)
	a.mreg.OrdersAccepted.Inc()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "order_id": orderID, "status": "pending", "reserved": true, "idempotency_key": idem,
	})
}

func (a *orderApp) insertPendingOrder(ctx context.Context, body orderBody, sk, idem string, preReserved bool) (string, int64, error) {
	orderID := ulid.New()
	amount, err := a.insertPendingOrderWithID(ctx, orderID, body, sk, idem, preReserved)
	return orderID, amount, err
}

func (a *orderApp) insertPendingOrderWithID(ctx context.Context, orderID string, body orderBody, sk, idem string, preReserved bool) (int64, error) {
	var priceMicro int64
	_ = a.writePool.QueryRow(ctx, `SELECT price_micro, product_id, merchant_id FROM commerce.product_variants WHERE id=$1`, body.VariantID).
		Scan(&priceMicro, &body.ProductID, &body.MerchantID)
	amount := priceMicro * int64(body.Qty)

	meta := `{"pre_reserved":false}`
	if preReserved {
		meta = `{"pre_reserved":true}`
	}

	tag, err := a.writePool.Exec(ctx, `
		INSERT INTO commerce.orders (id, merchant_id, store_id, buyer_id, shard_key, status, amount_micro, idempotency_key, metadata)
		VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8::jsonb)
		ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		orderID, body.MerchantID, body.StoreID, body.BuyerID, sk, amount, idem, meta)
	if err != nil {
		return 0, err
	}
	if tag.RowsAffected() == 0 {
		return amount, fmt.Errorf("duplicate_idempotency")
	}

	itemID := ulid.New()
	_, _ = a.writePool.Exec(ctx, `
		INSERT INTO commerce.order_items (id, order_id, variant_id, product_id, merchant_id, shard_key, qty, unit_price_micro)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		itemID, orderID, body.VariantID, body.ProductID, body.MerchantID, sk, body.Qty, priceMicro)
	return amount, nil
}

func (a *orderApp) publishPlaced(ctx context.Context, orderID string, body orderBody, sk string, amount int64, preReserved bool) {
	event := map[string]any{
		"order_id": orderID, "merchant_id": body.MerchantID, "store_id": body.StoreID,
		"buyer_id": body.BuyerID, "variant_id": body.VariantID, "product_id": body.ProductID,
		"shard_key": sk, "qty": body.Qty, "amount_micro": amount, "pre_reserved": preReserved,
	}
	payload, _ := json.Marshal(event)
	writer := pkgkafka.NewWriter(a.brokers, topicOrdersPlaced)
	defer writer.Close()
	_ = pkgkafka.PublishPartitioned(ctx, writer, []byte(sk), payload)
	_ = outbox.Insert(ctx, a.writePool, outbox.Event{
		AggregateType: "order", AggregateID: orderID, EventType: "orders.placed", ShardKey: sk,
		Payload: event,
	})
}

func (a *orderApp) callReserve(orderID string, body orderBody, sk string) (bool, error) {
	reserveBody, _ := json.Marshal(map[string]any{
		"variant_id": body.VariantID, "order_id": orderID, "merchant_id": body.MerchantID,
		"shard_key": sk, "qty": body.Qty,
	})
	req, _ := http.NewRequest(http.MethodPost, a.inventoryURL+"/v1/reserve", bytes.NewReader(reserveBody))
	req.Header.Set("Content-Type", "application/json")
	res, err := a.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	var reserveResp map[string]any
	_ = json.NewDecoder(res.Body).Decode(&reserveResp)
	ok, _ := reserveResp["ok"].(bool)
	return ok, nil
}

func (a *orderApp) getOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Path[len("/v1/orders/"):]
	if id == "" {
		http.NotFound(w, r)
		return
	}
	var status string
	var amount int64
	err := a.readPool.QueryRow(r.Context(), `SELECT status, amount_micro FROM commerce.orders WHERE id=$1`, id).Scan(&status, &amount)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"order_id": id, "status": status, "amount_micro": amount})
}

func (a *orderApp) consumeOrders(ctx context.Context) {
	reader := pkgkafka.NewReader(a.brokers, topicOrdersPlaced, "order-svc-processor")
	defer reader.Close()
	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		var ev map[string]any
		if err := json.Unmarshal(msg.Value, &ev); err != nil {
			_ = reader.CommitMessages(ctx, msg)
			continue
		}
		a.processOrder(ctx, ev)
		_ = reader.CommitMessages(ctx, msg)
	}
}

func (a *orderApp) processOrder(ctx context.Context, ev map[string]any) {
	orderID, _ := ev["order_id"].(string)
	if orderID == "" {
		return
	}
	if !a.markProcessed(ctx, orderID) {
		return
	}
	a.mreg.OrdersProcessed.Inc()
	variantID, _ := ev["variant_id"].(string)
	merchantID, _ := ev["merchant_id"].(string)
	shardKey, _ := ev["shard_key"].(string)
	buyerID, _ := ev["buyer_id"].(string)
	qtyF, _ := ev["qty"].(float64)
	amountF, _ := ev["amount_micro"].(float64)
	preReserved, _ := ev["pre_reserved"].(bool)
	qty := int(qtyF)
	amount := int64(amountF)

	if !preReserved {
		if !a.inventoryBreaker.Allow() {
			a.rejectOrder(ctx, orderID, "inventory_breaker_open")
			return
		}
		reserveBody, _ := json.Marshal(map[string]any{
			"variant_id": variantID, "order_id": orderID, "merchant_id": merchantID,
			"shard_key": shardKey, "qty": qty,
		})
		req, _ := http.NewRequest(http.MethodPost, a.inventoryURL+"/v1/reserve", bytes.NewReader(reserveBody))
		req.Header.Set("Content-Type", "application/json")
		res, err := a.httpClient.Do(req)
		if err != nil || res.StatusCode >= 300 {
			a.inventoryBreaker.RecordFailure()
			a.rejectOrder(ctx, orderID, "reserve_failed")
			return
		}
		var reserveResp map[string]any
		_ = json.NewDecoder(res.Body).Decode(&reserveResp)
		res.Body.Close()
		if ok, _ := reserveResp["ok"].(bool); !ok {
			a.inventoryBreaker.RecordSuccess()
			a.mreg.ReserveConflicts.Inc()
			a.rejectOrder(ctx, orderID, "insufficient_stock")
			return
		}
		a.inventoryBreaker.RecordSuccess()
	}

	if !a.walletBreaker.Allow() {
		if !preReserved {
			a.releaseInventory(orderID, variantID)
		}
		a.rejectOrder(ctx, orderID, "wallet_breaker_open")
		return
	}

	holdBody, _ := json.Marshal(map[string]any{
		"order_id": orderID, "amount_micro": amount, "merchant_id": merchantID,
		"buyer_id": buyerID, "idempotency_key": "hold-" + orderID, "actor": "order-svc",
	})
	req, _ := http.NewRequest(http.MethodPost, a.walletURL+"/v1/hold", bytes.NewReader(holdBody))
	req.Header.Set("Content-Type", "application/json")
	if a.walletKey != "" {
		req.Header.Set("X-Wallet-Api-Key", a.walletKey)
	}
	holdRes, err := a.httpClient.Do(req)
	if err != nil || holdRes.StatusCode >= 300 {
		a.walletBreaker.RecordFailure()
		if !preReserved {
			a.releaseInventory(orderID, variantID)
		} else {
			a.releaseInventory(orderID, variantID)
		}
		a.rejectOrder(ctx, orderID, "hold_failed")
		return
	}
	holdRes.Body.Close()
	a.walletBreaker.RecordSuccess()

	_, _ = a.httpClient.Post(a.inventoryURL+"/v1/commit", "application/json", bytes.NewReader(mustJSON(map[string]any{
		"order_id": orderID, "variant_id": variantID,
	})))

	_, _ = a.writePool.Exec(ctx, `UPDATE commerce.orders SET status='confirmed', updated_at=NOW() WHERE id=$1`, orderID)

	writer := pkgkafka.NewWriter(a.brokers, "orders.confirmed")
	defer writer.Close()
	confirmed, _ := json.Marshal(map[string]any{"order_id": orderID, "status": "confirmed"})
	_ = pkgkafka.Publish(ctx, writer, []byte(orderID), confirmed)
}

func (a *orderApp) rejectOrder(ctx context.Context, orderID, reason string) {
	_, _ = a.writePool.Exec(ctx, `UPDATE commerce.orders SET status='rejected', metadata = metadata || $2::jsonb, updated_at=NOW() WHERE id=$1`,
		orderID, fmt.Sprintf(`{"reject_reason":"%s"}`, reason))
	writer := pkgkafka.NewWriter(a.brokers, "orders.rejected")
	defer writer.Close()
	payload, _ := json.Marshal(map[string]any{"order_id": orderID, "status": "rejected", "reason": reason})
	_ = pkgkafka.Publish(ctx, writer, []byte(orderID), payload)
}

func (a *orderApp) releaseInventory(orderID, variantID string) {
	body, _ := json.Marshal(map[string]any{"order_id": orderID, "variant_id": variantID})
	resp, err := a.httpClient.Post(a.inventoryURL+"/v1/release", "application/json", bytes.NewReader(body))
	if err == nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
