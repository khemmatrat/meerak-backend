package redisclient

import (
	"context"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/redis/go-redis/v9"
)

// NewUniversal returns a standalone or cluster client (P56).
func NewUniversal() redis.UniversalClient {
	if config.RedisClusterMode() {
		return redis.NewClusterClient(&redis.ClusterOptions{
			Addrs: config.LoadRedisClusterAddrs(),
		})
	}
	return redis.NewClient(&redis.Options{Addr: config.LoadRedisAddr()})
}

func Ping(ctx context.Context, c redis.UniversalClient) error {
	return c.Ping(ctx).Err()
}
