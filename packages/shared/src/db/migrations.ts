import { DatabaseManager } from './index.js';
import { migration_001_initial_schema } from './migrations/001_initial_schema.js';
import { migration_002_decision_tracking } from './migrations/002_decision_tracking.js';
import { migration_003_policy_management } from './migrations/003_policy_management.js';
import { migration_004_usage_tracking } from './migrations/004_usage_tracking.js';

/**
 * Register all migrations with the database manager
 */
export function registerMigrations(dbManager: DatabaseManager): void {
  dbManager.registerMigration(migration_001_initial_schema);
  dbManager.registerMigration(migration_002_decision_tracking);
  dbManager.registerMigration(migration_003_policy_management);
  dbManager.registerMigration(migration_004_usage_tracking);
}

/**
 * Initialize database with migrations
 */
export async function initializeDatabase(dbManager: DatabaseManager): Promise<void> {
  registerMigrations(dbManager);
  await dbManager.runMigrations();
}
