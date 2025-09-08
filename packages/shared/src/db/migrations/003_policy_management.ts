import type { Migration, DatabaseConnection } from '../index.js';

/**
 * Policy management migration
 */
export const migration_003_policy_management: Migration = {
  id: '003',
  name: 'policy_management',
  dependencies: ['001'],

  async up(db: DatabaseConnection): Promise<void> {
    // Policies table - Moderation policies and rules
    await db.exec(`
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT 1,
        policy_data TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Group policies - Policy assignments to groups
    await db.exec(`
      CREATE TABLE IF NOT EXISTS group_policies (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 100,
        overrides TEXT DEFAULT '{}',
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, policy_id)
      )
    `);

    // Keyword whitelist - Per-group allowed keywords
    await db.exec(`
      CREATE TABLE IF NOT EXISTS keyword_whitelist (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        keyword VARCHAR(255) NOT NULL COLLATE NOCASE,
        added_by TEXT REFERENCES users(id),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, keyword)
      )
    `);

    // Create indexes for policy queries
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_policies_tenant_id ON policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_policies_active ON policies(is_active);
      CREATE INDEX IF NOT EXISTS idx_group_policies_group_id ON group_policies(group_id);
      CREATE INDEX IF NOT EXISTS idx_group_policies_priority ON group_policies(priority);
      CREATE INDEX IF NOT EXISTS idx_keyword_whitelist_group_id ON keyword_whitelist(group_id);
    `);
  },

  async down(db: DatabaseConnection): Promise<void> {
    await db.exec('DROP TABLE IF EXISTS keyword_whitelist');
    await db.exec('DROP TABLE IF EXISTS group_policies');
    await db.exec('DROP TABLE IF EXISTS policies');
  },
};
