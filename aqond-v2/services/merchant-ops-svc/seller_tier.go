package main

import (
	"encoding/json"
	"net/http"
	"time"
)

func (a *app) sellerTier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	mid := r.URL.Query().Get("merchant_id")
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	var tier string
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(tier, 'bronze') FROM commerce.merchants WHERE id=$1`, mid).Scan(&tier)
	if tier == "" {
		tier = "bronze"
	}

	var orderCount int
	var revenueMicro int64
	_ = a.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(total_micro), 0)
		FROM commerce.orders
		WHERE merchant_id=$1 AND status IN ('confirmed','completed','shipped','delivered')`, mid).Scan(&orderCount, &revenueMicro)

	rows, _ := a.pool.Query(ctx, `
		SELECT tier, label_th, min_orders, min_revenue_micro, commission_bps, benefits
		FROM commerce.seller_tier_rules ORDER BY min_revenue_micro ASC`)
	defer func() {
		if rows != nil {
			rows.Close()
		}
	}()

	var rules []map[string]any
	var current map[string]any
	var next map[string]any
	for rows != nil && rows.Next() {
		var t, label string
		var minOrders int
		var minRev, comm int64
		var benefits []byte
		if rows.Scan(&t, &label, &minOrders, &minRev, &comm, &benefits) != nil {
			continue
		}
		var ben []string
		_ = json.Unmarshal(benefits, &ben)
		rule := map[string]any{
			"tier": t, "label": label, "min_orders": minOrders,
			"min_revenue_micro": minRev, "commission_bps": comm, "benefits": ben,
		}
		rules = append(rules, rule)
		if t == tier {
			current = rule
		}
		if next == nil && (orderCount < minOrders || revenueMicro < minRev) && t != tier {
			next = rule
		}
	}
	if current == nil && len(rules) > 0 {
		current = rules[0]
	}

	jsonOK(w, map[string]any{
		"merchant_id": mid,
		"tier": tier,
		"current": current,
		"next": next,
		"stats": map[string]any{
			"order_count": orderCount,
			"revenue_micro": revenueMicro,
		},
		"rules": rules,
		"computed_at": time.Now().UTC().Format(time.RFC3339),
	})
}
