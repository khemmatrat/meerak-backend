package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func lineOAuthCreds() (channelID, secret string, ok bool) {
	channelID = strings.TrimSpace(os.Getenv("LINE_LOGIN_CHANNEL_ID"))
	if channelID == "" {
		channelID = strings.TrimSpace(os.Getenv("LINE_CHANNEL_ID"))
	}
	secret = strings.TrimSpace(os.Getenv("LINE_LOGIN_CHANNEL_SECRET"))
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("LINE_CHANNEL_SECRET"))
	}
	return channelID, secret, channelID != "" && secret != ""
}

func mintLineOAuthState() string {
	nonce := make([]byte, 16)
	_, _ = rand.Read(nonce)
	exp := time.Now().Add(10 * time.Minute).Unix()
	payload := fmt.Sprintf("%s.%d", hex.EncodeToString(nonce), exp)
	mac := hmac.New(sha256.New, []byte(jwtSecret()))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

func verifyLineOAuthState(state string) bool {
	parts := strings.Split(state, ".")
	if len(parts) != 3 {
		return false
	}
	payload := parts[0] + "." + parts[1]
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}
	mac := hmac.New(sha256.New, []byte(jwtSecret()))
	mac.Write([]byte(payload))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(parts[2]))
}

func (a *app) lineLoginURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	channelID, _, ok := lineOAuthCreds()
	if !ok {
		jsonOK(w, map[string]any{
			"ok": false, "error": "line_login_not_configured",
			"message": "Set LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CHANNEL_SECRET",
		})
		return
	}
	redirectURI := strings.TrimSpace(r.URL.Query().Get("redirect_uri"))
	if redirectURI == "" {
		redirectURI = strings.TrimSpace(os.Getenv("LINE_LOGIN_CALLBACK_URL"))
	}
	if redirectURI == "" {
		jsonOK(w, map[string]any{"ok": false, "error": "redirect_uri_required"})
		return
	}
	state := mintLineOAuthState()
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
		State       string `json:"state"`
		Device      string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Code == "" || body.RedirectURI == "" || body.State == "" {
		http.Error(w, "code, redirect_uri, and state required", http.StatusBadRequest)
		return
	}
	if !verifyLineOAuthState(body.State) {
		http.Error(w, "invalid_oauth_state", http.StatusUnauthorized)
		return
	}
	lineUID, displayName, err := exchangeLineOAuthCode(body.Code, body.RedirectURI)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	ctx := r.Context()
	userID, err := a.resolveOrCreateLineUser(ctx, lineUID, displayName)
	if err != nil {
		httpErr(w, err)
		return
	}
	device := body.Device
	if device == "" {
		device = "web"
	}
	a.issueSession(w, r, userID, "line", device, map[string]any{"display_name": displayName})
}

func exchangeLineOAuthCode(code, redirectURI string) (lineUID, displayName string, err error) {
	channelID, secret, ok := lineOAuthCreds()
	if !ok {
		return "", "", fmt.Errorf("line_login_not_configured")
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", channelID)
	form.Set("client_secret", secret)
	req, err := http.NewRequest(http.MethodPost, "https://api.line.me/oauth2/v2.1/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("line_token_http_%d", resp.StatusCode)
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if json.Unmarshal(raw, &tok) != nil || tok.IDToken == "" {
		return "", "", fmt.Errorf("no_id_token")
	}
	profReq, _ := http.NewRequest(http.MethodPost, "https://api.line.me/oauth2/v2.1/verify", strings.NewReader(url.Values{
		"id_token":  {tok.IDToken},
		"client_id": {channelID},
	}.Encode()))
	profReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	profResp, err := http.DefaultClient.Do(profReq)
	if err != nil {
		return "", "", err
	}
	defer profResp.Body.Close()
	profRaw, _ := io.ReadAll(profResp.Body)
	var profile struct {
		Sub  string `json:"sub"`
		Name string `json:"name"`
	}
	if json.Unmarshal(profRaw, &profile) != nil || profile.Sub == "" {
		return "", "", fmt.Errorf("invalid_line_profile")
	}
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = "LINE User"
	}
	return profile.Sub, name, nil
}

func (a *app) resolveOrCreateLineUser(ctx context.Context, lineUID, displayName string) (string, error) {
	var userID string
	if a.pool.QueryRow(ctx, `SELECT user_id FROM commerce.line_subscriptions WHERE line_user_id=$1`, lineUID).Scan(&userID) == nil && userID != "" {
		a.upsertLineIdentity(ctx, userID, lineUID, displayName)
		return userID, nil
	}
	if a.pool.QueryRow(ctx, `SELECT user_id FROM commerce.auth_identities WHERE line_user_id=$1`, lineUID).Scan(&userID) == nil && userID != "" {
		a.upsertLineIdentity(ctx, userID, lineUID, displayName)
		return userID, nil
	}
	userID = "user-line-" + lineUID
	a.upsertLineIdentity(ctx, userID, lineUID, displayName)
	_, _ = a.pool.Exec(ctx, `INSERT INTO commerce.user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, userID)
	return userID, nil
}

func (a *app) upsertLineIdentity(ctx context.Context, userID, lineUID, displayName string) {
	name := displayName
	if name == "" {
		name = "LINE User"
	}
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.auth_identities (user_id, line_user_id, line_display_name, display_name)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (user_id) DO UPDATE SET
			line_user_id=EXCLUDED.line_user_id,
			line_display_name=EXCLUDED.line_display_name,
			display_name=COALESCE(NULLIF(EXCLUDED.display_name,''), commerce.auth_identities.display_name),
			updated_at=NOW()`,
		userID, lineUID, name, name)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.line_subscriptions (user_id, line_user_id, display_name)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET line_user_id=EXCLUDED.line_user_id, display_name=EXCLUDED.display_name`,
		userID, lineUID, name)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.notification_prefs (user_id, category, channel, enabled)
		VALUES ($1,'orders','line',true)
		ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled = true`, userID)
}
