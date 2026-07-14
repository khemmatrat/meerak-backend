-- P48: Distribute commerce tables on Citus (run AFTER bootstrap-cluster + schema migrations)
-- Requires: CREATE EXTENSION citus; workers registered via citus_add_node

CREATE EXTENSION IF NOT EXISTS citus;

-- Reference tables (global metadata, small lookups)
SELECT create_reference_table('commerce.shard_catalog');
SELECT create_reference_table('commerce.table_shard_class');
SELECT create_reference_table('commerce.residency_audit');
SELECT create_reference_table('commerce.region_read_mirrors');

-- Distributed tables — colocated on shard_key (merchant tenant)
SELECT create_distributed_table('commerce.merchants', 'shard_key');
SELECT create_distributed_table('commerce.stores', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.products', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.product_variants', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.inventory', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.inventory_reservations', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.orders', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.order_items', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.wallets', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.wallet_ledger', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.outbox', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.hermes_episodic_memory', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.hermes_procedural_rules', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.media', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.posts', 'shard_key', colocate_with => 'commerce.merchants');
SELECT create_distributed_table('commerce.user_interests', 'user_id');
SELECT create_distributed_table('commerce.feed_experiments', 'user_id');

-- Verify distribution
SELECT logicalrelid::regclass AS table_name, partmethod, colocationid
FROM pg_dist_partition
WHERE logicalrelid::text LIKE 'commerce.%'
ORDER BY 1;
