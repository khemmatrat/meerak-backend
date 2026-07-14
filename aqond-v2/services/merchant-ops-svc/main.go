// merchant-ops-svc — Phase 5: shop hours, sold-out, promos, staff in Postgres.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool *pgxpool.Pool
}

type shopOps struct {
	MerchantID       string   `json:"merchant_id"`
	AutoSchedule     bool     `json:"auto_schedule"`
	OpenTime         string   `json:"open_time"`
	CloseTime        string   `json:"close_time"`
	ManualClosed     bool     `json:"manual_closed"`
	ClosedNote       string   `json:"closed_note"`
	SoldOutItemIDs   []string `json:"sold_out_item_ids"`
	BusyMode         bool     `json:"busy_mode"`
	BusyExtraMinutes int      `json:"busy_extra_minutes"`
	BusyUntil        *string  `json:"busy_until,omitempty"`
	AutoAcceptOrders bool     `json:"auto_accept_orders"`
}

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/v1/merchant-ops/shop-ops", a.shopOps)
	mux.HandleFunc("/v1/merchant-ops/shops", a.shops)
	mux.HandleFunc("/v1/merchant-ops/promotions", a.promotions)
	mux.HandleFunc("/v1/merchant-ops/staff/shops", a.staffShops)
	mux.HandleFunc("/v1/merchant-ops/staff", a.staff)
	mux.HandleFunc("/v1/merchant-ops/dashboard", a.dashboard)
	mux.HandleFunc("/v1/merchant-ops/wallet", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/wallet/", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/wallet/sync", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/wallet/sync/", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/fees", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/fees/", a.walletFeesRoot)
	mux.HandleFunc("/v1/merchant-ops/tier", a.sellerTier)

	port := config.Int("PORT", 8143)
	log.Printf("merchant-ops-svc :%d phase5", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "merchant-ops-svc", "phase": 5})
}

func (a *app) shopOps(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.getShopOps(w, r)
	case http.MethodPatch, http.MethodPost:
		a.patchShopOps(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) getShopOps(w http.ResponseWriter, r *http.Request) {
	mid := r.URL.Query().Get("merchant_id")
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ops, err := a.loadShopOps(r.Context(), mid)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"ops": ops})
}

