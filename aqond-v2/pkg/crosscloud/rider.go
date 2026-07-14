package crosscloud

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
)

const RiderApprovedPrefix = "rider.approved:"

// RiderApproval is written by Cloud 2 legacy backend after MatchJob KYC approval.
type RiderApproval struct {
	UserID      string `json:"user_id"`
	Approved    bool   `json:"approved"`
	DisplayName string `json:"display_name"`
	Phone       string `json:"phone"`
	Vehicle     string `json:"vehicle"`
	Plate       string `json:"plate"`
}

func RiderApprovedKey(userID string) string {
	return RiderApprovedPrefix + userID
}

// LoadRiderApproval reads rider.approved:{userId} from Redis.
func LoadRiderApproval(ctx context.Context, rdb redis.UniversalClient, userID string) (*RiderApproval, error) {
	if rdb == nil || userID == "" {
		return nil, nil
	}
	raw, err := rdb.Get(ctx, RiderApprovedKey(userID)).Result()
	if err == redis.Nil || raw == "" {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var a RiderApproval
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return nil, err
	}
	if !a.Approved {
		return nil, nil
	}
	if a.UserID == "" {
		a.UserID = userID
	}
	return &a, nil
}

// PublishRiderApproval is used by dev scripts / legacy backend bridge.
func PublishRiderApproval(ctx context.Context, rdb redis.UniversalClient, a RiderApproval) error {
	if rdb == nil {
		return fmt.Errorf("redis unavailable")
	}
	a.Approved = true
	if a.UserID == "" {
		return fmt.Errorf("user_id required")
	}
	b, _ := json.Marshal(a)
	return rdb.Set(ctx, RiderApprovedKey(a.UserID), string(b), 0).Err()
}
