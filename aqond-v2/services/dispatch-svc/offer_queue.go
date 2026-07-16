package main

import (
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"time"
)

var errJobNotOpen = errors.New("job_not_open")

func sequentialOfferEnabled() bool {
	return os.Getenv("DISPATCH_SEQUENTIAL_OFFER") != "0"
}

func offerTimeoutSec() int {
	if v := os.Getenv("DISPATCH_OFFER_TIMEOUT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 15
}

func maxOffersPerRound() int {
	if v := os.Getenv("DISPATCH_MAX_OFFERS_PER_ROUND"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 5
}

func (a *app) signalOfferOutcome(jobID string, accepted bool) {
	if ch, ok := a.offerSignals.Load(jobID); ok {
		select {
		case ch.(chan bool) <- accepted:
		default:
		}
	}
}

func (a *app) assignPendingOffer(ctx context.Context, jobID, riderID string) error {
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs
		SET rider_id=$2, status='assigned', phase='pending_accept',
		    auto_assigned_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND status IN ('open','assigned') AND phase IN ('finding_rider','pending_accept')`,
		jobID, riderID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errJobNotOpen
	}
	_, _ = a.pool.Exec(ctx, `UPDATE commerce.dispatch_riders SET load_count = load_count + 1 WHERE id=$1`, riderID)
	a.logEvent(ctx, jobID, "pending_accept", riderID, "sequential_offer", nil, nil)
	j, _ := a.loadJob(ctx, jobID)
	a.firePhaseNotifications(ctx, j, "pending_accept")
	a.pushTracking(ctx, j.OrderID)
	return nil
}

func (a *app) reopenJobAfterOfferDeclined(ctx context.Context, jobID, prevRider string) error {
	if prevRider != "" {
		_, _ = a.pool.Exec(ctx, `
			UPDATE commerce.dispatch_riders
			SET load_count = GREATEST(0, load_count - 1) WHERE id=$1`, prevRider)
	}
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_jobs
		SET rider_id=NULL, status='open', phase='finding_rider',
		    auto_assigned_at=NULL, updated_at=NOW()
		WHERE id=$1 AND phase='pending_accept'`, jobID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	a.logEvent(ctx, jobID, "finding_rider", "system", "offer_declined", nil, nil)
	j, _ := a.loadJob(ctx, jobID)
	if j.OrderID != "" {
		a.pushTracking(ctx, j.OrderID)
	}
	return nil
}

func (a *app) waitOfferOutcome(ctx context.Context, jobID, riderID string, timeoutSec int) bool {
	ch := make(chan bool, 1)
	a.offerSignals.Store(jobID, ch)
	defer a.offerSignals.Delete(jobID)

	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()

	for {
		j, _ := a.loadJob(ctx, jobID)
		if j.Phase == "rider_assigned" && j.RiderID == riderID {
			return true
		}
		if j.Phase != "pending_accept" || j.RiderID != riderID {
			return false
		}
		if time.Now().After(deadline) {
			return false
		}

		select {
		case ok := <-ch:
			return ok
		case <-ctx.Done():
			return false
		case <-tick.C:
		}
	}
}

func (a *app) startSequentialOffer(parent context.Context, jobID string, seedExclude string) {
	if !sequentialOfferEnabled() {
		return
	}
	if _, loaded := a.offerRuns.LoadOrStore(jobID, true); loaded {
		return
	}
	go a.runSequentialOffer(parent, jobID, seedExclude)
}

func (a *app) runSequentialOffer(parent context.Context, jobID string, seedExclude string) {
	defer a.offerRuns.Delete(jobID)

	ctx := context.Background()
	excluded := map[string]bool{}
	if seedExclude != "" {
		excluded[seedExclude] = true
	}

	j, err := a.loadJob(ctx, jobID)
	if err != nil || j.ID == "" {
		return
	}
	if j.Status != "open" && j.Phase != "finding_rider" {
		return
	}

	riders := a.loadActiveRiders(ctx)
	limit := maxOffersPerRound()
	timeout := offerTimeoutSec()

	for _, radius := range dispatchRadiusStepsKm() {
		ranked := a.rankCandidatesForJob(ctx, riders, j, radius, limit)
		if len(ranked) == 0 {
			log.Printf("dispatch: no eligible riders job=%s radius=%.1fkm", jobID, radius)
			continue
		}
		for _, riderID := range ranked {
			if excluded[riderID] {
				continue
			}
			if err := a.assignPendingOffer(ctx, jobID, riderID); err != nil {
				continue
			}
			accepted := a.waitOfferOutcome(ctx, jobID, riderID, timeout)
			if accepted {
				log.Printf("dispatch: job accepted job=%s rider=%s radius=%.1fkm", jobID, riderID, radius)
				return
			}
			excluded[riderID] = true
			_ = a.reopenJobAfterOfferDeclined(ctx, jobID, riderID)
			j, _ = a.loadJob(ctx, jobID)
			if j.Status != "open" || j.Phase != "finding_rider" {
				return
			}
		}
	}

	a.logEvent(ctx, jobID, "finding_rider", "system", "no_rider_accepted", nil, nil)
	log.Printf("dispatch: sequential offers exhausted job=%s", jobID)
}