func (a *app) patchShopOps(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID       string   `json:"merchant_id"`
		Action           string   `json:"action"`
		AutoSchedule     *bool    `json:"auto_schedule"`
		OpenTime         string   `json:"open_time"`
		CloseTime        string   `json:"close_time"`
		ManualClosed     *bool    `json:"manual_closed"`
		ClosedNote       string   `json:"closed_note"`
		AutoAcceptOrders *bool    `json:"auto_accept_orders"`
		ItemID           string   `json:"item_id"`
		SoldOut          *bool    `json:"sold_out"`
		Minutes          int      `json:"minutes"`
		Closed           *bool    `json:"closed"`
		Note             string   `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	ops, _ := a.loadShopOps(ctx, body.MerchantID)

	switch body.Action {
	case "manual_close":
		if body.Closed != nil {
			ops.ManualClosed = *body.Closed
		}
		if body.Note != "" {
			ops.ClosedNote = body.Note
		}
	case "busy":
		if body.Minutes <= 0 {
			ops.BusyMode = false
			ops.BusyExtraMinutes = 0
			ops.BusyUntil = nil
		} else {
			ops.BusyMode = true
			ops.BusyExtraMinutes = body.Minutes
			until := time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)
			ops.BusyUntil = &until
		}
	case "sold_out":
		if body.ItemID != "" && body.SoldOut != nil {
			set := map[string]bool{}
			for _, id := range ops.SoldOutItemIDs {
				set[id] = true
			}
			if *body.SoldOut {
				set[body.ItemID] = true
			} else {
				delete(set, body.ItemID)
			}
			ops.SoldOutItemIDs = keys(set)
		}
	default:
		if body.AutoSchedule != nil {
			ops.AutoSchedule = *body.AutoSchedule
		}
		if body.OpenTime != "" {
			ops.OpenTime = body.OpenTime
		}
		if body.CloseTime != "" {
			ops.CloseTime = body.CloseTime
		}
		if body.ManualClosed != nil {
			ops.ManualClosed = *body.ManualClosed
		}
		if body.ClosedNote != "" {
			ops.ClosedNote = body.ClosedNote
		}
		if body.AutoAcceptOrders != nil {
			ops.AutoAcceptOrders = *body.AutoAcceptOrders
		}
	}

	if err := a.saveShopOps(ctx, ops); err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"ok": true, "ops": ops})
}

func (a *app) loadShopOps(ctx context.Context, merchantID string) (shopOps, error) {
	var raw []byte
	var busyUntil *time.Time
	ops := shopOps{MerchantID: merchantID, AutoSchedule: true, OpenTime: "09:00", CloseTime: "21:00"}
	err := a.pool.QueryRow(ctx, `
		SELECT auto_schedule, open_time, close_time, manual_closed, closed_note,
		       sold_out_item_ids, busy_mode, busy_extra_minutes, busy_until, auto_accept_orders
		FROM commerce.merchant_shop_ops WHERE merchant_id=$1`, merchantID).Scan(
		&ops.AutoSchedule, &ops.OpenTime, &ops.CloseTime, &ops.ManualClosed, &ops.ClosedNote,
		&raw, &ops.BusyMode, &ops.BusyExtraMinutes, &busyUntil, &ops.AutoAcceptOrders)
	if err != nil {
		return ops, nil
	}
	_ = json.Unmarshal(raw, &ops.SoldOutItemIDs)
	if busyUntil != nil {
		s := busyUntil.UTC().Format(time.RFC3339)
		ops.BusyUntil = &s
	}
	return ops, nil
}

func (a *app) saveShopOps(ctx context.Context, ops shopOps) error {
	raw, _ := json.Marshal(ops.SoldOutItemIDs)
	var busyUntil any
	if ops.BusyUntil != nil {
		t, _ := time.Parse(time.RFC3339, *ops.BusyUntil)
		busyUntil = t
	}
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.merchant_shop_ops (
		  merchant_id, auto_schedule, open_time, close_time, manual_closed, closed_note,
		  sold_out_item_ids, busy_mode, busy_extra_minutes, busy_until, auto_accept_orders, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
		ON CONFLICT (merchant_id) DO UPDATE SET
		  auto_schedule=EXCLUDED.auto_schedule, open_time=EXCLUDED.open_time,
		  close_time=EXCLUDED.close_time, manual_closed=EXCLUDED.manual_closed,
		  closed_note=EXCLUDED.closed_note, sold_out_item_ids=EXCLUDED.sold_out_item_ids,
		  busy_mode=EXCLUDED.busy_mode, busy_extra_minutes=EXCLUDED.busy_extra_minutes,
		  busy_until=EXCLUDED.busy_until, auto_accept_orders=EXCLUDED.auto_accept_orders,
		  updated_at=NOW()`,
		ops.MerchantID, ops.AutoSchedule, ops.OpenTime, ops.CloseTime, ops.ManualClosed, ops.ClosedNote,
		raw, ops.BusyMode, ops.BusyExtraMinutes, busyUntil, ops.AutoAcceptOrders)
	return err
}

