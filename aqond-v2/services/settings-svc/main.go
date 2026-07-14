// settings-svc implements Epoch 9 P161/P162: user settings, notification
// preferences, activity center, and session registry for the privacy hub.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	region *region.Router
}

var (
	mSettings atomic.Int64
	mActivity atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, region: region.NewRouter()}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/settings", a.settings)
	mux.HandleFunc("/v1/settings/notifications", a.notifPrefs)
	mux.HandleFunc("/v1/settings/consent", a.consentProxy)
	mux.HandleFunc("/v1/activity", a.activity)
	mux.HandleFunc("/v1/sessions", a.sessions)
	mux.HandleFunc("/v1/push/register", a.pushRegister)

	port := config.Int("PORT", 8134)
	log.Printf("settings-svc :%d p161-p162", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "settings-svc", "p161_p162": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_settings_updates_total %d\n", mSettings.Load())
	fmt.Fprintf(w, "aqond_activity_events_total %d\n", mActivity.Load())
}

func (a *app) settings(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		var body struct {
			UserID string `json:"user_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		userID = body.UserID
	}
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodGet {
		var region, locale, currency, theme string
		var private, personalize, biometric bool
		var interests []byte
		err := a.pool.QueryRow(ctx, `
			SELECT region, locale, currency, theme, private_account, personalization, biometric_lock, interests
			FROM commerce.user_settings WHERE user_id=$1`, userID).
			Scan(&region, &locale, &currency, &theme, &private, &personalize, &biometric, &interests)
		if err != nil {
			jsonOK(w, map[string]any{"user_id": userID, "settings": defaultSettings(userID)})
			return
		}
		var ints any
		_ = json.Unmarshal(interests, &ints)
		jsonOK(w, map[string]any{"user_id": userID, "settings": map[string]any{
			"region": region, "locale": locale, "currency": currency, "theme": theme,
			"private_account": private, "personalization": personalize, "biometric_lock": biometric, "interests": ints,
		}})
		return
	}
	var body struct {
		UserID          string   `json:"user_id"`
		Locale          string   `json:"locale"`
		Currency        string   `json:"currency"`
		Theme           string   `json:"theme"`
		PrivateAccount  *bool    `json:"private_account"`
		Personalization *bool    `json:"personalization"`
		BiometricLock   *bool    `json:"biometric_lock"`
		Interests       []string `json:"interests"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" {
		body.UserID = userID
	}
	reg := a.region.FromRequest(r)
	ints, _ := json.Marshal(body.Interests)
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.user_settings (user_id, region, locale, currency, theme, private_account, personalization, biometric_lock, interests)
		VALUES ($1,$2,COALESCE(NULLIF($3,''),'th-TH'),COALESCE(NULLIF($4,''),'THB'),COALESCE(NULLIF($5,''),'system'),COALESCE($6,FALSE),COALESCE($7,TRUE),COALESCE($8,FALSE),$9)
		ON CONFLICT (user_id) DO UPDATE SET
			locale=COALESCE(NULLIF(EXCLUDED.locale,''),commerce.user_settings.locale),
			currency=COALESCE(NULLIF(EXCLUDED.currency,''),commerce.user_settings.currency),
			theme=COALESCE(NULLIF(EXCLUDED.theme,''),commerce.user_settings.theme),
			private_account=COALESCE($6,commerce.user_settings.private_account),
			personalization=COALESCE($7,commerce.user_settings.personalization),
			biometric_lock=COALESCE($8,commerce.user_settings.biometric_lock),
			interests=COALESCE($9,commerce.user_settings.interests),
			updated_at=NOW()`,
		body.UserID, reg, body.Locale, body.Currency, body.Theme,
		body.PrivateAccount, body.Personalization, body.BiometricLock, ints)
	if err != nil {
		httpErr(w, err)
		return
	}
	mSettings.Add(1)
	jsonOK(w, map[string]any{"user_id": body.UserID, "saved": true})
}

func defaultSettings(userID string) map[string]any {
	return map[string]any{
		"user_id": userID, "locale": "th-TH", "currency": "THB", "theme": "system",
		"private_account": false, "personalization": true, "biometric_lock": false, "interests": []any{},
	}
}

func (a *app) notifPrefs(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Category string `json:"category"`
			Channel  string `json:"channel"`
			Enabled  bool   `json:"enabled"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.notification_prefs (user_id, category, channel, enabled)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (user_id, category, channel) DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=NOW()`,
			userID, body.Category, body.Channel, body.Enabled)
		jsonOK(w, map[string]any{"saved": true})
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT category, channel, enabled FROM commerce.notification_prefs WHERE user_id=$1`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	prefs := map[string]map[string]bool{}
	for rows.Next() {
		var cat, ch string
		var en bool
		if rows.Scan(&cat, &ch, &en) == nil {
			if prefs[cat] == nil {
				prefs[cat] = map[string]bool{}
			}
			prefs[cat][ch] = en
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "preferences": prefs})
}

// consentProxy records consent changes via compliance-svc pattern (local stub).
func (a *app) consentProxy(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]any{"note": "use /api/v1/consent via BFF in prod", "user_id": r.URL.Query().Get("user_id")})
}

func (a *app) activity(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			Kind    string `json:"kind"`
			RefID   string `json:"ref_id"`
			Summary string `json:"summary"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := ulid.New()
		_, _ = a.pool.Exec(ctx, `
			INSERT INTO commerce.activity_events (id, user_id, kind, ref_id, summary) VALUES ($1,$2,$3,$4,$5)`,
			id, userID, body.Kind, body.RefID, body.Summary)
		mActivity.Add(1)
		jsonOK(w, map[string]any{"event_id": id})
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT id, kind, ref_id, summary, created_at FROM commerce.activity_events
		WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var events []map[string]any
	for rows.Next() {
		var id, kind, ref, summary string
		var created any
		if rows.Scan(&id, &kind, &ref, &summary, &created) == nil {
			events = append(events, map[string]any{"id": id, "kind": kind, "ref_id": ref, "summary": summary, "created_at": created})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "events": events})
}

func (a *app) sessions(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, device, ip, biometric_bound, created_at, last_seen_at, revoked
		FROM commerce.user_sessions WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT 20`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, dev, ip string
		var bio, revoked bool
		var created, seen any
		if rows.Scan(&id, &dev, &ip, &bio, &created, &seen, &revoked) == nil {
			out = append(out, map[string]any{"id": id, "device": dev, "ip": ip, "biometric_bound": bio, "revoked": revoked})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "sessions": out})
}

func (a *app) pushRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID   string `json:"user_id"`
		Platform string `json:"platform"`
		Endpoint string `json:"endpoint"`
		Token    string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id := ulid.New()
	_, _ = a.pool.Exec(r.Context(), `
		INSERT INTO commerce.push_registrations (id, user_id, platform, endpoint, token)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id, endpoint) DO UPDATE SET token=EXCLUDED.token`,
		id, body.UserID, body.Platform, body.Endpoint, body.Token)
	jsonOK(w, map[string]any{"registration_id": id})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
