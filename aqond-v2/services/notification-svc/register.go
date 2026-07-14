package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

func (a *app) pushRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID   string `json:"user_id"`
		FcmToken string `json:"fcm_token"`
		Token    string `json:"token"`
		Platform string `json:"platform"`
		Source   string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	userID := strings.TrimSpace(body.UserID)
	if userID == "" {
		userID = strings.TrimSpace(r.Header.Get("X-User-Id"))
	}
	tok := strings.TrimSpace(body.FcmToken)
	if tok == "" {
		tok = strings.TrimSpace(body.Token)
	}
	if userID == "" || tok == "" {
		http.Error(w, "user_id and fcm_token required", http.StatusBadRequest)
		return
	}
	platform := strings.ToLower(strings.TrimSpace(body.Platform))
	if platform == "" {
		platform = strings.ToLower(strings.TrimSpace(body.Source))
	}
	if platform == "" {
		platform = "web"
	}
	switch platform {
	case "web", "ios", "android", "mobile":
		if platform == "mobile" {
			platform = "android"
		}
	default:
		platform = "web"
	}
	endpoint := fmt.Sprintf("fcm:%s", platform)
	ctx := r.Context()
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.push_registrations (id, user_id, platform, endpoint, token, fcm_token)
		VALUES ($1,$2,$3,$4,$5,$5)
		ON CONFLICT (user_id, endpoint) DO UPDATE SET
			token = EXCLUDED.token,
			fcm_token = EXCLUDED.fcm_token,
			platform = EXCLUDED.platform`,
		id, userID, platform, endpoint, tok)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.notification_prefs (user_id, category, channel, enabled)
		VALUES ($1,'orders','push',true)
		ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = true`, userID)
	jsonOK(w, map[string]any{"ok": true, "user_id": userID, "platform": platform})
}

func (a *app) pushStatus(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT platform, COALESCE(NULLIF(fcm_token,''), token), endpoint, created_at
		FROM commerce.push_registrations WHERE user_id=$1`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var devices []map[string]any
	for rows.Next() {
		var platform, tok, endpoint string
		var created time.Time
		if rows.Scan(&platform, &tok, &endpoint, &created) == nil {
			devices = append(devices, map[string]any{
				"platform": platform, "endpoint": endpoint, "registered": tok != "", "created_at": created,
			})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "push_enabled": len(devices) > 0, "devices": devices})
}

func (a *app) lineLink(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UserID      string `json:"user_id"`
		LineUserID  string `json:"line_user_id"`
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	userID := strings.TrimSpace(body.UserID)
	lineUID := strings.TrimSpace(body.LineUserID)
	if userID == "" {
		userID = strings.TrimSpace(r.Header.Get("X-User-Id"))
	}
	if userID == "" || lineUID == "" {
		http.Error(w, "user_id and line_user_id required", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.DisplayName)
	ctx := r.Context()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.line_subscriptions (user_id, line_user_id, display_name)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET line_user_id=EXCLUDED.line_user_id, display_name=EXCLUDED.display_name`,
		userID, lineUID, name)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.auth_identities (user_id, line_user_id, line_display_name, display_name, updated_at)
		VALUES ($1,$2,$3,$3,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			line_user_id=EXCLUDED.line_user_id,
			line_display_name=EXCLUDED.line_display_name,
			updated_at=NOW()`, userID, lineUID, name)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.notification_prefs (user_id, category, channel, enabled)
		VALUES ($1,'orders','line',true)
		ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = true`, userID)
	jsonOK(w, map[string]any{"ok": true, "user_id": userID, "line_linked": true})
}

func (a *app) lineStatus(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	var lineUID, displayName string
	err := a.pool.QueryRow(r.Context(), `
		SELECT COALESCE(ls.line_user_id, ''), COALESCE(NULLIF(ls.display_name,''), '')
		FROM commerce.line_subscriptions ls WHERE ls.user_id = $1`, userID).Scan(&lineUID, &displayName)
	if err != nil || lineUID == "" {
		_ = a.pool.QueryRow(r.Context(), `
			SELECT COALESCE(line_user_id,''), COALESCE(line_display_name,'')
			FROM commerce.auth_identities WHERE user_id=$1`, userID).Scan(&lineUID, &displayName)
	}
	jsonOK(w, map[string]any{
		"user_id":      userID,
		"line_linked":  lineUID != "",
		"line_user_id": lineUID,
		"display_name": displayName,
	})
}

