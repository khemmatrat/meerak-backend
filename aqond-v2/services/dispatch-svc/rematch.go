package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"
)

func acceptTimeoutSec() int {
	if sequentialOfferEnabled() {
		return offerTimeoutSec()
	}
	if v := os.Getenv("DISPATCH_ACCEPT_TIMEOUT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 90
}

func maxMatchAttempts() int {
	if v := os.Getenv("DISPATCH_MAX_MATCH_ATTEMPTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 5
}

// startRematchLoop re-opens jobs when auto-assigned riders do not accept in time.
func (a *app) startRematchLoop(ctx context.Context) {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.processRematches(ctx)
		}
	}
}

func (a *app) processRematches(ctx context.Context) {
	timeout := acceptTimeoutSec()
	rows, err := a.pool.Query(ctx, `
		SELECT id, rider_id, pickup_lat, pickup_lng, match_attempts
		FROM commerce.dispatch_jobs
		WHERE status='assigned' AND phase='pending_accept'
		  AND auto_assigned_at IS NOT NULL
		  AND auto_assigned_at < NOW() - make_interval(secs => $1)
		  AND match_attempts < $2`, timeout, maxMatchAttempts())
	if err != nil {
		return
	}
	defer rows.Close()

	// Collect first so we release the read connection before issuing writes.
	type rematchRow struct {
		jobID, prevRider string
		lat, lng         float64
	}
	var pending []rematchRow
	for rows.Next() {
		var r rematchRow
		var attempts int
		if rows.Scan(&r.jobID, &r.prevRider, &r.lat, &r.lng, &attempts) != nil {
			continue
		}
		pending = append(pending, r)
	}
	rows.Close()

	seq := sequentialOfferEnabled()
	for _, r := range pending {
		// When a sequential offer goroutine already owns this job it manages its
		// own per-offer timeout and re-offer loop. Reopening here would race it:
		// double-decrement rider load, thrash job state, and burn match_attempts.
		if seq {
			if _, running := a.offerRuns.Load(r.jobID); running {
				continue
			}
		}
		if err := a.reopenJobForRematch(ctx, r.jobID, r.prevRider); err != nil {
			log.Printf("rematch %s: %v", r.jobID, err)
			continue
		}
		if seq {
			a.startSequentialOffer(ctx, r.jobID, r.prevRider)
		} else {
			a.autoMatchJobExcluding(ctx, r.jobID, r.lat, r.lng, r.prevRider)
		}
	}
}

func (a *app) reopenJobForRematch(ctx context.Context, jobID, prevRider string) error {
	if prevRider != "" {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_riders
			SET load_count = GREATEST(0, load_count - 1) WHERE id=$1`, prevRider)
	}
	_, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs
		SET rider_id=NULL, status='open', phase='finding_rider',
		    auto_assigned_at=NULL, match_attempts = match_attempts + 1, updated_at=NOW()
		WHERE id=$1 AND phase='pending_accept'`, jobID)
	if err != nil {
		return err
	}
	a.logEvent(ctx, jobID, "finding_rider", "system", "rematch_timeout", nil, nil)
	j, _ := a.loadJob(ctx, jobID)
	if j.OrderID != "" {
		a.pushTracking(ctx, j.OrderID)
	}
	return nil
}