func (a *app) promotions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		mid := r.URL.Query().Get("merchant_id")
		if mid == "" {
			http.Error(w, "merchant_id required", http.StatusBadRequest)
			return
		}
		rows, err := a.pool.Query(r.Context(), `
			SELECT id, merchant_id, kind, label, active, item_ids, discount_percent,
			       window_start, window_end, min_order_micro, ends_at, created_at::text
			FROM commerce.merchant_food_promotions WHERE merchant_id=$1 ORDER BY created_at DESC`, mid)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		var list []map[string]any
		for rows.Next() {
			var id, merchantID, kind, label, ws, we, created string
			var active bool
			var raw []byte
			var disc *int
			var minOrder *int64
			var endsAt *time.Time
			if rows.Scan(&id, &merchantID, &kind, &label, &active, &raw, &disc, &ws, &we, &minOrder, &endsAt, &created) != nil {
				continue
			}
			var itemIDs []string
			_ = json.Unmarshal(raw, &itemIDs)
			m := map[string]any{
				"id": id, "merchant_id": merchantID, "kind": kind, "label": label,
				"active": active, "item_ids": itemIDs, "created_at": created,
			}
			if disc != nil {
				m["discount_percent"] = *disc
			}
			if ws != "" {
				m["window_start"] = ws
			}
			if we != "" {
				m["window_end"] = we
			}
			if minOrder != nil {
				m["min_order_micro"] = *minOrder
			}
			if endsAt != nil {
				m["ends_at"] = endsAt.UTC().Format(time.RFC3339)
			}
			list = append(list, m)
		}
		jsonOK(w, map[string]any{"promotions": list})
	case http.MethodPost:
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		mid, _ := body["merchant_id"].(string)
		if mid == "" {
			http.Error(w, "merchant_id required", http.StatusBadRequest)
			return
		}
		id, _ := body["id"].(string)
		if id == "" {
			id = ulid.New()
		}
		itemRaw, _ := json.Marshal(body["item_ids"])
		_, err := a.pool.Exec(r.Context(), `
			INSERT INTO commerce.merchant_food_promotions (
			  id, merchant_id, kind, label, active, item_ids, discount_percent,
			  window_start, window_end, min_order_micro, ends_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			ON CONFLICT (id) DO UPDATE SET
			  kind=EXCLUDED.kind, label=EXCLUDED.label, active=EXCLUDED.active,
			  item_ids=EXCLUDED.item_ids, discount_percent=EXCLUDED.discount_percent,
			  window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end,
			  min_order_micro=EXCLUDED.min_order_micro, ends_at=EXCLUDED.ends_at`,
			id, mid, body["kind"], body["label"], body["active"], itemRaw,
			body["discount_percent"], body["window_start"], body["window_end"],
			body["min_order_micro"], body["ends_at"])
		if err != nil {
			httpErr(w, err)
			return
		}
		jsonOK(w, map[string]any{"ok": true, "id": id})
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id required", http.StatusBadRequest)
			return
		}
		_, _ = a.pool.Exec(r.Context(), `DELETE FROM commerce.merchant_food_promotions WHERE id=$1`, id)
		jsonOK(w, map[string]any{"deleted": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) staff(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		owner := r.URL.Query().Get("owner_id")
		user := r.URL.Query().Get("user_id")
		merchant := r.URL.Query().Get("merchant_id")
		ctx := r.Context()
		if user != "" && merchant != "" {
			jsonOK(w, map[string]any{"permissions": a.resolveAccess(ctx, user, merchant, owner)})
			return
		}
		if owner == "" {
			http.Error(w, "owner_id required", http.StatusBadRequest)
			return
		}
		rows, err := a.pool.Query(ctx, `
			SELECT id, owner_id, user_id, display_name, role, shop_ids, created_at::text
			FROM commerce.merchant_staff WHERE owner_id=$1`, owner)
		if err != nil {
			httpErr(w, err)
			return
		}
		defer rows.Close()
		var members []map[string]any
		for rows.Next() {
			var id, oid, uid, name, role, created string
			var raw []byte
			if rows.Scan(&id, &oid, &uid, &name, &role, &raw, &created) != nil {
				continue
			}
			var shops []string
			_ = json.Unmarshal(raw, &shops)
			members = append(members, map[string]any{
				"id": id, "owner_id": oid, "user_id": uid, "display_name": name,
				"role": role, "shop_ids": shops, "created_at": created,
			})
		}
		jsonOK(w, map[string]any{"members": members})
	case http.MethodPost:
		var body struct {
			OwnerID     string   `json:"owner_id"`
			UserID      string   `json:"user_id"`
			DisplayName string   `json:"display_name"`
			Role        string   `json:"role"`
			ShopIDs     []string `json:"shop_ids"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.OwnerID == "" || body.UserID == "" {
			http.Error(w, "owner_id and user_id required", http.StatusBadRequest)
			return
		}
		if body.Role == "" {
			body.Role = "staff"
		}
		id := ulid.New()
		raw, _ := json.Marshal(body.ShopIDs)
		_, err := a.pool.Exec(r.Context(), `
			INSERT INTO commerce.merchant_staff (id, owner_id, user_id, display_name, role, shop_ids)
			VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT (owner_id, user_id) DO UPDATE SET
			  display_name=EXCLUDED.display_name, role=EXCLUDED.role, shop_ids=EXCLUDED.shop_ids`,
			id, body.OwnerID, body.UserID, body.DisplayName, body.Role, raw)
		if err != nil {
			httpErr(w, err)
			return
		}
		jsonOK(w, map[string]any{"ok": true})
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		owner := r.URL.Query().Get("owner_id")
		if id == "" || owner == "" {
			http.Error(w, "id and owner_id required", http.StatusBadRequest)
			return
		}
		tag, err := a.pool.Exec(r.Context(), `
			DELETE FROM commerce.merchant_staff WHERE id=$1 AND owner_id=$2`, id, owner)
		if err != nil {
			httpErr(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "not_found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"ok": true, "deleted": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) resolveAccess(ctx context.Context, userID, merchantID, ownerID string) map[string]any {
	if ownerID != "" && userID == ownerID {
		return ownerPerms()
	}
	var shopOwner string
	_ = a.pool.QueryRow(ctx, `SELECT owner_id FROM commerce.merchant_shops WHERE id=$1`, merchantID).Scan(&shopOwner)
	if shopOwner != "" && shopOwner != "*" && shopOwner == userID {
		return ownerPerms()
	}
	var role string
	var raw []byte
	err := a.pool.QueryRow(ctx, `
		SELECT role, shop_ids FROM commerce.merchant_staff
		WHERE user_id=$1 LIMIT 1`, userID).Scan(&role, &raw)
	if err != nil {
		return denyPerms()
	}
	var shops []string
	_ = json.Unmarshal(raw, &shops)
	for _, s := range shops {
		if s == merchantID || s == "*" {
			if role == "owner" {
				return ownerPerms()
			}
			return staffPerms()
		}
	}
	return denyPerms()
}

func (a *app) dashboard(w http.ResponseWriter, r *http.Request) {
	mid := r.URL.Query().Get("merchant_id")
	if mid == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var pending, preparing, ready int
	_ = a.pool.QueryRow(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE fulfillment_status IN ('pending_accept','pending_ship')),
		  COUNT(*) FILTER (WHERE fulfillment_status='preparing'),
		  COUNT(*) FILTER (WHERE fulfillment_status='ready')
		FROM commerce.orders WHERE merchant_id=$1`, mid).Scan(&pending, &preparing, &ready)

	var slaBreaches int
	_ = a.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM commerce.orders
		WHERE merchant_id=$1 AND fulfillment_status IN ('pending_accept','pending_ship')
		  AND created_at < NOW() - INTERVAL '15 minutes'`, mid).Scan(&slaBreaches)

	jsonOK(w, map[string]any{
		"merchant_id": mid,
		"pending_orders": pending,
		"preparing_orders": preparing,
		"ready_orders": ready,
		"sla_breaches": slaBreaches,
	})
}

func ownerPerms() map[string]any {
	return map[string]any{
		"role": "owner", "can_accept_orders": true, "can_edit_menu": true,
		"can_withdraw_wallet": true, "can_manage_staff": true, "can_manage_shop_settings": true,
	}
}

func staffPerms() map[string]any {
	return map[string]any{
		"role": "staff", "can_accept_orders": true, "can_edit_menu": false,
		"can_withdraw_wallet": false, "can_manage_staff": false, "can_manage_shop_settings": false,
	}
}

func denyPerms() map[string]any {
	return map[string]any{
		"role": "none", "can_accept_orders": false, "can_edit_menu": false,
		"can_withdraw_wallet": false, "can_manage_staff": false, "can_manage_shop_settings": false,
	}
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
