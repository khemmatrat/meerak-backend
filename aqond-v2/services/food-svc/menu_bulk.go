package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) menuBulk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		MerchantID string   `json:"merchant_id"`
		Action     string   `json:"action"`
		ItemIDs    []string `json:"item_ids"`
		PriceDelta int      `json:"price_delta_percent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" || len(body.ItemIDs) == 0 {
		http.Error(w, "merchant_id and item_ids required", http.StatusBadRequest)
		return
	}
	action := strings.TrimSpace(body.Action)
	if action == "" {
		action = "sold_out"
	}
	ctx := r.Context()
	affected := 0
	for _, itemID := range body.ItemIDs {
		switch action {
		case "delete":
			tag, _ := a.pool.Exec(ctx, `
				DELETE FROM commerce.food_menu_items WHERE merchant_id=$1 AND id=$2`, body.MerchantID, itemID)
			affected += int(tag.RowsAffected())
		case "price_delta":
			if body.PriceDelta == 0 {
				continue
			}
			tag, _ := a.pool.Exec(ctx, `
				UPDATE commerce.food_menu_items
				SET price_micro = GREATEST(100, price_micro + (price_micro * $3 / 100))
				WHERE merchant_id=$1 AND id=$2`, body.MerchantID, itemID, body.PriceDelta)
			affected += int(tag.RowsAffected())
		default:
			soldOut := action != "restock"
			tag, _ := a.pool.Exec(ctx, `
				UPDATE commerce.food_menu_items SET sold_out=$3 WHERE merchant_id=$1 AND id=$2`,
				body.MerchantID, itemID, soldOut)
			affected += int(tag.RowsAffected())
		}
	}
	opID := ulid.New()
	raw, _ := json.Marshal(body.ItemIDs)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.food_menu_bulk_ops (id, merchant_id, action, item_ids, meta)
		VALUES ($1,$2,$3,$4,$5)`, opID, body.MerchantID, action, raw,
		map[string]any{"affected": affected, "price_delta_percent": body.PriceDelta})
	jsonOK(w, map[string]any{"ok": true, "affected": affected, "action": action, "op_id": opID})
}
