// dispatch-svc — Phase 4 rider dispatch: job matching, GPS, delivery tracking.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/aqond/aqond-v2/pkg/db"
	"github.com/aqond/aqond-v2/pkg/region"
	"github.com/aqond/aqond-v2/pkg/ulid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type app struct {
	pool       *pgxpool.Pool
	region     *region.Router
	orderURL   string
	paymentURL string
	http       *http.Client
	redis      redis.UniversalClient
	wsHub      *wsHub
	offerRuns    sync.Map // jobID -> struct{}
	offerSignals sync.Map // jobID -> chan bool
}

type jobRow struct {
	ID, OrderID, MerchantID, BuyerID, RiderID, JobType, Status, Phase string
	PaymentMethod, MerchantName, ItemsSummary, Address, HandoffNote, EtaLabel string
	CustomerPhone, RecipientName                                         string
	AmountMicro                                                          int64
	PickupLat, PickupLng, DropoffLat, DropoffLng                       float64
	RiderLat, RiderLng                                                   *float64
	DeliveryPhotoURL                                                     *string
}

type riderRow struct {
	ID, DisplayName, Phone, Vehicle, Plate, Grade, KycStatus string
	Rating                                                     float64
	ReviewCount, LoadCount, MaxLoad                            int
	Lat, Lng                                                   *float64
	Heading                                                    float64
	Suspended                                                  bool
}

var riderPhaseFlow = []string{
	"rider_assigned", "rider_picked_up", "en_route", "arrived", "rider_calling", "photo_proof", "handoff", "cod_payment", "rider_completed",
}

func main() {
	ctx := context.Background()
	pool, err := db.NewPool(ctx, config.LoadPostgresCitus())
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	a := &app{
		pool:       pool,
		region:     region.NewRouter(),
		orderURL:   config.Get("ORDER_URL", "http://order-svc:8113"),
		paymentURL: config.Get("PAYMENT_URL", "http://payment-svc:8120"),
		http:       &http.Client{Timeout: 5 * time.Second},
		wsHub:      newWSHub(),
	}
	a.initRedis()
	go a.startRematchLoop(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", a.health)
	mux.HandleFunc("/v1/dispatch/jobs", a.jobs)
	mux.HandleFunc("/v1/dispatch/jobs/", a.jobSub)
	mux.HandleFunc("/v1/dispatch/track/", a.trackSub)
	mux.HandleFunc("/v1/dispatch/ws/track", a.wsTrack)
	mux.HandleFunc("/v1/dispatch/riders", a.ridersRoot)
	mux.HandleFunc("/v1/dispatch/riders/", a.ridersSub)
	mux.HandleFunc("/v1/dispatch/ops/stuck", a.opsStuck)
	mux.HandleFunc("/v1/dispatch/ops/heatmap", a.opsHeatmap)
	mux.HandleFunc("/v1/dispatch/batches", a.dispatchBatches)

	port := config.Int("PORT", 8142)
	log.Printf("dispatch-svc :%d phase4", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]any{"ok": true, "service": "dispatch-svc", "phase": 4})
}

