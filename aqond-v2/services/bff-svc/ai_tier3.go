package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5"
)

func (a *app) aiTier3Router(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/ai/tier3")
	switch {
	case path == "/incidents" && r.Method == http.MethodPost:
		a.aiTier3SaveIncident(w, r)
	case path == "/incidents" && r.Method == http.MethodGet:
		a.aiTier3ListIncidents(w, r)
	case path == "/user-preferences" && r.Method == http.MethodGet:
		a.aiTier3GetPrefs(w, r)
	case path == "/user-preferences" && r.Method == http.MethodPost:
		a.aiTier3SavePrefs(w, r)
	case path == "/merchant-session" && r.Method == http.MethodPost:
		a.aiTier3MerchantSession(w, r)
	case path == "/rider-session" && r.Method == http.MethodPost:
		a.aiTier3RiderSession(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (a *app) aiTier3SaveIncident(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RiderID    string   `json:"rider_id"`
		JobID      string   `json:"job_id"`
		OrderID    string   `json:"order_id"`
		Transcript string   `json:"transcript"`
		Category   string   `json:"category"`
		Lat        *float64 `json:"lat"`
		Lng        *float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.RiderID == "" || body.Transcript == "" {
		http.Error(w, "rider_id and transcript required", http.StatusBadRequest)
		return
	}
	if body.Category == "" {
		body.Category = "general"
	}
	id := ulid.New()
	ctx := r.Context()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.rider_voice_incidents
		  (id, rider_id, job_id, order_id, transcript, category, lat, lng, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')`,
		id, body.RiderID, nullStr(body.JobID), nullStr(body.OrderID),
		body.Transcript, body.Category, body.Lat, body.Lng)
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{
		"ok": true,
		"incident": map[string]any{
			"id": id, "rider_id": body.RiderID, "job_id": body.JobID,
			"order_id": body.OrderID, "transcript": body.Transcript,
			"category": body.Category, "status": "open",
		},
	})
}

func (a *app) aiTier3ListIncidents(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	limit := 20
	ctx := r.Context()
	var rows pgx.Rows
	var err error
	if jobID != "" {
		rows, err = a.pool.Query(ctx, `
			SELECT id, rider_id, job_id, order_id, transcript, category, status, created_at::text
			FROM commerce.rider_voice_incidents WHERE job_id=$1
			ORDER BY created_at DESC LIMIT $2`, jobID, limit)
	} else {
		rows, err = a.pool.Query(ctx, `
			SELECT id, rider_id, job_id, order_id, transcript, category, status, created_at::text
			FROM commerce.rider_voice_incidents
			ORDER BY created_at DESC LIMIT $1`, limit)
	}
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, riderID, transcript, category, status, createdAt string
		var jobIDv, orderID *string
		if err := rows.Scan(&id, &riderID, &jobIDv, &orderID, &transcript, &category, &status, &createdAt); err != nil {
			httpErr(w, err)
			return
		}
		row := map[string]any{
			"id": id, "rider_id": riderID, "transcript": transcript,
			"category": category, "status": status, "created_at": createdAt,
		}
		if jobIDv != nil {
			row["job_id"] = *jobIDv
		}
		if orderID != nil {
			row["order_id"] = *orderID
		}
		out = append(out, row)
	}
	jsonOK(w, map[string]any{"ok": true, "incidents": out})
}

func (a *app) aiTier3GetPrefs(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var voice bool
	var locale string
	var tips bool
	var ctxJSON []byte
	err := a.pool.QueryRow(ctx, `
		SELECT jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json
		FROM commerce.user_ai_preferences WHERE user_id=$1`, userID).
		Scan(&voice, &locale, &tips, &ctxJSON)
	if err != nil {
		jsonOK(w, map[string]any{
			"ok": true,
			"preferences": map[string]any{
				"user_id": userID, "jarvis_voice_enabled": true,
				"jarvis_locale": "th-TH", "notify_ai_tips": true, "context_json": map[string]any{},
			},
			"source": "default",
		})
		return
	}
	var ctxMap map[string]any
	_ = json.Unmarshal(ctxJSON, &ctxMap)
	jsonOK(w, map[string]any{
		"ok": true,
		"preferences": map[string]any{
			"user_id": userID, "jarvis_voice_enabled": voice,
			"jarvis_locale": locale, "notify_ai_tips": tips, "context_json": ctxMap,
		},
		"source": "postgres",
	})
}

func (a *app) aiTier3SavePrefs(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID             string         `json:"user_id"`
		JarvisVoiceEnabled *bool          `json:"jarvis_voice_enabled"`
		JarvisLocale       string         `json:"jarvis_locale"`
		NotifyAiTips       *bool          `json:"notify_ai_tips"`
		ContextJSON        map[string]any `json:"context_json"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	voice := true
	if body.JarvisVoiceEnabled != nil {
		voice = *body.JarvisVoiceEnabled
	}
	locale := body.JarvisLocale
	if locale == "" {
		locale = "th-TH"
	}
	tips := true
	if body.NotifyAiTips != nil {
		tips = *body.NotifyAiTips
	}
	ctxBytes, _ := json.Marshal(body.ContextJSON)
	ctx := r.Context()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.user_ai_preferences
		  (user_id, jarvis_voice_enabled, jarvis_locale, notify_ai_tips, context_json, updated_at)
		VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		  jarvis_voice_enabled=EXCLUDED.jarvis_voice_enabled,
		  jarvis_locale=EXCLUDED.jarvis_locale,
		  notify_ai_tips=EXCLUDED.notify_ai_tips,
		  context_json=EXCLUDED.context_json,
		  updated_at=NOW()`,
		body.UserID, voice, locale, tips, string(ctxBytes))
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{
		"ok": true,
		"preferences": map[string]any{
			"user_id": body.UserID, "jarvis_voice_enabled": voice,
			"jarvis_locale": locale, "notify_ai_tips": tips, "context_json": body.ContextJSON,
		},
		"source": "postgres",
	})
}

