package residency

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Enforcer blocks out-of-region writes and audits attempts (P54).
type Enforcer struct {
	pool *pgxpool.Pool
}

func NewEnforcer(pool *pgxpool.Pool) *Enforcer {
	return &Enforcer{pool: pool}
}

func (e *Enforcer) CheckWrite(ctx context.Context, entityType, entityID, shardKey, homeRegion, attemptRegion, action string) error {
	home := normalize(homeRegion)
	attempt := normalize(attemptRegion)
	allowed := home == "" || attempt == "" || home == attempt
	reason := "ok"
	if !allowed {
		reason = fmt.Sprintf("residency violation: home=%s attempt=%s", home, attempt)
	}
	_, _ = e.pool.Exec(ctx, `
		INSERT INTO commerce.residency_audit (entity_type, entity_id, shard_key, home_region, attempted_region, action, allowed, reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		entityType, entityID, shardKey, home, attempt, action, allowed, reason)
	if !allowed {
		return fmt.Errorf("%s", reason)
	}
	return nil
}

func normalize(r string) string {
	return strings.ToUpper(strings.TrimSpace(r))
}

// TagForTable returns residency tag from table_shard_class.
func TagForTable(ctx context.Context, pool *pgxpool.Pool, table string) string {
	var tag string
	_ = pool.QueryRow(ctx, `
		SELECT residency_tag FROM commerce.table_shard_class
		WHERE schema_name='commerce' AND table_name=$1`, table).Scan(&tag)
	return tag
}