func (a *app) jobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		a.createJob(w, r)
	case http.MethodGet:
		a.listJobs(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *app) createJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OrderID       string  `json:"order_id"`
		MerchantID    string  `json:"merchant_id"`
		BuyerID       string  `json:"buyer_id"`
		MerchantName  string  `json:"merchant_name"`
		ItemsSummary  string  `json:"items_summary"`
		Address       string  `json:"address"`
		HandoffNote   string  `json:"handoff_note"`
		EtaLabel      string  `json:"eta_label"`
		PaymentMethod string  `json:"payment_method"`
		AmountMicro   int64   `json:"amount_micro"`
		JobType       string  `json:"job_type"`
		PickupLat     float64 `json:"pickup_lat"`
		PickupLng     float64 `json:"pickup_lng"`
		DropoffLat    float64 `json:"dropoff_lat"`
		DropoffLng    float64 `json:"dropoff_lng"`
		Fulfillment   string  `json:"fulfillment_phase"`
		CustomerPhone string  `json:"customer_phone"`
		RecipientName string  `json:"recipient_name"`
		AutoMatch     *bool   `json:"auto_match"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.OrderID == "" || body.MerchantID == "" {
		http.Error(w, "order_id and merchant_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var existing string
	if a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_jobs WHERE order_id=$1`, body.OrderID).Scan(&existing) == nil {
		j, _ := a.loadJob(ctx, existing)
		if body.Fulfillment != "" {
			if np := fulfillmentToPhase(body.Fulfillment); np != "" && np != j.Phase {
				_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_jobs SET phase=$2, updated_at=NOW() WHERE id=$1`, existing, np)
				j, _ = a.loadJob(ctx, existing)
				a.firePhaseNotifications(ctx, j, np)
				if np == "food_ready" && j.Status == "open" {
					a.autoMatchJob(ctx, existing, j.PickupLat, j.PickupLng)
					j, _ = a.loadJob(ctx, existing)
				}
			}
		}
		jsonOK(w, map[string]any{"job": jobMap(j), "created": false})
		return
	}
	if body.PickupLat == 0 {
		body.PickupLat = 13.724
	}
	if body.PickupLng == 0 {
		body.PickupLng = 100.534
	}
	if body.DropoffLat == 0 {
		body.DropoffLat = 13.728
	}
	if body.DropoffLng == 0 {
		body.DropoffLng = 100.52
	}
	if body.JobType == "" {
		body.JobType = "food"
	}
	if body.PaymentMethod == "" {
		body.PaymentMethod = "cod"
	}
	phase := "finding_rider"
	if body.Fulfillment != "" {
		switch body.Fulfillment {
		case "preparing":
			phase = "merchant_preparing"
		case "ready":
			phase = "food_ready"
		case "shipped":
			phase = "rider_picked_up"
		}
	}
	id := ulid.New()
	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_jobs (
		  id, order_id, merchant_id, buyer_id, job_type, status, phase,
		  payment_method, amount_micro, merchant_name, items_summary, address,
		  handoff_note, eta_label, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
		  customer_phone, recipient_name
		) VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		id, body.OrderID, body.MerchantID, body.BuyerID, body.JobType, phase,
		body.PaymentMethod, body.AmountMicro, body.MerchantName, body.ItemsSummary,
		body.Address, nullable(body.HandoffNote), nullable(body.EtaLabel),
		body.PickupLat, body.PickupLng, body.DropoffLat, body.DropoffLng,
		nullable(body.CustomerPhone), nullable(body.RecipientName))
	if err != nil {
		httpErr(w, err)
		return
	}
	a.logEvent(ctx, id, phase, "system", "job_created", nil, nil)
	auto := body.AutoMatch == nil || *body.AutoMatch
	if !a.shouldAutoMatchV2() {
		auto = false
	}
	if auto && (phase == "finding_rider" || phase == "food_ready") {
		a.autoMatchJob(ctx, id, body.PickupLat, body.PickupLng)
	}
	a.pushTracking(ctx, body.OrderID)
	j, _ := a.loadJob(ctx, id)
	a.firePhaseNotifications(ctx, j, phase)
	a.publishOrderReady(ctx, j)
	a.maybeForwardV1Match(ctx, j)
	jsonOK(w, map[string]any{"job": jobMap(j), "created": true, "dispatch_mode": dispatchMode()})
}

func (a *app) listJobs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := jobSQL() + ` WHERE 1=1`
	args := []any{}
	n := 1
	if rid := r.URL.Query().Get("rider_id"); rid != "" {
		q += fmt.Sprintf(" AND rider_id=$%d", n)
		args = append(args, rid)
		n++
	}
	if st := r.URL.Query().Get("status"); st != "" {
		q += fmt.Sprintf(" AND status=$%d", n)
		args = append(args, st)
		n++
	} else if r.URL.Query().Get("rider_id") != "" {
		q += " AND status IN ('assigned','active')"
	}
	if mid := r.URL.Query().Get("merchant_id"); mid != "" {
		q += fmt.Sprintf(" AND merchant_id=$%d", n)
		args = append(args, mid)
		n++
	}
	q += " ORDER BY created_at DESC LIMIT 50"
	rows, err := a.pool.Query(ctx, q, args...)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var jobs []map[string]any
	for rows.Next() {
		j, err := scanJob(rows.Scan)
		if err != nil {
			continue
		}
		jobs = append(jobs, jobMap(j))
	}
	jsonOK(w, map[string]any{"jobs": jobs, "count": len(jobs)})
}

func (a *app) jobSub(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/dispatch/jobs/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	jobID := parts[0]
	if len(parts) == 1 && r.Method == http.MethodGet {
		j, err := a.loadJob(r.Context(), jobID)
		if err != nil {
			http.Error(w, "not_found", http.StatusNotFound)
			return
		}
		jsonOK(w, map[string]any{"job": jobMap(j)})
		return
	}
	if len(parts) >= 2 {
		switch parts[1] {
		case "accept":
			if r.Method == http.MethodPost {
				a.acceptJob(w, r, jobID)
				return
			}
		case "reject":
			if r.Method == http.MethodPost {
				a.rejectJob(w, r, jobID)
				return
			}
		case "phase":
			if r.Method == http.MethodPost {
				a.advancePhase(w, r, jobID)
				return
			}
		case "location":
			if r.Method == http.MethodPost {
				a.updateLocation(w, r, jobID)
				return
			}
		}
	}
	http.NotFound(w, r)
}

func (a *app) acceptJob(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		RiderID string `json:"rider_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.RiderID == "" {
		body.RiderID = r.Header.Get("X-Rider-Id")
	}
	if body.RiderID == "" {
		http.Error(w, "rider_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	var active, suspended bool
	var kyc, riderUser string
	if a.pool.QueryRow(ctx, `
		SELECT active, suspended, kyc_status, COALESCE(user_id,'')
		FROM commerce.dispatch_riders WHERE id=$1`, body.RiderID).Scan(&active, &suspended, &kyc, &riderUser) != nil {
		http.Error(w, "rider_not_found", http.StatusNotFound)
		return
	}
	if !active || suspended || kyc != "approved" {
		http.Error(w, "rider_not_approved", http.StatusForbidden)
		return
	}
	callerUID := r.Header.Get("X-User-Id")
	if callerUID != "" && riderUser != "" && callerUID != riderUser {
		http.Error(w, "rider_user_mismatch", http.StatusForbidden)
		return
	}
	j, err := a.loadJob(ctx, jobID)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	// Manual accept on open job
	if j.Status == "open" {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_jobs SET rider_id=$2, status='assigned', phase='rider_assigned',
			  auto_assigned_at=NULL, updated_at=NOW()
			WHERE id=$1`, jobID, body.RiderID)
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_riders SET load_count = load_count + 1 WHERE id=$1`, body.RiderID)
		a.logEvent(ctx, jobID, "rider_assigned", body.RiderID, "accepted", nil, nil)
		j, _ = a.loadJob(ctx, jobID)
		a.firePhaseNotifications(ctx, j, "rider_assigned")
		a.pushTracking(ctx, j.OrderID)
		jsonOK(w, map[string]any{"job": jobMap(j)})
		return
	}
	// Confirm auto-match assignment
	if j.Status == "assigned" && j.Phase == "pending_accept" && j.RiderID == body.RiderID {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_jobs SET phase='rider_assigned', auto_assigned_at=NULL, updated_at=NOW()
			WHERE id=$1`, jobID)
		a.logEvent(ctx, jobID, "rider_assigned", body.RiderID, "accepted", nil, nil)
		a.signalOfferOutcome(jobID, true)
		j, _ = a.loadJob(ctx, jobID)
		a.firePhaseNotifications(ctx, j, "rider_assigned")
		a.pushTracking(ctx, j.OrderID)
		jsonOK(w, map[string]any{"job": jobMap(j)})
		return
	}
	http.Error(w, "job_not_open", http.StatusConflict)
}

func (a *app) rejectJob(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		RiderID string `json:"rider_id"`
		Reason  string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.RiderID == "" {
		body.RiderID = r.Header.Get("X-Rider-Id")
	}
	if body.RiderID == "" {
		http.Error(w, "rider_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	j, err := a.loadJob(ctx, jobID)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	if j.Status == "assigned" && j.Phase == "pending_accept" && j.RiderID == body.RiderID {
		a.logEvent(ctx, jobID, "finding_rider", body.RiderID, "rejected:"+body.Reason, nil, nil)
		if _, running := a.offerRuns.Load(jobID); running {
			a.signalOfferOutcome(jobID, false)
		} else {
			_ = a.reopenJobAfterOfferDeclined(ctx, jobID, body.RiderID)
			if sequentialOfferEnabled() {
				a.startSequentialOffer(ctx, jobID, body.RiderID)
			} else {
				a.autoMatchJobExcluding(ctx, jobID, j.PickupLat, j.PickupLng, body.RiderID)
			}
		}
		j, _ = a.loadJob(ctx, jobID)
		jsonOK(w, map[string]any{"ok": true, "job": jobMap(j)})
		return
	}
	http.Error(w, "job_not_open", http.StatusConflict)
}

func (a *app) advancePhase(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		Phase    string   `json:"phase"`
		RiderID  string   `json:"rider_id"`
		PhotoURL string   `json:"photo_url"`
		Lat      *float64 `json:"lat"`
		Lng      *float64 `json:"lng"`
		Actor    string   `json:"actor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	j, err := a.loadJob(ctx, jobID)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	phase := body.Phase
	if phase == "" {
		phase = nextRiderPhase(j.Phase)
	}
	if phase == "" {
		http.Error(w, "invalid_phase", http.StatusBadRequest)
		return
	}
	status := j.Status
	if status == "assigned" && phase != "rider_assigned" {
		status = "active"
	}
	photo := j.DeliveryPhotoURL
	if body.PhotoURL != "" {
		photo = &body.PhotoURL
	}
	_, err = a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs SET phase=$2, status=$3,
		  rider_lat=COALESCE($4,rider_lat), rider_lng=COALESCE($5,rider_lng),
		  delivery_photo_url=COALESCE($6,delivery_photo_url),
		  updated_at=NOW(), completed_at=CASE WHEN $2 IN ('rider_completed','review_pending','completed') THEN NOW() ELSE completed_at END
		WHERE id=$1`, jobID, phase, status, body.Lat, body.Lng, photo)
	if err != nil {
		httpErr(w, err)
		return
	}
	actor := body.RiderID
	if actor == "" {
		actor = body.Actor
	}
	a.logEvent(ctx, jobID, phase, actor, "phase_advance", body.Lat, body.Lng)

	if phase == "rider_picked_up" {
		a.patchOrderFulfillment(ctx, j.OrderID, "shipped", actor)
	}
	if phase == "rider_completed" {
		if j.PaymentMethod == "cod" {
			_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_jobs SET phase='review_pending' WHERE id=$1`, jobID)
			phase = "review_pending"
		}
		a.patchOrderFulfillment(ctx, j.OrderID, "delivered", actor)
		if j.RiderID != "" {
			_ = a.creditRiderEarning(ctx, j.RiderID, jobID, j.OrderID, a.riderEarningPerJob())
		}
	}
	j, _ = a.loadJob(ctx, jobID)
	a.firePhaseNotifications(ctx, j, phase)

	j, _ = a.loadJob(ctx, jobID)
	rider, _ := a.loadRider(ctx, j.RiderID)
	hasReview, _ := a.hasReview(ctx, j.OrderID)
	chats, _ := a.loadChat(ctx, j.OrderID)
	a.pushTracking(ctx, j.OrderID)
	jsonOK(w, map[string]any{"job": jobMap(j), "tracking": buildTrackingView(j, rider, hasReview, chats)})
}

