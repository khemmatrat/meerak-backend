package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

type checkoutLineItem struct {
	VariantID      string `json:"variant_id"`
	ProductID      string `json:"product_id"`
	Title          string `json:"title"`
	Qty            int    `json:"qty"`
	UnitPriceMicro int64  `json:"unit_price_micro"`
}

type checkoutOrderBody struct {
	OrderID         string             `json:"order_id"`
	MerchantID      string             `json:"merchant_id"`
	StoreID         string             `json:"store_id"`
	BuyerID         string             `json:"buyer_id"`
	AmountMicro     int64              `json:"amount_micro"`
	Currency        string             `json:"currency"`
	IdempotencyKey  string             `json:"idempotency_key"`
	IntentID        string             `json:"intent_id"`
	OrderType       string             `json:"order_type"`
	Items           []checkoutLineItem `json:"items"`
	Recipient         string             `json:"recipient"`
	ShippingAddress   string             `json:"shipping_address"`
	ShippingAddressID string             `json:"shipping_address_id"`
	AddressID         string             `json:"address_id"`
	PostalCode        string             `json:"postal_code"`
	Phone           string             `json:"phone"`
	HandoffNote     string             `json:"handoff_note"`
	CarrierID       string             `json:"carrier_id"`
	PaymentMethod   string             `json:"payment_method"`
	MerchantName    string             `json:"merchant_name"`
	PromoCode       string             `json:"promo_code"`
	DiscountMicro   int64              `json:"discount_micro"`
	ShippingMicro   int64              `json:"shipping_micro"`
	DeliveryEta     string             `json:"delivery_eta_label"`
	Metadata        map[string]any     `json:"metadata"`
}

func parseCheckoutOrderBody(raw []byte) (checkoutOrderBody, error) {
	var body checkoutOrderBody
	if err := json.Unmarshal(raw, &body); err != nil {
		return body, err
	}
	if body.BuyerID == "" || body.MerchantID == "" || len(body.Items) == 0 {
		return body, fmt.Errorf("buyer_id, merchant_id, items required")
	}
	if body.Currency == "" {
		body.Currency = "THB"
	}
	if body.OrderType == "" {
		body.OrderType = "marketplace"
	}
	if body.StoreID == "" {
		body.StoreID = body.MerchantID
	}
	for i := range body.Items {
		if body.Items[i].Qty < 1 {
			body.Items[i].Qty = 1
		}
	}
	return body, nil
}

func (body checkoutOrderBody) buildMetadata() map[string]any {
	meta := map[string]any{
		"order_type":       body.OrderType,
		"checkout_pipeline": true,
		"intent_id":        body.IntentID,
	}
	if body.Recipient != "" {
		meta["recipient"] = body.Recipient
	}
	if body.ShippingAddress != "" {
		meta["shipping_address"] = body.ShippingAddress
	}
	if body.ShippingAddressID != "" {
		meta["shipping_address_id"] = body.ShippingAddressID
	} else if body.AddressID != "" {
		meta["shipping_address_id"] = body.AddressID
	}
	if body.PostalCode != "" {
		meta["postal_code"] = body.PostalCode
	}
	if body.Phone != "" {
		meta["phone"] = body.Phone
	}
	if body.HandoffNote != "" {
		meta["handoff_note"] = body.HandoffNote
	}
	if body.CarrierID != "" {
		meta["carrier_id"] = body.CarrierID
	}
	if body.PaymentMethod != "" {
		meta["payment_method"] = body.PaymentMethod
		meta["method"] = body.PaymentMethod
	}
	if body.MerchantName != "" {
		meta["merchant_name"] = body.MerchantName
	}
	if body.PromoCode != "" {
		meta["promo_code"] = body.PromoCode
	}
	if body.DiscountMicro > 0 {
		meta["discount_micro"] = body.DiscountMicro
	}
	if body.ShippingMicro > 0 {
		meta["shipping_micro"] = body.ShippingMicro
	}
	if body.DeliveryEta != "" {
		meta["delivery_eta_label"] = body.DeliveryEta
	}
	items := make([]map[string]any, 0, len(body.Items))
	for _, it := range body.Items {
		items = append(items, map[string]any{
			"product_id":       it.ProductID,
			"variant_id":       it.VariantID,
			"title":            it.Title,
			"qty":              it.Qty,
			"unit_price_micro": it.UnitPriceMicro,
		})
	}
	meta["items"] = items
	for k, v := range body.Metadata {
		meta[k] = v
	}
	return meta
}

