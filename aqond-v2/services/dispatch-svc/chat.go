package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

type chatRow struct {
	FromRole string `json:"from"`
	Text     string `json:"text"`
	At       string `json:"at"`
}

func (a *app) loadChat(ctx context.Context, orderID string) ([]chatRow, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT from_role, body, created_at::text
		FROM commerce.dispatch_chat_messages
		WHERE order_id=$1 ORDER BY created_at ASC LIMIT 100`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []chatRow
	for rows.Next() {
		var c chatRow
		if rows.Scan(&c.FromRole, &c.Text, &c.At) == nil {
			out = append(out, c)
		}
	}
	return out, nil
}

func (a *app) addChat(ctx context.Context, orderID, fromRole, text string) ([]chatRow, error) {
	j, err := a.loadJobByOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	id := ulid.New()
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_chat_messages (id, job_id, order_id, from_role, body)
		VALUES ($1,$2,$3,$4,$5)`, id, j.ID, orderID, fromRole, text)
	if err != nil {
		return nil, err
	}
	return a.loadChat(ctx, orderID)
}

func (a *app) trackChat(w http.ResponseWriter, r *http.Request, orderID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		From string `json:"from"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	from := body.From
	if from != "rider" && from != "customer" {
		from = "customer"
	}
	if body.Text == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	chats, err := a.addChat(ctx, orderID, from, body.Text)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	j, _ := a.loadJobByOrder(ctx, orderID)
	rider, _ := a.loadRider(ctx, j.RiderID)
	hasReview, _ := a.hasReview(ctx, orderID)
	view := buildTrackingView(j, rider, hasReview, chats)
	a.publishTrackUpdate(ctx, orderID, map[string]any{"type": "update", "order_id": orderID, "tracking": view})
	jsonOK(w, view)
}