func (a *app) updateLocation(w http.ResponseWriter, r *http.Request, jobID string) {
	var body struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	_, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs SET rider_lat=$2, rider_lng=$3, updated_at=NOW() WHERE id=$1`,
		jobID, body.Lat, body.Lng)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_riders SET lat=$2, lng=$3 WHERE id=(
		SELECT rider_id FROM commerce.dispatch_jobs WHERE id=$1)`, jobID, body.Lat, body.Lng)
	a.logEvent(ctx, jobID, "gps", "rider", "location", &body.Lat, &body.Lng)
	var orderID string
	_ = a.pool.QueryRow(ctx, `SELECT order_id FROM commerce.dispatch_jobs WHERE id=$1`, jobID).Scan(&orderID)
	if orderID != "" {
		a.pushTracking(ctx, orderID)
	}
	jsonOK(w, map[string]any{"ok": true})
}

func (a *app) trackSub(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/dispatch/track/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	orderID := parts[0]
	if len(parts) >= 2 && parts[1] == "review" && r.Method == http.MethodPost {
		a.submitReview(w, r, orderID)
		return
	}
	if len(parts) >= 2 && parts[1] == "chat" && r.Method == http.MethodPost {
		a.trackChat(w, r, orderID)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ctx := r.Context()
	j, err := a.loadJobByOrder(ctx, orderID)
	if err != nil {
		http.Error(w, "tracking_not_found", http.StatusNotFound)
		return
	}
	rider, _ := a.loadRider(ctx, j.RiderID)
	hasReview, _ := a.hasReview(ctx, orderID)
	chats, _ := a.loadChat(ctx, orderID)
	jsonOK(w, buildTrackingView(j, rider, hasReview, chats))
}

func (a *app) submitReview(w http.ResponseWriter, r *http.Request, orderID string) {
	var body struct {
		Stars     int    `json:"stars"`
		Comment   string `json:"comment"`
		TipMicro  int64  `json:"tip_micro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.Stars < 1 || body.Stars > 5 {
		http.Error(w, "stars 1-5", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	j, err := a.loadJobByOrder(ctx, orderID)
	if err != nil {
		http.Error(w, "not_found", http.StatusNotFound)
		return
	}
	id := ulid.New()
	_, err = a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_reviews (id, job_id, order_id, rider_id, stars, comment, tip_micro)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (order_id) DO UPDATE SET stars=$5, comment=$6, tip_micro=$7`,
		id, j.ID, orderID, nullable(j.RiderID), body.Stars, nullable(body.Comment), body.TipMicro)
	if err != nil {
		httpErr(w, err)
		return
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_jobs SET phase='completed', status='completed', updated_at=NOW() WHERE id=$1`, j.ID)
	if j.RiderID != "" {
		_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_riders SET review_count = review_count + 1 WHERE id=$1`, j.RiderID)
	}
	j, _ = a.loadJobByOrder(ctx, orderID)
	rider, _ := a.loadRider(ctx, j.RiderID)
	chats, _ := a.loadChat(ctx, orderID)
	a.pushTracking(ctx, orderID)
	jsonOK(w, buildTrackingView(j, rider, true, chats))
}

