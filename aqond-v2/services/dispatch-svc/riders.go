package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) ridersRoot(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.registerRider(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) registerRider(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID      string `json:"user_id"`
		DisplayName string `json:"display_name"`
		Phone       string `json:"phone"`
		Vehicle     string `json:"vehicle"`
		Plate       string `json:"plate"`
		BankAccount string `json:"bank_account"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.UserID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	if body.DisplayName == "" {
		body.DisplayName = "ไรเดอร์ใหม่"
	}
	if body.Vehicle == "" {
		body.Vehicle = "motorcycle"
	}
	ctx := r.Context()
	var existingID string
	if a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_riders WHERE user_id=$1 LIMIT 1`, body.UserID).Scan(&existingID) == nil {
		w.WriteHeader(http.StatusConflict)
		jsonOK(w, map[string]any{
			"error":    "already_registered",
			"rider_id": existingID,
			"message":  "บัญชีนี้มีโปรไฟล์ผู้ให้บริการแล้ว — 1 บัญชีต่อ 1 คน",
		})
		return
	}
	id := "rider-" + ulid.New()[:12]
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_riders (
		  id, display_name, phone, vehicle, plate, active, user_id, kyc_status, bank_account
		) VALUES ($1,$2,$3,$4,$5,FALSE,$6,'pending',$7)`,
		id, body.DisplayName, body.Phone, body.Vehicle, body.Plate, body.UserID, body.BankAccount)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"rider_id": id, "kyc_status": "pending", "message": "รอแอดมินอนุมัติ"})
}

func (a *app) riderByUser(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	a.syncRiderFromCloud2(ctx, userID)
	var id, name, phone, vehicle, plate, kyc string
	var active, suspended bool
	var earnings int64
	err := a.pool.QueryRow(ctx, `
		SELECT id, display_name, phone, vehicle, plate, kyc_status, active, suspended, earnings_micro
		FROM commerce.dispatch_riders WHERE user_id=$1 LIMIT 1`, userID).Scan(
		&id, &name, &phone, &vehicle, &plate, &kyc, &active, &suspended, &earnings)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{
		"rider_id": id, "display_name": name, "phone": phone, "vehicle": vehicle,
		"plate": plate, "kyc_status": kyc, "active": active, "suspended": suspended,
		"earnings_micro": earnings,
	})
}

func (a *app) opsStuck(w http.ResponseWriter, r *http.Request) {
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, order_id, merchant_id, status, phase, rider_id, idle_minutes
		FROM commerce.ops_stuck_dispatch ORDER BY idle_minutes DESC LIMIT 50`)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var list []map[string]any
	for rows.Next() {
		var id, oid, mid, st, ph string
		var rid *string
		var idle float64
		if rows.Scan(&id, &oid, &mid, &st, &ph, &rid, &idle) == nil {
			list = append(list, map[string]any{
				"id": id, "order_id": oid, "merchant_id": mid, "status": st,
				"phase": ph, "rider_id": rid, "idle_minutes": idle,
			})
		}
	}
	jsonOK(w, map[string]any{"stuck_jobs": list, "count": len(list)})
}

func (a *app) linkRiderUser(w http.ResponseWriter, r *http.Request, riderID string) {
	var body struct {
		UserID string `json:"user_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.UserID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var boundUser string
	if a.pool.QueryRow(ctx, `SELECT COALESCE(user_id,'') FROM commerce.dispatch_riders WHERE id=$1`, riderID).Scan(&boundUser) != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	if boundUser != "" && boundUser != body.UserID {
		http.Error(w, "rider_bound_to_other_user", http.StatusForbidden)
		return
	}
	var otherRider string
	if a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_riders WHERE user_id=$1 AND id <> $2 LIMIT 1`, body.UserID, riderID).Scan(&otherRider) == nil {
		http.Error(w, "user_already_has_rider", http.StatusConflict)
		return
	}
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_riders SET user_id=$2 WHERE id=$1 AND (user_id IS NULL OR user_id='' OR user_id=$2)`, riderID, body.UserID)
	if err != nil {
		httpErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "rider_id": riderID, "user_id": body.UserID})
}

func (a *app) suspendRider(w http.ResponseWriter, r *http.Request, riderID string) {
	var body struct {
		Suspended bool   `json:"suspended"`
		Reason    string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	_, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.dispatch_riders SET suspended=$2 WHERE id=$1`, riderID, body.Suspended)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"rider_id": riderID, "suspended": body.Suspended})
}

func (a *app) approveRider(w http.ResponseWriter, r *http.Request, riderID string) {
	_, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.dispatch_riders SET active=TRUE, kyc_status='approved' WHERE id=$1`, riderID)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"rider_id": riderID, "active": true, "kyc_status": "approved"})
}

func (a *app) ridersSub(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/dispatch/riders/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		a.ridersRoot(w, r)
		return
	}
	if parts[0] == "me" {
		if len(parts) == 1 && r.Method == http.MethodGet {
			a.riderByUser(w, r)
			return
		}
		if len(parts) >= 2 && parts[1] == "earnings" && r.Method == http.MethodGet {
			a.riderEarnings(w, r)
			return
		}
		if len(parts) >= 2 && parts[1] == "withdraw" && r.Method == http.MethodPost {
			a.riderWithdraw(w, r)
			return
		}
	}
	if len(parts) >= 2 && parts[1] == "link-user" && r.Method == http.MethodPost {
		a.linkRiderUser(w, r, parts[0])
		return
	}
	if len(parts) >= 2 && parts[1] == "suspend" && r.Method == http.MethodPost {
		a.suspendRider(w, r, parts[0])
		return
	}
	if len(parts) >= 2 && parts[1] == "approve" && r.Method == http.MethodPost {
		a.approveRider(w, r, parts[0])
		return
	}
	if len(parts) >= 3 && parts[1] == "payouts" && parts[2] != "" && r.Method == http.MethodPost {
		a.approveRiderPayout(w, r, parts[0], parts[2])
		return
	}
	http.NotFound(w, r)
}

