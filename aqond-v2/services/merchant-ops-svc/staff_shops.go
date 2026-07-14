package main

import (
	"encoding/json"
	"net/http"
)

var demoShopNames = map[string]struct {
	Name string
	Type string
}{
	"demo-merchant": {"ร้านค้า Demo", "marketplace"},
	"food-thai-1":   {"ครัวบ้านสวน", "food"},
	"food-jp-1":     {"ซูชิโฮมุระ", "food"},
	"food-cafe-1":   {"Matcha House", "food"},
	"m-fashion-1":   {"Fashion Corner", "marketplace"},
}

func (a *app) staffShops(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT owner_id, role, shop_ids FROM commerce.merchant_staff WHERE user_id=$1`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var shops []map[string]any
	role := "owner"
	seen := map[string]bool{}
	for rows.Next() {
		var ownerID, staffRole string
		var raw []byte
		if rows.Scan(&ownerID, &staffRole, &raw) != nil {
			continue
		}
		role = staffRole
		var ids []string
		_ = json.Unmarshal(raw, &ids)
		for _, id := range ids {
			if id == "*" {
				for sid, meta := range demoShopNames {
					if seen[sid] {
						continue
					}
					seen[sid] = true
					shops = append(shops, map[string]any{
						"id": sid, "name": meta.Name, "type": meta.Type, "owner_id": ownerID,
					})
				}
				continue
			}
			if seen[id] {
				continue
			}
			seen[id] = true
			meta := demoShopNames[id]
			name, typ := id, "marketplace"
			if meta.Name != "" {
				name, typ = meta.Name, meta.Type
			}
			shops = append(shops, map[string]any{
				"id": id, "name": name, "type": typ, "owner_id": ownerID,
			})
		}
	}
	if len(shops) == 0 {
		role = "owner"
	}
	jsonOK(w, map[string]any{"user_id": userID, "role": role, "shops": shops})
}