func (a *app) patchOrderFulfillment(ctx context.Context, orderID, status, actor string) {
	payload, _ := json.Marshal(map[string]any{"status": status, "actor": actor})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, a.orderURL+"/v1/orders/"+orderID+"/fulfillment", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Aqond-Region", "TH")
	res, err := a.http.Do(req)
	if err != nil {
		return
	}
	res.Body.Close()
}

func (a *app) loadJob(ctx context.Context, id string) (jobRow, error) {
	row := a.pool.QueryRow(ctx, jobSQL()+` WHERE id=$1`, id)
	return scanJob(row.Scan)
}

func (a *app) loadJobByOrder(ctx context.Context, orderID string) (jobRow, error) {
	row := a.pool.QueryRow(ctx, jobSQL()+` WHERE order_id=$1`, orderID)
	return scanJob(row.Scan)
}

func (a *app) loadRider(ctx context.Context, id string) (*riderRow, error) {
	if id == "" {
		return nil, nil
	}
	var r riderRow
	err := a.pool.QueryRow(ctx, `
		SELECT id, display_name, phone, vehicle, plate, rating, review_count, grade, lat, lng
		FROM commerce.dispatch_riders WHERE id=$1`, id).Scan(
		&r.ID, &r.DisplayName, &r.Phone, &r.Vehicle, &r.Plate, &r.Rating, &r.ReviewCount, &r.Grade, &r.Lat, &r.Lng)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (a *app) hasReview(ctx context.Context, orderID string) (bool, error) {
	var id string
	err := a.pool.QueryRow(ctx, `SELECT id FROM commerce.dispatch_reviews WHERE order_id=$1`, orderID).Scan(&id)
	return err == nil, nil
}

func (a *app) logEvent(ctx context.Context, jobID, phase, actor, note string, lat, lng *float64) {
	id := ulid.New()
	_, _ = a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_job_events (id, job_id, phase, actor, note, lat, lng)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, jobID, phase, actor, note, lat, lng)
}

