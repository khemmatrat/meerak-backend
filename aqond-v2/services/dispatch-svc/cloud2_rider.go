package main

import (
	"context"
	"log"

	"github.com/aqond/aqond-v2/pkg/crosscloud"
)

// syncRiderFromCloud2 promotes pending riders when legacy KYC wrote rider.approved:{userId} in Redis.
func (a *app) syncRiderFromCloud2(ctx context.Context, userID string) {
	if a.redis == nil || userID == "" {
		return
	}
	approval, err := crosscloud.LoadRiderApproval(ctx, a.redis, userID)
	if err != nil {
		log.Printf("dispatch: rider approval read: %v", err)
		return
	}
	if approval == nil {
		return
	}
	tag, err := a.pool.Exec(ctx, `
		UPDATE commerce.dispatch_riders
		SET active=TRUE, kyc_status='approved',
		    display_name=COALESCE(NULLIF($2,''), display_name),
		    phone=COALESCE(NULLIF($3,''), phone),
		    vehicle=COALESCE(NULLIF($4,''), vehicle),
		    plate=COALESCE(NULLIF($5,''), plate)
		WHERE user_id=$1 AND kyc_status <> 'approved'`,
		userID, approval.DisplayName, approval.Phone, approval.Vehicle, approval.Plate)
	if err != nil {
		log.Printf("dispatch: rider sync update: %v", err)
		return
	}
	if tag.RowsAffected() > 0 {
		log.Printf("dispatch: synced rider approval from Cloud 2 for user %s", userID)
	}
}
