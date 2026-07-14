// notification-svc implements Epoch 8 Pillar D: localized, timezone-aware and
// consent-gated notifications with quiet-hours scheduling (P134, P135).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
	_ "time/tzdata" // embed zoneinfo for distroless

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/shard"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type app struct {
	pool   *pgxpool.Pool
	router *shard.Router
}

var (
	mQueued     atomic.Int64
	mScheduled  atomic.Int64
	mSuppressed atomic.Int64
	mSent       atomic.Int64
)

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{pool: pool, router: shard.NewRouter(config.Int("SHARD_COUNT", 1))}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/metrics", a.metrics)
	mux.HandleFunc("/v1/notify", a.notify)             // P135
	mux.HandleFunc("/v1/notifications", a.list)        // P135
	mux.HandleFunc("/v1/notify/dispatch", a.dispatch)  // P134
	mux.HandleFunc("/v1/push/register", a.pushRegister)
	mux.HandleFunc("/v1/push/status", a.pushStatus)
	mux.HandleFunc("/v1/line/link", a.lineLink)
	mux.HandleFunc("/v1/line/status", a.lineStatus)
	mux.HandleFunc("/v1/line/login-url", a.lineLoginURL)
	mux.HandleFunc("/v1/line/oauth/callback", a.lineOAuthCallback)
	mux.HandleFunc("/v1/line/webhook", a.lineWebhook)

	port := config.Int("PORT", 8131)
	log.Printf("notification-svc :%d p134-p135", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "notification-svc", "p134_p135": true})
}

func (a *app) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "aqond_notify_queued_total %d\n", mQueued.Load())
	fmt.Fprintf(w, "aqond_notify_scheduled_total %d\n", mScheduled.Load())
	fmt.Fprintf(w, "aqond_notify_suppressed_total %d\n", mSuppressed.Load())
	fmt.Fprintf(w, "aqond_notify_sent_total %d\n", mSent.Load())
}