func (a *orderApp) placeCheckoutOrder(w http.ResponseWriter, r *http.Request, raw []byte, headerIdem string) {
	body, err := parseCheckoutOrderBody(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	idem := body.IdempotencyKey
	if idem == "" {
		idem = headerIdem
	}
	if idem == "" {
		idem = ulid.New()
	}

	sk := a.router.ShardKey(body.MerchantID)
	if existingID, status, ok := a.lookupByIdempotency(r.Context(), sk, idem); ok {
		jsonOK(w, map[string]any{
			"ok": true, "order_id": existingID, "status": status, "idempotency_key": idem,
		})
		return
	}

	orderID := body.OrderID
	if orderID == "" {
		orderID = ulid.New()
	}

	amount := body.AmountMicro
	if amount <= 0 {
		for _, it := range body.Items {
			q := int64(it.Qty)
			if q < 1 {
				q = 1
			}
			amount += it.UnitPriceMicro * q
		}
		amount += body.ShippingMicro - body.DiscountMicro
		if amount < 0 {
			amount = 0
		}
	}

	meta := body.buildMetadata()
	metaJSON, _ := json.Marshal(meta)

	addrID := body.ShippingAddressID
	if addrID == "" {
		addrID = body.AddressID
	}

	ctx := r.Context()
	tag, err := a.writePool.Exec(ctx, `
		INSERT INTO commerce.orders (id, merchant_id, store_id, buyer_id, shard_key, status, fulfillment_status, amount_micro, currency, idempotency_key, metadata, shipping_address_id)
		VALUES ($1,$2,$3,$4,$5,'confirmed','pending_accept',$6,$7,$8,$9::jsonb,NULLIF($10,''))
		ON CONFLICT (shard_key, idempotency_key) DO NOTHING`,
		orderID, body.MerchantID, body.StoreID, body.BuyerID, sk, amount, body.Currency, idem, metaJSON, addrID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		if existingID, status, ok := a.lookupByIdempotency(ctx, sk, idem); ok {
			jsonOK(w, map[string]any{
				"ok": true, "order_id": existingID, "status": status, "idempotency_key": idem,
			})
			return
		}
		http.Error(w, "duplicate_idempotency", http.StatusConflict)
		return
	}

	if err := a.insertCheckoutLineItems(ctx, orderID, body, sk); err != nil {
		_, _ = a.writePool.Exec(ctx, `UPDATE commerce.orders SET status='rejected', metadata = metadata || '{"reject_reason":"line_items_failed"}'::jsonb WHERE id=$1`, orderID)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	a.mreg.OrdersAccepted.Inc()
	a.notifyMerchantNewOrder(ctx, body.MerchantID, orderID, body.MerchantName)
	jsonOK(w, map[string]any{
		"ok": true, "order_id": orderID, "status": "confirmed", "amount_micro": amount, "idempotency_key": idem,
	})
}

func (a *orderApp) insertCheckoutLineItems(ctx context.Context, orderID string, body checkoutOrderBody, sk string) error {
	for _, it := range body.Items {
		variantID := it.VariantID
		if variantID == "" {
			variantID = it.ProductID
		}
		if variantID == "" {
			variantID = ulid.New()
		}
		productID := it.ProductID
		if productID == "" {
			productID = variantID
		}
		qty := it.Qty
		if qty < 1 {
			qty = 1
		}
		unitPrice := it.UnitPriceMicro
		itemID := ulid.New()
		_, err := a.writePool.Exec(ctx, `
			INSERT INTO commerce.order_items (id, order_id, variant_id, product_id, merchant_id, shard_key, qty, unit_price_micro)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			itemID, orderID, variantID, productID, body.MerchantID, sk, qty, unitPrice)
		if err != nil {
			return err
		}
	}
	return nil
}

func flattenOrderFromMeta(id, status string, amount int64, created any, meta []byte) map[string]any {
	o := map[string]any{
		"order_id": id, "id": id, "status": status,
		"amount_micro": amount, "total_micro": amount, "created_at": created,
	}
	var md map[string]any
	if json.Unmarshal(meta, &md) != nil || md == nil {
		return o
	}
	for _, k := range []string{
		"items", "recipient", "shipping_address", "shipping_address_id", "phone", "postal_code", "handoff_note",
		"order_type", "merchant_name", "merchant_id", "carrier_id", "promo_code",
		"discount_micro", "shipping_micro", "delivery_eta_label", "tracking_no", "intent_id",
		"fulfillment_status", "payment_status", "payso_reference_id", "payso_transaction_id",
	} {
		if v, ok := md[k]; ok {
			o[k] = v
		}
	}
	if m, ok := md["payment_method"].(string); ok && m != "" {
		o["method"] = m
	} else if m, ok := md["method"].(string); ok && m != "" {
		o["method"] = m
	}
	return o
}
