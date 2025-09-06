import type { Migration, DatabaseConnection } from '../index.js';

/**
 * Decision and action tracking migration
 */
export const migration_002_decision_tracking: Migration = {
  id: '002',
  name: 'decision_tracking',
  dependencies: ['001'],
  
  async up(db: DatabaseConnection): Promise<void> {
    // Decisions table - AI/Rule-based moderation decisions
    await db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        message_id BIGINT,
        content_hash VARCHAR(64) NOT NULL,
        verdict VARCHAR(50) NOT NULL,
        confidence DECIMAL(5,4),
        reasoning TEXT,
        processing_time_ms INTEGER,
        ai_model VARCHAR(100),
        ai_cost DECIMAL(10,6),
        cache_hit BOOLEAN DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Actions table - Executed moderation actions
    await db.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        action_data TEXT NOT NULL DEFAULT '{}',
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL DEFAULT 0,
        error_message TEXT
      )
    `);

    // Create indexes for decision queries
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decisions_tenant_group ON decisions(tenant_id, group_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_content_hash ON decisions(content_hash);
      CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
      CREATE INDEX IF NOT EXISTS idx_decisions_verdict ON decisions(verdict);
      CREATE INDEX IF NOT EXISTS idx_actions_decision_id ON actions(decision_id);
      CREATE INDEX IF NOT EXISTS idx_actions_executed_at ON actions(executed_at);
    `);
  },

  async down(db: DatabaseConnection): Promise<void> {
    await db.exec('DROP TABLE IF EXISTS actions');
    await db.exec('DROP TABLE IF EXISTS decisions');
  }
};