// P135: enqueue a localized notification (consent-gated, quiet-hours aware).
func (a *app) notify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RecipientID    string            `json:"recipient_id"`
		Region         string            `json:"region"`
		Locale         string            `json:"locale"`
		Channel        string            `json:"channel"`
		TemplateKey    string            `json:"template_key"`
		Payload        map[string]string `json:"payload"`
		ConsentPurpose string            `json:"consent_purpose"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.RecipientID == "" || body.TemplateKey == "" {
		http.Error(w, "recipient_id and template_key required", http.StatusBadRequest)
		return
	}
	if body.Region == "" {
		body.Region = config.LoadRegion()
	}
	if body.Locale == "" {
		body.Locale = "th-TH"
	}
	if body.Channel == "" {
		body.Channel = "push"
	}
	if body.ConsentPurpose == "" {
		body.ConsentPurpose = "transactional"
	}
	ctx := r.Context()

	// P135 consent gate: non-transactional messages require granted consent.
	if body.ConsentPurpose != "transactional" && !a.hasConsent(ctx, body.RecipientID, body.ConsentPurpose) {
		mSuppressed.Add(1)
		id := a.persist(ctx, body.RecipientID, body.Region, body.Locale, body.Channel, body.TemplateKey, body.ConsentPurpose, "", "suppressed", nil, body.Payload)
		jsonOK(w, map[string]any{"notification_id": id, "status": "suppressed", "reason": "no_consent"})
		return
	}

	rendered := a.render(ctx, body.TemplateKey, body.Locale, body.Channel, body.Payload)

	// P134 quiet-hours: defer non-transactional to end of quiet window.
	tz, startH, endH := a.quietHours(ctx, body.Region)
	status := "queued"
	var scheduledAt *time.Time
	if body.ConsentPurpose != "transactional" {
		if when, deferred := nextSendTime(tz, startH, endH); deferred {
			status = "scheduled"
			scheduledAt = &when
		}
	}
	id := a.persist(ctx, body.RecipientID, body.Region, body.Locale, body.Channel, body.TemplateKey, body.ConsentPurpose, rendered, status, scheduledAt, body.Payload)
	if status == "scheduled" {
		mScheduled.Add(1)
	} else {
		mQueued.Add(1)
		a.deliverNotification(id, body.RecipientID, body.Channel, rendered, body.Payload)
		a.markSent(ctx, id)
		status = "sent"
	}
	resp := map[string]any{"notification_id": id, "status": status, "rendered": rendered, "timezone": tz}
	if scheduledAt != nil {
		resp["scheduled_at"] = scheduledAt.Format(time.RFC3339)
	}
	jsonOK(w, resp)
}

func (a *app) persist(ctx context.Context, recipient, region, locale, channel, tmpl, purpose, rendered, status string, scheduledAt *time.Time, payload map[string]string) string {
	id := ulid.New()
	sk := a.router.ShardKey(recipient)
	payloadJSON, _ := json.Marshal(payload)
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.notifications
			(id, recipient_id, shard_key, region, locale, channel, template_key, payload, rendered, status, consent_purpose, scheduled_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		id, recipient, sk, region, locale, channel, tmpl, payloadJSON, rendered, status, purpose, scheduledAt)
	return id
}

func (a *app) hasConsent(ctx context.Context, subjectID, purpose string) bool {
	var granted bool
	err := a.pool.QueryRow(ctx, `
		SELECT granted FROM commerce.consents WHERE subject_id=$1 AND purpose=$2
		ORDER BY created_at DESC LIMIT 1`, subjectID, purpose).Scan(&granted)
	return err == nil && granted
}

func (a *app) render(ctx context.Context, key, locale, channel string, payload map[string]string) string {
	var tmpl string
	err := a.pool.QueryRow(ctx, `
		SELECT body FROM commerce.notification_templates WHERE template_key=$1 AND locale=$2 AND channel=$3`,
		key, locale, channel).Scan(&tmpl)
	if err != nil {
		// fallback to th-TH then key itself
		if a.pool.QueryRow(ctx, `
			SELECT body FROM commerce.notification_templates WHERE template_key=$1 AND channel=$2 ORDER BY locale LIMIT 1`,
			key, channel).Scan(&tmpl) != nil {
			tmpl = key
		}
	}
	for k, v := range payload {
		tmpl = strings.ReplaceAll(tmpl, "#{"+k+"}", v)
		tmpl = strings.ReplaceAll(tmpl, "{"+k+"}", v)
	}
	return tmpl
}

func (a *app) quietHours(ctx context.Context, region string) (tz string, start, end int) {
	tz, start, end = "Asia/Bangkok", 22, 8
	_ = a.pool.QueryRow(ctx, `SELECT timezone, start_hour, end_hour FROM commerce.quiet_hours WHERE region=$1`, region).
		Scan(&tz, &start, &end)
	return tz, start, end
}

// nextSendTime returns when to send if current local time is inside quiet hours.
func nextSendTime(tz string, startH, endH int) (time.Time, bool) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	h := now.Hour()
	inQuiet := false
	if startH < endH {
		inQuiet = h >= startH && h < endH
	} else { // wraps midnight, e.g. 22..8
		inQuiet = h >= startH || h < endH
	}
	if !inQuiet {
		return time.Time{}, false
	}
	send := time.Date(now.Year(), now.Month(), now.Day(), endH, 0, 0, 0, loc)
	if !send.After(now) {
		send = send.Add(24 * time.Hour)
	}
	return send.UTC(), true
}

// P135: list a recipient's notifications.
func (a *app) list(w http.ResponseWriter, r *http.Request) {
	recipient := r.URL.Query().Get("recipient_id")
	if recipient == "" {
		http.Error(w, "recipient_id required", http.StatusBadRequest)
		return
	}
	rows, err := a.pool.Query(r.Context(), `
		SELECT id, channel, template_key, rendered, status, consent_purpose, created_at
		FROM commerce.notifications WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 50`, recipient)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, channel, tmpl, rendered, status, purpose string
		var created any
		if rows.Scan(&id, &channel, &tmpl, &rendered, &status, &purpose, &created) == nil {
			out = append(out, map[string]any{"id": id, "channel": channel, "template_key": tmpl, "rendered": rendered, "status": status, "consent_purpose": purpose})
		}
	}
	jsonOK(w, map[string]any{"recipient_id": recipient, "notifications": out})
}

// P134: dispatch scheduled notifications whose send time has arrived.
func (a *app) dispatch(w http.ResponseWriter, r *http.Request) {
	tag, err := a.pool.Exec(r.Context(), `
		UPDATE commerce.notifications SET status='sent', sent_at=NOW()
		WHERE status IN ('queued','scheduled') AND (scheduled_at IS NULL OR scheduled_at <= NOW())`)
	if err != nil {
		httpErr(w, err)
		return
	}
	n := tag.RowsAffected()
	mSent.Add(n)
	jsonOK(w, map[string]any{"dispatched": n})
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
