package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aqond/aqond-v2/pkg/ulid"
)

// opsHeatmap aggregates rider + open job locations for ops dashboard.
func (a *app) opsHeatmap(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	points := []map[string]any{}

	rows, err := a.pool.Query(ctx, `
		SELECT 'rider' AS kind, id, lat, lng, load_count, grade
		FROM commerce.dispatch_riders WHERE active=TRUE AND lat IS NOT NULL AND lng IS NOT NULL`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var kind, id, grade string
			var lat, lng float64
			var load int
			if rows.Scan(&kind, &id, &lat, &lng, &load, &grade) == nil {
				points = append(points, map[string]any{
					"kind": kind, "id": id, "lat": lat, "lng": lng, "weight": load + 1, "grade": grade,
				})
			}
		}
	}

	rows2, err := a.pool.Query(ctx, `
		SELECT 'job' AS kind, id, dropoff_lat, dropoff_lng, status, phase
		FROM commerce.dispatch_jobs
		WHERE status IN ('open','assigned') AND dropoff_lat IS NOT NULL AND dropoff_lng IS NOT NULL`)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var kind, id, status, phase string
			var lat, lng float64
			if rows2.Scan(&kind, &id, &lat, &lng, &status, &phase) == nil {
				points = append(points, map[string]any{
					"kind": kind, "id": id, "lat": lat, "lng": lng, "weight": 2, "status": status, "phase": phase,
				})
			}
		}
	}

	jsonOK(w, map[string]any{"points": points, "count": len(points)})
}

// createBatch groups nearby open jobs into a multi-stop route for a rider.
func (a *app) createBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ZoneID  string   `json:"zone_id"`
		RiderID string   `json:"rider_id"`
		JobIDs  []string `json:"job_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	batchID := ulid.New()
	zone := strings.TrimSpace(body.ZoneID)
	if zone == "" {
		zone = "default"
	}

	jobIDs := body.JobIDs
	if len(jobIDs) == 0 {
		rows, err := a.pool.Query(ctx, `
			SELECT id FROM commerce.dispatch_jobs
			WHERE status='open' AND batch_id IS NULL
			ORDER BY created_at ASC LIMIT 5`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					jobIDs = append(jobIDs, id)
				}
			}
		}
	}
	if len(jobIDs) == 0 {
		http.Error(w, "no_open_jobs", http.StatusBadRequest)
		return
	}

	_, err := a.pool.Exec(ctx, `
		INSERT INTO commerce.dispatch_batches (id, rider_id, zone_id, status, stop_count)
		VALUES ($1, NULLIF($2,''), $3, 'open', $4)`,
		batchID, body.RiderID, zone, len(jobIDs))
	if err != nil {
		httpErr(w, err)
		return
	}

	for i, jid := range jobIDs {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_jobs SET batch_id=$2, stop_seq=$3, updated_at=NOW()
			WHERE id=$1 AND status='open'`, jid, batchID, i+1)
	}

	if body.RiderID != "" {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_batches SET rider_id=$2, status='assigned', updated_at=NOW() WHERE id=$1`,
			batchID, body.RiderID)
		for _, jid := range jobIDs {
			_, _ = a.pool.Exec(ctx, `
				UPDATE commerce.dispatch_jobs SET rider_id=$2, status='assigned', phase='rider_assigned', updated_at=NOW()
				WHERE id=$1`, jid, body.RiderID)
		}
	}

	jsonOK(w, map[string]any{"batch_id": batchID, "job_ids": jobIDs, "stop_count": len(jobIDs)})
}

func (a *app) listBatches(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	riderID := r.URL.Query().Get("rider_id")
	q := `SELECT id, rider_id, zone_id, status, stop_count, created_at FROM commerce.dispatch_batches`
	args := []any{}
	if riderID != "" {
		q += ` WHERE rider_id=$1`
		args = append(args, riderID)
	}
	q += ` ORDER BY created_at DESC LIMIT 20`
	rows, err := a.pool.Query(ctx, q, args...)
	if err != nil {
		httpErr(w, err)
		return
	}
	defer rows.Close()
	var batches []map[string]any
	for rows.Next() {
		var id, rid, zone, status string
		var stops int
		var created any
		if rows.Scan(&id, &rid, &zone, &status, &stops, &created) == nil {
			batches = append(batches, map[string]any{
				"id": id, "rider_id": rid, "zone_id": zone, "status": status,
				"stop_count": stops, "created_at": created,
			})
		}
	}
	jsonOK(w, map[string]any{"batches": batches})
}

func (a *app) dispatchBatches(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listBatches(w, r)
	case http.MethodPost:
		a.createBatch(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
