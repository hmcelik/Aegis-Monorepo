import type { Migration, DatabaseConnection } from '../index.js';

/**
 * Initial schema migration - Create core tables
 */
export const migration_001_initial_schema: Migration = {
  id: '001',
  name: 'initial_schema',

  async up(db: DatabaseConnection): Promise<void> {
    // Tenants table - Core multi-tenant structure
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        plan_type VARCHAR(50) NOT NULL DEFAULT 'basic',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tenant settings - Key-value configuration per tenant
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key VARCHAR(255) NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, key)
      )
    `);

    // Groups table - Telegram chat groups
    await db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        chat_id BIGINT UNIQUE NOT NULL,
        chat_title VARCHAR(255) NOT NULL,
        chat_type VARCHAR(50) NOT NULL DEFAULT 'group',
        member_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table - Telegram users
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        language_code VARCHAR(10),
        is_bot BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Group members - Many-to-many relationship
    await db.exec(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        PRIMARY KEY (group_id, user_id)
      )
    `);

    // Events table - Event sourcing for audit trail
    await db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        aggregate_id TEXT NOT NULL,
        aggregate_type VARCHAR(100) NOT NULL,
        event_data TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        sequence_number INTEGER,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME
      )
    `);

    // Create indexes for performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_groups_tenant_id ON groups(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_groups_chat_id ON groups(chat_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
      CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON events(tenant_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_id, aggregate_type);
      CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
    `);
  },

  async down(db: DatabaseConnection): Promise<void> {
    // Drop in reverse order due to foreign key constraints
    await db.exec('DROP TABLE IF EXISTS events');
    await db.exec('DROP TABLE IF EXISTS group_members');
    await db.exec('DROP TABLE IF EXISTS users');
    await db.exec('DROP TABLE IF EXISTS groups');
    await db.exec('DROP TABLE IF EXISTS tenant_settings');
    await db.exec('DROP TABLE IF EXISTS tenants');
  },
};
