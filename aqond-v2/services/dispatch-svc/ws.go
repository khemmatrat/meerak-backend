package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type wsHub struct {
	mu    sync.RWMutex
	rooms map[string]map[*websocket.Conn]struct{}
}

func newWSHub() *wsHub {
	return &wsHub{rooms: map[string]map[*websocket.Conn]struct{}{}}
}

func (h *wsHub) join(orderID string, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[orderID] == nil {
		h.rooms[orderID] = map[*websocket.Conn]struct{}{}
	}
	h.rooms[orderID][c] = struct{}{}
}

func (h *wsHub) leave(orderID string, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.rooms[orderID]; m != nil {
		delete(m, c)
		if len(m) == 0 {
			delete(h.rooms, orderID)
		}
	}
}

func (h *wsHub) broadcast(orderID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[orderID] {
		if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Printf("ws write: %v", err)
		}
	}
}

func (a *app) wsTrack(w http.ResponseWriter, r *http.Request) {
	orderID := r.URL.Query().Get("order_id")
	if orderID == "" {
		http.Error(w, "order_id required", http.StatusBadRequest)
		return
	}
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	a.wsHub.join(orderID, conn)
	defer a.wsHub.leave(orderID, conn)

	ctx := r.Context()
	j, err := a.loadJobByOrder(ctx, orderID)
	if err != nil {
		_ = conn.WriteJSON(map[string]any{"type": "error", "error": "tracking_not_found"})
		return
	}
	rider, _ := a.loadRider(ctx, j.RiderID)
	hasReview, _ := a.hasReview(ctx, orderID)
	chats, _ := a.loadChat(ctx, orderID)
	view := buildTrackingView(j, rider, hasReview, chats)
	raw, _ := json.Marshal(map[string]any{"type": "snapshot", "tracking": view})
	_ = conn.WriteMessage(websocket.TextMessage, raw)

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
