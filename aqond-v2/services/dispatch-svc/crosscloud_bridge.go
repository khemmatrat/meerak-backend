package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/aqond/aqond-v2/pkg/crosscloud"
)

func dispatchMode() string {
	m := strings.ToLower(strings.TrimSpace(os.Getenv("DISPATCH_MODE")))
	switch m {
	case "v1", "v2", "hybrid":
		return m
	default:
		return "v2"
	}
}

func (a *app) orderReadyEvent(j jobRow) crosscloud.OrderReadyEvent {
	return crosscloud.OrderReadyEvent{
		Event:       "order.ready",
		OrderID:     j.OrderID,
		MerchantID:  j.MerchantID,
		BuyerID:     j.BuyerID,
		JobType:     j.JobType,
		AmountMicro: j.AmountMicro,
		PickupLat:   j.PickupLat,
		PickupLng:   j.PickupLng,
		DropoffLat:  j.DropoffLat,
		DropoffLng:  j.DropoffLng,
		JobID:       j.ID,
	}
}

func (a *app) publishOrderReady(ctx context.Context, j jobRow) {
	if a.redis == nil {
		return
	}
	ev := a.orderReadyEvent(j)
	if err := crosscloud.PublishOrderReady(ctx, a.redis, ev); err != nil {
		log.Printf("dispatch: publish order.ready: %v", err)
	}
}

func (a *app) maybeForwardV1Match(ctx context.Context, j jobRow) {
	mode := dispatchMode()
	if mode != "v1" && mode != "hybrid" {
		return
	}
	ev := a.orderReadyEvent(j)
	status, err := crosscloud.ForwardOrderToV1Match(ctx, ev)
	if err != nil {
		log.Printf("dispatch: v1 match forward (%s): %v", mode, err)
		return
	}
	if status >= 400 {
		log.Printf("dispatch: v1 match forward status=%d mode=%s order=%s", status, mode, j.OrderID)
	}
}

func (a *app) shouldAutoMatchV2() bool {
	switch dispatchMode() {
	case "v1":
		return false
	default:
		return true
	}
}
