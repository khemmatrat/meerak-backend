package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

const (
	freeShopSlots = 5
	maxShopSlots  = 30
)

type merchantShop struct {
	ID             string  `json:"id"`
	OwnerID        string  `json:"owner_id"`
	Name           string  `json:"name"`
	Type           string  `json:"type"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	ApprovedAt     *string `json:"approved_at,omitempty"`
	RejectedReason *string `json:"rejected_reason,omitempty"`
}

func (a *app) shops(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listShops(w, r)
	case http.MethodPost:
		a.createShop(w, r)
	case http.MethodPatch:
		a.patchShop(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) listShops(w http.ResponseWriter, r *http.Request) {
	ownerID := r.URL.Query().Get("owner_id")
	if ownerID == "" {
		http.Error(w, "owner_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	profile, err := a.loadOwnerProfile(ctx, ownerID)
	if err != nil {
		httpErr(w, err)
		return
	}
	shops, err := a.loadShopsForOwner(ctx, ownerID)
	if err != nil {
		httpErr(w, err)
		return
	}
	system, _ := a.loadSystemShops(ctx)
	seen := map[string]bool{}
	for _, s := range shops {
		seen[s.ID] = true
	}
	for _, s := range system {
		if !seen[s.ID] {
			shops = append(shops, s)
		}
	}
	jsonOK(w, map[string]any{
		"owner_id": ownerID,
		"profile":  profile,
		"shops":    shops,
		"usage":    slotUsage(profile, shops),
	})
}

func (a *app) createShop(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OwnerID string `json:"owner_id"`
		Name    string `json:"name"`
		Type    string `json:"type"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.OwnerID == "" || body.Name == "" {
		http.Error(w, "owner_id and name required", http.StatusBadRequest)
		return
	}
	if body.Type != "food" {
		body.Type = "marketplace"
	}
	ctx := r.Context()
	profile, err := a.loadOwnerProfile(ctx, body.OwnerID)
	if err != nil {
		httpErr(w, err)
		return
	}
	shops, err := a.loadShopsForOwner(ctx, body.OwnerID)
	if err != nil {
		httpErr(w, err)
		return
	}
	usage := slotUsage(profile, shops)
	if usage["used"].(int) >= usage["max"].(int) {
		http.Error(w, "slot_limit_reached", http.StatusBadRequest)
		return
	}
	id := fmt.Sprintf("shop-%s", ulid.New()[:14])
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.merchant_shops (id, owner_id, name, shop_type, status, created_at)
		VALUES ($1,$2,$3,$4,'pending',$5)`, id, body.OwnerID, body.Name, body.Type, now)
	if err != nil {
		httpErr(w, err)
		return
	}
	shop := merchantShop{ID: id, OwnerID: body.OwnerID, Name: body.Name, Type: body.Type, Status: "pending", CreatedAt: now}
	jsonOK(w, map[string]any{"shop": shop, "profile": profile})
}

func (a *app) patchShop(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action   string `json:"action"`
		ShopID   string `json:"shop_id"`
		OwnerID  string `json:"owner_id"`
		Reason   string `json:"reason"`
		Slots    int    `json:"extra_slots"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.ShopID == "" {
		http.Error(w, "shop_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	switch body.Action {
	case "approve":
		now := time.Now().UTC().Format(time.RFC3339)
		tag, err := a.pool.Exec(ctx, `
			UPDATE commerce.merchant_shops SET status='approved', approved_at=$2
			WHERE id=$1 AND status='pending'`, body.ShopID, now)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not_found", http.StatusNotFound)
			return
		}
	case "reject":
		reason := body.Reason
		if reason == "" {
			reason = "ไม่ผ่านการตรวจสอบ"
		}
		tag, err := a.pool.Exec(ctx, `
			UPDATE commerce.merchant_shops SET status='rejected', rejected_reason=$2
			WHERE id=$1 AND status='pending'`, body.ShopID, reason)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not_found", http.StatusNotFound)
			return
		}
	case "purchase_slot":
		if body.OwnerID == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		profile, err := a.loadOwnerProfile(ctx, body.OwnerID)
		if err != nil {
			httpErr(w, err)
			return
		}
		if profile.ExtraSlots+freeShopSlots >= maxShopSlots {
			http.Error(w, "max_slots", http.StatusBadRequest)
			return
		}
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.merchant_owner_profiles (owner_id, extra_slots, updated_at)
			VALUES ($1, 1, NOW())
			ON CONFLICT (owner_id) DO UPDATE SET extra_slots = merchant_owner_profiles.extra_slots + 1, updated_at=NOW()`,
			body.OwnerID)
		if err != nil {
			httpErr(w, err)
			return
		}
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	shop, _ := a.loadShopByID(ctx, body.ShopID)
	jsonOK(w, map[string]any{"ok": true, "shop": shop})
}

func (a *app) loadOwnerProfile(ctx context.Context, ownerID string) (map[string]any, error) {
	var extra int
	_ = a.pool.QueryRow(ctx, `SELECT extra_slots FROM commerce.merchant_owner_profiles WHERE owner_id=$1`, ownerID).Scan(&extra)
	return map[string]any{
		"owner_id":    ownerID,
		"extra_slots": extra,
	}, nil
}

func (a *app) loadShopsForOwner(ctx context.Context, ownerID string) ([]merchantShop, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT id, owner_id, name, shop_type, status, created_at::text, approved_at::text, rejected_reason
		FROM commerce.merchant_shops WHERE owner_id=$1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanShopRows(rows)
}

func (a *app) loadSystemShops(ctx context.Context) ([]merchantShop, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT id, owner_id, name, shop_type, status, created_at::text, approved_at::text, rejected_reason
		FROM commerce.merchant_shops WHERE owner_id='*' AND status='approved'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanShopRows(rows)
}

func (a *app) loadShopByID(ctx context.Context, id string) (*merchantShop, error) {
	var s merchantShop
	var approved, rejected *string
	err := a.pool.QueryRow(ctx, `
		SELECT id, owner_id, name, shop_type, status, created_at::text, approved_at::text, rejected_reason
		FROM commerce.merchant_shops WHERE id=$1`, id).
		Scan(&s.ID, &s.OwnerID, &s.Name, &s.Type, &s.Status, &s.CreatedAt, &approved, &rejected)
	if err != nil {
		return nil, err
	}
	s.ApprovedAt = approved
	s.RejectedReason = rejected
	return &s, nil
}

func scanShopRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}) ([]merchantShop, error) {
	var out []merchantShop
	for rows.Next() {
		var s merchantShop
		var approved, rejected *string
		if rows.Scan(&s.ID, &s.OwnerID, &s.Name, &s.Type, &s.Status, &s.CreatedAt, &approved, &rejected) != nil {
			continue
		}
		s.ApprovedAt = approved
		s.RejectedReason = rejected
		out = append(out, s)
	}
	return out, nil
}

func slotUsage(profile map[string]any, shops []merchantShop) map[string]any {
	extra, _ := profile["extra_slots"].(int)
	max := freeShopSlots + extra
	if max > maxShopSlots {
		max = maxShopSlots
	}
	used, approved, pending := 0, 0, 0
	for _, s := range shops {
		if s.OwnerID == "*" {
			continue
		}
		if s.Status != "rejected" {
			used++
		}
		if s.Status == "approved" {
			approved++
		}
		if s.Status == "pending" {
			pending++
		}
	}
	return map[string]any{
		"used": used, "approved": approved, "pending": pending,
		"max": max, "free_base": freeShopSlots, "extra_slots": extra,
	}
}

func (a *app) shopOwnerForMerchant(ctx context.Context, merchantID string) string {
	var owner string
	_ = a.pool.QueryRow(ctx, `SELECT owner_id FROM commerce.merchant_shops WHERE id=$1`, merchantID).Scan(&owner)
	if owner == "*" {
		return ""
	}
	return owner
}
