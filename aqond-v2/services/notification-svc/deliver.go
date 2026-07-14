package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func (a *app) deliverNotification(id, recipientID, channel, rendered string, payload map[string]string) {
	switch channel {
	case "line":
		a.deliverLine(recipientID, rendered, payload)
	case "push":
		a.deliverPush(recipientID, rendered, payload)
	default:
		log.Printf("notify deliver [%s] %s → %s", channel, recipientID, rendered)
	}
}

func (a *app) deliverLine(userID, body string, _ map[string]string) {
	token := os.Getenv("LINE_CHANNEL_ACCESS_TOKEN")
	if token == "" {
		log.Printf("line notify (stub) user=%s body=%s", userID, body)
		return
	}
	var lineUserID string
	_ = a.pool.QueryRow(context.Background(), `
		SELECT COALESCE(ls.line_user_id, ai.line_user_id, '')
		FROM commerce.auth_identities ai
		LEFT JOIN commerce.line_subscriptions ls ON ls.user_id = ai.user_id
		WHERE ai.user_id = $1 LIMIT 1`, userID).Scan(&lineUserID)
	if lineUserID == "" {
		_ = a.pool.QueryRow(context.Background(), `
			SELECT line_user_id FROM commerce.line_subscriptions WHERE user_id=$1 LIMIT 1`, userID).Scan(&lineUserID)
	}
	if lineUserID == "" {
		log.Printf("line notify skip: no subscription user=%s", userID)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"to": lineUserID,
		"messages": []map[string]string{{"type": "text", "text": body}},
	})
	req, err := http.NewRequest(http.MethodPost, "https://api.line.me/v2/bot/message/push", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("line deliver err: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("line deliver http %d user=%s", resp.StatusCode, userID)
	}
}

func (a *app) deliverPush(userID, body string, payload map[string]string) {
	fcmKey := os.Getenv("FCM_SERVER_KEY")
	if fcmKey != "" {
		rows, err := a.pool.Query(context.Background(), `
			SELECT COALESCE(NULLIF(fcm_token,''), token) FROM commerce.push_registrations
			WHERE user_id=$1 AND COALESCE(NULLIF(fcm_token,''), token) <> ''`, userID)
		if err == nil {
			defer rows.Close()
			title := "AQOND"
			if t := payload["title"]; t != "" {
				title = t
			}
			for rows.Next() {
				var tok string
				if rows.Scan(&tok) == nil && tok != "" {
					a.sendFCM(fcmKey, tok, title, body, payload)
				}
			}
		}
		return
	}
	url := strings.TrimRight(os.Getenv("NOTIFY_SERVICE_URL"), "/")
	if url == "" {
		url = "http://notify-service:8096"
	}
	notifyPayload, _ := json.Marshal(map[string]any{
		"user_id": userID,
		"title":   "AQOND",
		"body":    body,
	})
	resp, err := http.Post(url+"/push", "application/json", bytes.NewReader(notifyPayload))
	if err != nil {
		log.Printf("push deliver err: %v", err)
		return
	}
	resp.Body.Close()
}

func (a *app) sendFCM(serverKey, deviceToken, title, body string, payload map[string]string) {
	data := map[string]string{"title": title, "body": body}
	if u := payload["url"]; u != "" {
		data["url"] = u
	}
	msg, _ := json.Marshal(map[string]any{
		"to":           deviceToken,
		"notification": map[string]string{"title": title, "body": body},
		"data":         data,
	})
	req, err := http.NewRequest(http.MethodPost, "https://fcm.googleapis.com/fcm/send", bytes.NewReader(msg))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "key="+serverKey)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("fcm err: %v", err)
		return
	}
	resp.Body.Close()
}

func (a *app) markSent(ctx context.Context, id string) {
	_, _ = a.pool.Exec(ctx, `
		UPDATE commerce.notifications SET status='sent', sent_at=NOW() WHERE id=$1`, id)
	mSent.Add(1)
}

var _ = time.Now
