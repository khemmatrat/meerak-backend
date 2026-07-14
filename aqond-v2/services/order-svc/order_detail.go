package main

import (
	"net/http"

	"github.com/jackc/pgx/v5"
)

func (a *orderApp) getOrderDetail(w http.ResponseWriter, r *http.Request, orderID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if orderID == "" {
		http.NotFound(w, r)
		return
	}
	var merchantID, buyerID, status, fulfillment string
	var amount int64
	var created any
	var meta []byte
	err := a.readPool.QueryRow(r.Context(), `
		SELECT merchant_id, buyer_id, status, fulfillment_status, amount_micro, created_at, metadata
		FROM commerce.orders WHERE id=$1`, orderID).
		Scan(&merchantID, &buyerID, &status, &fulfillment, &amount, &created, &meta)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	o := flattenOrderFromMeta(orderID, status, amount, created, meta)
	o["merchant_id"] = merchantID
	o["buyer_id"] = buyerID
	o["fulfillment_status"] = fulfillment
	jsonOK(w, o)
}