func (a *app) lineLoginURL(w http.ResponseWriter, r *http.Request) {
	channelID := strings.TrimSpace(os.Getenv("LINE_LOGIN_CHANNEL_ID"))
	if channelID == "" {
		channelID = strings.TrimSpace(os.Getenv("LINE_CHANNEL_ID"))
	}
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	if redirectURI == "" {
		redirectURI = strings.TrimSpace(os.Getenv("LINE_LOGIN_CALLBACK_URL"))
	}
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if channelID == "" || redirectURI == "" {
		jsonOK(w, map[string]any{
			"ok":      false,
			"error":   "line_login_not_configured",
			"message": "Set LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CALLBACK_URL",
		})
		return
	}
	state := userID
	if state == "" {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		state = hex.EncodeToString(b)
	}
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", channelID)
	q.Set("redirect_uri", redirectURI)
	q.Set("state", state)
	q.Set("scope", "profile openid")
	loginURL := "https://access.line.me/oauth2/v2.1/authorize?" + q.Encode()
	jsonOK(w, map[string]any{"ok": true, "url": loginURL, "state": state})
}

func (a *app) lineOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Code        string `json:"code"`
		RedirectURI string `json:"redirect_uri"`
		UserID      string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	channelID := strings.TrimSpace(os.Getenv("LINE_LOGIN_CHANNEL_ID"))
	if channelID == "" {
		channelID = strings.TrimSpace(os.Getenv("LINE_CHANNEL_ID"))
	}
	secret := strings.TrimSpace(os.Getenv("LINE_LOGIN_CHANNEL_SECRET"))
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("LINE_CHANNEL_SECRET"))
	}
	redirectURI := strings.TrimSpace(body.RedirectURI)
	if redirectURI == "" {
		redirectURI = strings.TrimSpace(os.Getenv("LINE_LOGIN_CALLBACK_URL"))
	}
	userID := strings.TrimSpace(body.UserID)
	if body.Code == "" || channelID == "" || secret == "" || redirectURI == "" || userID == "" {
		http.Error(w, "code, user_id, and LINE login credentials required", http.StatusBadRequest)
		return
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", body.Code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", channelID)
	form.Set("client_secret", secret)
	req, err := http.NewRequest(http.MethodPost, "https://api.line.me/oauth2/v2.1/token", strings.NewReader(form.Encode()))
	if err != nil {
		httpErr(w, err)
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		http.Error(w, string(raw), resp.StatusCode)
		return
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(raw, &tok); err != nil || tok.IDToken == "" {
		http.Error(w, "no id_token from LINE", http.StatusBadGateway)
		return
	}
	profReq, _ := http.NewRequest(http.MethodPost, "https://api.line.me/oauth2/v2.1/verify", strings.NewReader(url.Values{
		"id_token":  {tok.IDToken},
		"client_id": {channelID},
	}.Encode()))
	profReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	profResp, err := http.DefaultClient.Do(profReq)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer profResp.Body.Close()
	profRaw, _ := io.ReadAll(profResp.Body)
	var profile struct {
		Sub  string `json:"sub"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(profRaw, &profile); err != nil || profile.Sub == "" {
		http.Error(w, "invalid LINE profile", http.StatusBadGateway)
		return
	}
	r2 := r.Clone(r.Context())
	r2.Body = io.NopCloser(strings.NewReader(fmt.Sprintf(`{"user_id":%q,"line_user_id":%q,"display_name":%q}`,
		userID, profile.Sub, profile.Name)))
	a.lineLink(w, r2)
}

func (a *app) lineWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Events []struct {
			Type     string `json:"type"`
			Source   struct {
				UserID string `json:"userId"`
			} `json:"source"`
			Postback struct {
				Data string `json:"data"`
			} `json:"postback"`
		} `json:"events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	for _, ev := range body.Events {
		lineUID := strings.TrimSpace(ev.Source.UserID)
		if lineUID == "" {
			continue
		}
		data := strings.TrimSpace(ev.Postback.Data)
		if ev.Type == "follow" || ev.Type == "postback" {
			if strings.HasPrefix(data, "link=") {
				userID := strings.TrimPrefix(data, "link=")
				a.linkLineUser(ctx, userID, lineUID, "")
			}
		}
	}
	jsonOK(w, map[string]any{"ok": true})
}

func (a *app) linkLineUser(ctx context.Context, userID, lineUID, name string) {
	if userID == "" || lineUID == "" {
		return
	}
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.line_subscriptions (user_id, line_user_id, display_name)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET line_user_id=EXCLUDED.line_user_id`,
		userID, lineUID, name)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.auth_identities (user_id, line_user_id, line_display_name, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (user_id) DO UPDATE SET line_user_id=EXCLUDED.line_user_id, updated_at=NOW()`,
		userID, lineUID, name)
	log.Printf("line webhook linked user=%s line=%s", userID, lineUID)
}
