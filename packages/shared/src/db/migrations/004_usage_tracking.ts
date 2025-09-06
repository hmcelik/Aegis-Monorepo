import type { Migration, DatabaseConnection } from '../index.js';

/**
 * Usage tracking and budget management migration
 */
export const migration_004_usage_tracking: Migration = {
  id: '004',
  name: 'usage_tracking',
  dependencies: ['001'],
  
  async up(db: DatabaseConnection): Promise<void> {
    // Usage metrics - Detailed usage tracking
    await db.exec(`
      CREATE TABLE IF NOT EXISTS usage_metrics (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        metric_type VARCHAR(50) NOT NULL,
        metric_value BIGINT NOT NULL,
        cost DECIMAL(10,6),
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Budget limits - Per-tenant spending limits
    await db.exec(`
      CREATE TABLE IF NOT EXISTS budget_limits (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        limit_type VARCHAR(50) NOT NULL,
        limit_value DECIMAL(10,2) NOT NULL,
        current_usage DECIMAL(10,2) NOT NULL DEFAULT 0,
        reset_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
        last_reset DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        degrade_mode VARCHAR(50) NOT NULL DEFAULT 'strict_rules',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Daily usage rollups - Aggregated daily statistics
    await db.exec(`
      CREATE TABLE IF NOT EXISTS daily_usage_rollups (
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        usage_date DATE NOT NULL,
        messages_processed BIGINT DEFAULT 0,
        ai_calls_made INTEGER DEFAULT 0,
        ai_cost DECIMAL(10,6) DEFAULT 0,
        cache_hits INTEGER DEFAULT 0,
        cache_misses INTEGER DEFAULT 0,
        avg_processing_time_ms DECIMAL(8,2),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, usage_date)
      )
    `);

    // Strikes tracking - User penalties
    await db.exec(`
      CREATE TABLE IF NOT EXISTS strikes (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        count INTEGER NOT NULL DEFAULT 0,
        reason VARCHAR(255),
        expires_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      )
    `);

    // Create indexes for usage queries
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_type ON usage_metrics(tenant_id, metric_type);
      CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period_start, period_end);
      CREATE INDEX IF NOT EXISTS idx_budget_limits_tenant_id ON budget_limits(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_budget_limits_active ON budget_limits(is_active);
      CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage_rollups(usage_date);
      CREATE INDEX IF NOT EXISTS idx_strikes_group_user ON strikes(group_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_strikes_expires_at ON strikes(expires_at);
    `);
  },

  async down(db: DatabaseConnection): Promise<void> {
    await db.exec('DROP TABLE IF EXISTS strikes');
    await db.exec('DROP TABLE IF EXISTS daily_usage_rollups');
    await db.exec('DROP TABLE IF EXISTS budget_limits');
    await db.exec('DROP TABLE IF EXISTS usage_metrics');
  }
};
