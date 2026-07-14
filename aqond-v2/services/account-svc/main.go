// account-svc implements Epoch 11 P212: EXP-ACCT profiles, private account,
// blocked users for production buyer/creator identity.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	region *region.Router
}

var mUpdates atomic.Int64

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
	mux.HandleFunc("/v1/profile", a.profile)
	mux.HandleFunc("/v1/profile/", a.publicProfile)
	mux.HandleFunc("/v1/blocks", a.blocks)

	port := config.Int("PORT", 8138)
	log.Printf("account-svc :%d p212", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "account-svc", "p212": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_account_updates_total %d\n", mUpdates.Load())
}

func (a *app) profile(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		var body struct{ UserID string `json:"user_id"` }
		_ = json.NewDecoder(r.Body).Decode(&body)
		userID = body.UserID
	}
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodGet {
		var name, bio, avatar, username string
		var private bool
		err := a.pool.QueryRow(ctx, `
			SELECT COALESCE(p.display_name,''), COALESCE(p.bio,''), COALESCE(p.avatar_url,''), COALESCE(p.username,''),
			       COALESCE(s.private_account, FALSE)
			FROM commerce.user_profiles p
			FULL OUTER JOIN commerce.user_settings s ON s.user_id = p.user_id
			WHERE COALESCE(p.user_id, s.user_id) = $1`, userID).
			Scan(&name, &bio, &avatar, &username, &private)
		if err != nil {
			jsonOK(w, map[string]any{"user_id": userID, "display_name": "", "bio": "", "avatar_url": "", "private_account": false})
			return
		}
		jsonOK(w, map[string]any{"user_id": userID, "display_name": name, "bio": bio, "avatar_url": avatar, "username": username, "private_account": private})
		return
	}
	var body struct {
		UserID      string `json:"user_id"`
		DisplayName string `json:"display_name"`
		Bio         string `json:"bio"`
		AvatarURL   string `json:"avatar_url"`
		Username    string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UserID == "" {
		body.UserID = userID
	}
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.user_profiles (user_id, display_name, bio, avatar_url, username, updated_at)
		VALUES ($1,$2,$3,$4,$5,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			display_name=COALESCE(NULLIF(EXCLUDED.display_name,''),commerce.user_profiles.display_name),
			bio=COALESCE(NULLIF(EXCLUDED.bio,''),commerce.user_profiles.bio),
			avatar_url=COALESCE(NULLIF(EXCLUDED.avatar_url,''),commerce.user_profiles.avatar_url),
			username=COALESCE(NULLIF(EXCLUDED.username,''),commerce.user_profiles.username),
			updated_at=NOW()`,
		body.UserID, body.DisplayName, body.Bio, body.AvatarURL, body.Username)
	if err != nil {
		httpErr(w, err)
		return
	}
	mUpdates.Add(1)
	jsonOK(w, map[string]any{"user_id": body.UserID, "saved": true})
}

func (a *app) publicProfile(w http.ResponseWriter, r *http.Request) {
	target := strings.TrimPrefix(r.URL.Path, "/v1/profile/")
	if target == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	viewer := r.URL.Query().Get("viewer_id")
	ctx := r.Context()
	var private bool
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(private_account,FALSE) FROM commerce.user_settings WHERE user_id=$1`, target).Scan(&private)
	if private && viewer != target {
		http.Error(w, "private_account", http.StatusForbidden)
		return
	}
	var blocked bool
	if viewer != "" {
		_ = a.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM commerce.blocked_users WHERE user_id=$1 AND blocked_id=$2)`, target, viewer).Scan(&blocked)
		if blocked {
			http.Error(w, "blocked", http.StatusForbidden)
			return
		}
	}
	var name, bio, avatar, username string
	_ = a.pool.QueryRow(ctx, `
		SELECT COALESCE(display_name,''), COALESCE(bio,''), COALESCE(avatar_url,''), COALESCE(username,'')
		FROM commerce.user_profiles WHERE user_id=$1`, target).Scan(&name, &bio, &avatar, &username)
	jsonOK(w, map[string]any{"user_id": target, "display_name": name, "bio": bio, "avatar_url": avatar, "username": username})
}

func (a *app) blocks(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodPost {
		var body struct {
			BlockedID string `json:"blocked_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.BlockedID == "" {
			http.Error(w, "blocked_id required", http.StatusBadRequest)
			return
		}
		_, _ = a.pool.Exec(ctx, `INSERT INTO commerce.blocked_users (user_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, userID, body.BlockedID)
		mUpdates.Add(1)
		jsonOK(w, map[string]any{"blocked": body.BlockedID})
		return
	}
	rows, err := a.pool.Query(ctx, `SELECT blocked_id, created_at FROM commerce.blocked_users WHERE user_id=$1`, userID)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var bid string
		var created any
		if rows.Scan(&bid, &created) == nil {
			out = append(out, map[string]any{"blocked_id": bid, "created_at": created})
		}
	}
	jsonOK(w, map[string]any{"user_id": userID, "blocked": out})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
