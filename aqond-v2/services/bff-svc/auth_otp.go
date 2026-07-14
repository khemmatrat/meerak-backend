package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

var phoneRe = regexp.MustCompile(`^0[689]\d{8}$`)

func normalizePhone(raw string) string {
	d := regexp.MustCompile(`\D`).ReplaceAllString(raw, "")
	if strings.HasPrefix(d, "66") && len(d) == 11 {
		d = "0" + d[2:]
	}
	return d
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func (a *app) otpRequest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	phone := normalizePhone(body.Phone)
	if !phoneRe.MatchString(phone) {
		http.Error(w, "invalid_th_phone", http.StatusBadRequest)
		return
	}
	code := randomOTP()
	hash := sha256Hex(code)
	id := ulid.New()
	exp := time.Now().Add(5 * time.Minute)
	ctx := r.Context()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.auth_otp_codes (id, phone, code_hash, expires_at)
		VALUES ($1,$2,$3,$4)`, id, phone, hash, exp)
	if err != nil {
		httpErr(w, err)
		return
	}
	if err := sendOTPSMS(phone, code); err != nil {
		log.Printf("auth-otp sms failed phone=%s err=%v", phone, err)
		if os.Getenv("AQOND_OTP_DEV_EXPOSE") == "0" {
			http.Error(w, "sms_send_failed", http.StatusBadGateway)
			return
		}
	}
	log.Printf("auth-otp: phone=%s code=%s (dev log)", phone, code)
	out := map[string]any{"ok": true, "phone": phone, "expires_in_sec": 300}
	if os.Getenv("AQOND_OTP_DEV_EXPOSE") != "0" {
		out["dev_code"] = code
	}
	jsonOK(w, out)
}

func (a *app) otpVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone  string `json:"phone"`
		Code   string `json:"code"`
		Device string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	phone := normalizePhone(body.Phone)
	code := strings.TrimSpace(body.Code)
	if !phoneRe.MatchString(phone) || len(code) < 4 {
		http.Error(w, "invalid_request", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var id, hash string
	var exp time.Time
	var consumed bool
	err := a.pool.QueryRow(ctx, `
		SELECT id, code_hash, expires_at, consumed FROM commerce.auth_otp_codes
		WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`, phone).Scan(&id, &hash, &exp, &consumed)
	if err != nil || consumed || time.Now().After(exp) || sha256Hex(code) != hash {
		http.Error(w, "invalid_otp", http.StatusUnauthorized)
		return
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.auth_otp_codes SET consumed=TRUE WHERE id=$1`, id)

	userID := "user-phone-" + phone
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.auth_identities (user_id, phone, phone_verified, display_name)
		VALUES ($1,$2,TRUE,$3)
		ON CONFLICT (user_id) DO UPDATE SET phone=$2, phone_verified=TRUE, updated_at=NOW()`,
		userID, phone, "ลูกค้า "+phone[len(phone)-4:])
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, userID)

	a.issueSession(w, r, userID, "otp", body.Device)
}

func (a *app) lineLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LineUserID  string `json:"line_user_id"`
		DisplayName string `json:"display_name"`
		Device      string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.LineUserID == "" {
		http.Error(w, "line_user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	userID, err := a.resolveOrCreateLineUser(ctx, body.LineUserID, body.DisplayName)
	if err != nil {
		httpErr(w, err)
		return
	}
	a.issueSession(w, r, userID, "line", body.Device)
}

func (a *app) issueSession(w http.ResponseWriter, r *http.Request, userID, method, device string, extra ...map[string]any) {
	sid := ulid.New()
	token := mintSessionJWT(userID, sid, method, 7*24*time.Hour)
	hash := sha256Hex(token)
	ctx := r.Context()
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.user_sessions (id, user_id, device, ip, user_agent, token_hash, auth_method)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		sid, userID, device, r.RemoteAddr, r.UserAgent(), hash, method)
	mAuth.Add(1)
	out := map[string]any{"token": token, "session_id": sid, "user_id": userID, "auth_method": method}
	if len(extra) > 0 {
		for k, v := range extra[0] {
			out[k] = v
		}
	}
	jsonOK(w, out)
}

func (a *app) validateSession(ctx context.Context, sid, token string) (string, bool) {
	if token == "" {
		return "", false
	}
	if isJWT(token) {
		if !verifyJWT(token) {
			return "", false
		}
		claims, ok := parseJWTClaims(token)
		if !ok || time.Now().Unix() > claims.Exp {
			return "", false
		}
		if sid != "" && claims.Sid != "" && sid != claims.Sid {
			return "", false
		}
		sessionID := claims.Sid
		if sessionID == "" {
			sessionID = sid
		}
		var revoked bool
		err := a.pool.QueryRow(ctx, `
			SELECT revoked FROM commerce.user_sessions WHERE id=$1 AND user_id=$2`,
			sessionID, claims.Sub).Scan(&revoked)
		if err != nil || revoked {
			return "", false
		}
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.user_sessions SET last_seen_at=NOW() WHERE id=$1`, sessionID)
		return claims.Sub, true
	}
	if sid == "" {
		return "", false
	}
	var userID string
	var hash string
	var revoked bool
	err := a.pool.QueryRow(ctx, `
		SELECT user_id, COALESCE(token_hash,''), revoked FROM commerce.user_sessions WHERE id=$1`, sid).Scan(&userID, &hash, &revoked)
	if err != nil || revoked {
		return "", false
	}
	if hash != "" && hash != sha256Hex(token) {
		return "", false
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.user_sessions SET last_seen_at=NOW() WHERE id=$1`, sid)
	return userID, true
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return r.Header.Get("X-Auth-Token")
}

func randomOTP() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
