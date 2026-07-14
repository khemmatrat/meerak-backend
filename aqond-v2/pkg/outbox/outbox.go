package outbox

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	AggregateType string
	AggregateID   string
	EventType     string
	ShardKey      string
	Payload       map[string]any
}

func Insert(ctx context.Context, pool *pgxpool.Pool, e Event) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO commerce.outbox (aggregate_type, aggregate_id, event_type, shard_key, payload)
		VALUES ($1, $2, $3, $4, $5::jsonb)`,
		e.AggregateType, e.AggregateID, e.EventType, e.ShardKey, string(payload),
	)
	return err
}
