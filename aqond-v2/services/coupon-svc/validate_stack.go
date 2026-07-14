package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

type stackCoupon struct {
	Code      string
	Kind      string
	Bps       int
	Micro     int64
	Min       int64
	Priority  int
	Group     string
	Stackable bool
}

// validateStack applies multiple coupon codes with exclusivity + cap at subtotal.
func (a *app) validateStack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID        string   `json:"user_id"`
		Codes         []string `json:"codes"`
		SubtotalMicro int64    `json:"subtotal_micro"`
		DeliveryMicro int64    `json:"delivery_micro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(body.Codes) == 0 {
		jsonOK(w, map[string]any{"valid": false, "reason": "no_codes"})
		return
	}
	reg := a.region.FromRequest(r)
	ctx := r.Context()

	var coupons []stackCoupon
	seen := map[string]bool{}
	for _, raw := range body.Codes {
		code := strings.TrimSpace(strings.ToUpper(raw))
		if code == "" || seen[code] {
			continue
		}
		seen[code] = true
		var c stackCoupon
		var active bool
		var exp *time.Time
		err := a.pool.QueryRow(ctx, `
			SELECT kind, value_bps, value_micro, min_subtotal_micro, active, expires_at,
			       COALESCE(stack_priority, 100), COALESCE(exclusive_group, ''), COALESCE(stackable, TRUE)
			FROM commerce.coupons WHERE code=$1 AND (region='*' OR region=$2)`, code, reg).
			Scan(&c.Kind, &c.Bps, &c.Micro, &c.Min, &active, &exp, &c.Priority, &c.Group, &c.Stackable)
		if err != nil || !active || (exp != nil && exp.Before(time.Now())) {
			jsonOK(w, map[string]any{"valid": false, "reason": "invalid_code", "code": code})
			return
		}
		c.Code = code
		coupons = append(coupons, c)
	}

	sort.Slice(coupons, func(i, j int) bool { return coupons[i].Priority < coupons[j].Priority })

	usedGroups := map[string]bool{}
	var applied []map[string]any
	remaining := body.SubtotalMicro
	totalDiscount := int64(0)

	for _, c := range coupons {
		if !c.Stackable && len(applied) > 0 {
			jsonOK(w, map[string]any{"valid": false, "reason": "not_stackable", "code": c.Code})
			return
		}
		if c.Group != "" && usedGroups[c.Group] {
			continue
		}
		if remaining < c.Min {
			continue
		}
		discount := c.Micro
		if c.Kind == "percent" {
			discount = remaining * int64(c.Bps) / 10000
		}
		if strings.EqualFold(c.Code, "FREESHIP") && body.DeliveryMicro > 0 {
			discount = body.DeliveryMicro
		}
		if discount <= 0 {
			continue
		}
		if discount > remaining {
			discount = remaining
		}
		remaining -= discount
		totalDiscount += discount
		if c.Group != "" {
			usedGroups[c.Group] = true
		}
		applied = append(applied, map[string]any{"code": c.Code, "discount_micro": discount, "kind": c.Kind})
	}

	if len(applied) == 0 {
		jsonOK(w, map[string]any{"valid": false, "reason": "nothing_applied"})
		return
	}
	mValidate.Add(1)
	jsonOK(w, map[string]any{
		"valid": true, "discount_micro": totalDiscount,
		"applied": applied, "codes": body.Codes,
	})
}