func jobSQL() string {
	return `SELECT id, order_id, merchant_id, buyer_id, COALESCE(rider_id,''), job_type, status, phase,
		payment_method, amount_micro, merchant_name, items_summary, address,
		COALESCE(handoff_note,''), COALESCE(eta_label,''), pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
		rider_lat, rider_lng, delivery_photo_url,
		COALESCE(customer_phone,''), COALESCE(recipient_name,'') FROM commerce.dispatch_jobs`
}

func scanJob(scan func(dest ...any) error) (jobRow, error) {
	var j jobRow
	err := scan(&j.ID, &j.OrderID, &j.MerchantID, &j.BuyerID, &j.RiderID, &j.JobType, &j.Status, &j.Phase,
		&j.PaymentMethod, &j.AmountMicro, &j.MerchantName, &j.ItemsSummary, &j.Address,
		&j.HandoffNote, &j.EtaLabel, &j.PickupLat, &j.PickupLng, &j.DropoffLat, &j.DropoffLng,
		&j.RiderLat, &j.RiderLng, &j.DeliveryPhotoURL, &j.CustomerPhone, &j.RecipientName)
	return j, err
}

func jobMap(j jobRow) map[string]any {
	return map[string]any{
		"id": j.ID, "order_id": j.OrderID, "merchant_id": j.MerchantID, "buyer_id": j.BuyerID,
		"rider_id": j.RiderID, "job_type": j.JobType, "status": j.Status, "phase": j.Phase,
		"payment_method": j.PaymentMethod, "amount_micro": j.AmountMicro,
		"merchant_name": j.MerchantName, "items_summary": j.ItemsSummary,
		"address": j.Address, "handoff_note": j.HandoffNote, "eta_label": j.EtaLabel,
		"customer_phone": j.CustomerPhone, "recipient_name": j.RecipientName,
		"pickup": map[string]float64{"lat": j.PickupLat, "lng": j.PickupLng},
		"dropoff": map[string]float64{"lat": j.DropoffLat, "lng": j.DropoffLng},
	}
}

func nextRiderPhase(cur string) string {
	for i, p := range riderPhaseFlow {
		if p == cur && i+1 < len(riderPhaseFlow) {
			return riderPhaseFlow[i+1]
		}
	}
	if cur == "food_ready" || cur == "finding_rider" {
		return "rider_assigned"
	}
	return ""
}

func nullable(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func httpErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
