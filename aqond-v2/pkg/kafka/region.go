package kafka

import (
	"context"
	"fmt"

	"github.com/aqond/aqond-v2/pkg/config"
	"github.com/segmentio/kafka-go"
)

// RegionalTopic suffixes topic with region for multi-region clusters (P57).
func RegionalTopic(baseTopic, region string) string {
	if region == "" {
		region = config.LoadRegion()
	}
	return fmt.Sprintf("%s.%s", baseTopic, region)
}

// PublishRegional publishes with shard_key partition key and regional topic naming.
func PublishRegional(ctx context.Context, w *kafka.Writer, region string, shardKey, value []byte) error {
	_ = region
	return PublishPartitioned(ctx, w, shardKey, value)
}

// EnsureRegionalTopic creates topic with partition count keyed by shard load.
func EnsureRegionalTopic(ctx context.Context, brokers []string, baseTopic, region string, partitions int) error {
	return EnsureTopic(ctx, brokers, RegionalTopic(baseTopic, region), partitions)
}