func (a *app) aiTier3MerchantSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MerchantID  string         `json:"merchant_id"`
		OwnerID     string         `json:"owner_id"`
		SessionID   string         `json:"session_id"`
		LastMessage string         `json:"last_message"`
		Context     map[string]any `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.MerchantID == "" {
		http.Error(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	sid := body.SessionID
	if sid == "" {
		sid = "ma-" + body.MerchantID
	}
	ctxBytes, _ := json.Marshal(body.Context)
	ctx := r.Context()
	var existingID string
	err := a.pool.QueryRow(ctx, `
		SELECT id FROM commerce.merchant_ai_sessions
		WHERE merchant_id=$1 AND session_id=$2
		ORDER BY updated_at DESC LIMIT 1`, body.MerchantID, sid).Scan(&existingID)
	if err != nil {
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.merchant_ai_sessions
			  (id, merchant_id, owner_id, session_id, context_json, last_message, updated_at)
			VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW())`,
			ulid.New(), body.MerchantID, body.OwnerID, sid, string(ctxBytes), body.LastMessage)
	} else {
		_, err = a.pool.Exec(ctx, `
			UPDATE commerce.merchant_ai_sessions SET
			  context_json=$2::jsonb, last_message=$3, updated_at=NOW()
			WHERE id=$1`, existingID, string(ctxBytes), body.LastMessage)
	}
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"ok": true})
}

func (a *app) aiTier3RiderSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RiderID   string         `json:"rider_id"`
		JobID     string         `json:"job_id"`
		SessionID string         `json:"session_id"`
		Incident  bool           `json:"incident"`
		Context   map[string]any `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.RiderID == "" {
		http.Error(w, "rider_id required", http.StatusBadRequest)
		return
	}
	sid := body.SessionID
	if sid == "" {
		sid = "ra-" + body.RiderID
	}
	ctxBytes, _ := json.Marshal(body.Context)
	ctx := r.Context()
	var existingID string
	err := a.pool.QueryRow(ctx, `
		SELECT id FROM commerce.rider_ai_sessions
		WHERE rider_id=$1 AND session_id=$2
		ORDER BY updated_at DESC LIMIT 1`, body.RiderID, sid).Scan(&existingID)
	if err != nil {
		inc := 0
		if body.Incident {
			inc = 1
		}
		_, err = a.pool.Exec(ctx, `
			INSERT INTO commerce.rider_ai_sessions
			  (id, rider_id, job_id, session_id, context_json, incident_count, updated_at)
			VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW())`,
			ulid.New(), body.RiderID, nullStr(body.JobID), sid, string(ctxBytes), inc)
	} else {
		incSQL := ""
		if body.Incident {
			incSQL = ", incident_count = incident_count + 1"
		}
		_, err = a.pool.Exec(ctx, `
			UPDATE commerce.rider_ai_sessions SET
			  job_id=COALESCE($2, job_id), context_json=$3::jsonb, updated_at=NOW()`+incSQL+`
			WHERE id=$1`, existingID, nullStr(body.JobID), string(ctxBytes))
	}
	if err != nil {
		httpErr(w, err)
		return
	}
	jsonOK(w, map[string]any{"ok": true})
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
