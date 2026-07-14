package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Window checks a Redis sliding window counter (requests per windowSeconds).
type Window struct {
	redis  *redis.Client
	limit  int
	window time.Duration
}

func NewWindow(rdb *redis.Client, limit int, windowSeconds int) *Window {
	if limit < 1 {
		limit = 60
	}
	if windowSeconds < 1 {
		windowSeconds = 60
	}
	return &Window{redis: rdb, limit: limit, window: time.Duration(windowSeconds) * time.Second}
}

func (w *Window) Allow(ctx context.Context, scope, id string) (bool, error) {
	if id == "" {
		return true, nil
	}
	key := fmt.Sprintf("rl:%s:%s", scope, id)
	n, err := w.redis.Incr(ctx, key).Result()
	if err != nil {
		return true, err
	}
	if n == 1 {
		_ = w.redis.Expire(ctx, key, w.window).Err()
	}
	return n <= int64(w.limit), nil
}
