import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager, DatabaseConfig } from '../src/db/index.js';
import { TenantRepository } from '../src/db/repositories/TenantRepository.js';
import { DecisionRepository } from '../src/db/repositories/DecisionRepository.js';
import { DualWriteAdapter } from '../src/db/DualWriteAdapter.js';
import { initializeDatabase } from '../src/db/migrations.js';

describe('Database Layer', () => {
  let dbManager: DatabaseManager;
  let tenantRepo: TenantRepository;

  beforeEach(async () => {
    // Use in-memory SQLite for testing
    const config: DatabaseConfig = {
      type: 'sqlite',
      database: ':memory:',
    };

    dbManager = new DatabaseManager(config);
    await initializeDatabase(dbManager);

    const connection = await dbManager.getConnection();
    tenantRepo = new TenantRepository(connection);
  });

  afterEach(async () => {
    await dbManager.closeAll();
  });

  describe('DatabaseManager', () => {
    it('should create and manage database connections', async () => {
      const connection = await dbManager.getConnection('test');
      expect(connection).toBeDefined();
      expect(typeof connection.query).toBe('function');
      expect(typeof connection.run).toBe('function');
      expect(typeof connection.exec).toBe('function');
    });

    it('should run migrations successfully', async () => {
      // Check if migrations table exists
      const connection = await dbManager.getConnection();
      const migrations = await connection.query('SELECT * FROM schema_migrations');

      // Should have our 4 initial migrations
      expect(migrations.length).toBeGreaterThanOrEqual(4);
      expect(migrations.some(m => m.id === '001')).toBe(true);
      expect(migrations.some(m => m.id === '002')).toBe(true);
      expect(migrations.some(m => m.id === '003')).toBe(true);
      expect(migrations.some(m => m.id === '004')).toBe(true);
    });

    it('should not re-run completed migrations', async () => {
      const connection = await dbManager.getConnection();
      const beforeCount = await connection.query('SELECT COUNT(*) as count FROM schema_migrations');

      // Try to run migrations again
      await dbManager.runMigrations();

      const afterCount = await connection.query('SELECT COUNT(*) as count FROM schema_migrations');
      expect(afterCount[0].count).toBe(beforeCount[0].count);
    });
  });

  describe('TenantRepository', () => {
    it('should create a new tenant', async () => {
      const tenant = await tenantRepo.create({
        name: 'Test Tenant',
        status: 'active',
        planType: 'basic',
      });

      expect(tenant).toBeDefined();
      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.status).toBe('active');
      expect(tenant.planType).toBe('basic');
      expect(tenant.id).toBeDefined();
    });

    it('should find tenant by ID', async () => {
      const created = await tenantRepo.create({
        name: 'Find Test Tenant',
      });

      const found = await tenantRepo.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Find Test Tenant');
    });

    it('should find tenant by name', async () => {
      await tenantRepo.create({
        name: 'Unique Tenant Name',
      });

      const found = await tenantRepo.findByName('Unique Tenant Name');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Unique Tenant Name');
    });

    it('should update tenant information', async () => {
      const tenant = await tenantRepo.create({
        name: 'Original Name',
      });

      const updated = await tenantRepo.update(tenant.id, {
        name: 'Updated Name',
        status: 'suspended',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.status).toBe('suspended');
    });

    it('should list tenants with filtering', async () => {
      await tenantRepo.create({ name: 'Active Tenant', status: 'active' });
      await tenantRepo.create({ name: 'Suspended Tenant', status: 'suspended' });

      const activeTenants = await tenantRepo.list({ status: 'active' });
      expect(activeTenants.length).toBe(1);
      expect(activeTenants[0].name).toBe('Active Tenant');

      const allTenants = await tenantRepo.list();
      expect(allTenants.length).toBe(2);
    });

    it('should manage tenant settings', async () => {
      const tenant = await tenantRepo.create({
        name: 'Settings Test Tenant',
      });

      // Set a setting
      await tenantRepo.setSetting(tenant.id, 'max_messages_per_day', '1000');

      // Get the setting
      const value = await tenantRepo.getSetting(tenant.id, 'max_messages_per_day');
      expect(value).toBe('1000');

      // Get all settings
      const settings = await tenantRepo.getSettings(tenant.id);
      expect(settings['max_messages_per_day']).toBe('1000');

      // Update setting
      await tenantRepo.setSetting(tenant.id, 'max_messages_per_day', '2000');
      const updatedValue = await tenantRepo.getSetting(tenant.id, 'max_messages_per_day');
      expect(updatedValue).toBe('2000');

      // Delete setting
      const deleted = await tenantRepo.deleteSetting(tenant.id, 'max_messages_per_day');
      expect(deleted).toBe(true);

      const deletedValue = await tenantRepo.getSetting(tenant.id, 'max_messages_per_day');
      expect(deletedValue).toBeNull();
    });
  });

  describe('DecisionRepository', () => {
    let decisionRepo: DecisionRepository;
    let testTenant: any;

    beforeEach(async () => {
      testTenant = await tenantRepo.create({
        name: 'Decision Test Tenant',
      });

      const connection = await dbManager.getConnection();
      decisionRepo = new DecisionRepository(connection, testTenant.id);
    });

    it('should create a decision', async () => {
      const decision = await decisionRepo.createDecision({
        contentHash: 'abc123',
        verdict: 'block',
        confidence: 0.95,
        reasoning: { rule: 'spam_detection', score: 0.95 },
        processingTimeMs: 150,
        aiModel: 'gpt-4',
        aiCost: 0.001,
        cacheHit: false,
      });

      expect(decision).toBeDefined();
      expect(decision.verdict).toBe('block');
      expect(decision.confidence).toBe(0.95);
      expect(decision.reasoning).toEqual({ rule: 'spam_detection', score: 0.95 });
      expect(decision.cacheHit).toBe(false);
    });

    it('should find decision by content hash', async () => {
      const contentHash = 'test_hash_123';

      await decisionRepo.createDecision({
        contentHash,
        verdict: 'allow',
        confidence: 0.8,
      });

      const found = await decisionRepo.findByContentHash(contentHash);
      expect(found).toBeDefined();
      expect(found?.contentHash).toBe(contentHash);
      expect(found?.verdict).toBe('allow');
    });

    it('should list decisions with filtering', async () => {
      // Create test decisions
      await decisionRepo.createDecision({
        contentHash: 'hash1',
        verdict: 'block',
      });
      await decisionRepo.createDecision({
        contentHash: 'hash2',
        verdict: 'allow',
      });
      await decisionRepo.createDecision({
        contentHash: 'hash3',
        verdict: 'block',
      });

      // List all decisions
      const allDecisions = await decisionRepo.listDecisions();
      expect(allDecisions.length).toBe(3);

      // Filter by verdict
      const blockedDecisions = await decisionRepo.listDecisions({ verdict: 'block' });
      expect(blockedDecisions.length).toBe(2);

      // Test pagination
      const firstPage = await decisionRepo.listDecisions({ limit: 2, offset: 0 });
      expect(firstPage.length).toBe(2);

      const secondPage = await decisionRepo.listDecisions({ limit: 2, offset: 2 });
      expect(secondPage.length).toBe(1);
    });

    it('should create and retrieve actions', async () => {
      const decision = await decisionRepo.createDecision({
        contentHash: 'action_test',
        verdict: 'block',
      });

      const action = await decisionRepo.createAction({
        decisionId: decision.id,
        actionType: 'delete',
        actionData: { messageId: 12345 },
        success: true,
      });

      expect(action).toBeDefined();
      expect(action.actionType).toBe('delete');
      expect(action.actionData).toEqual({ messageId: 12345 });
      expect(action.success).toBe(true);

      // Get actions for decision
      const actions = await decisionRepo.getActionsByDecisionId(decision.id);
      expect(actions.length).toBe(1);
      expect(actions[0].id).toBe(action.id);
    });

    it('should generate decision statistics', async () => {
      // Create test data
      await decisionRepo.createDecision({
        contentHash: 'stats1',
        verdict: 'block',
        processingTimeMs: 100,
        aiCost: 0.001,
        cacheHit: false,
      });
      await decisionRepo.createDecision({
        contentHash: 'stats2',
        verdict: 'allow',
        processingTimeMs: 200,
        aiCost: 0.002,
        cacheHit: true,
      });
      await decisionRepo.createDecision({
        contentHash: 'stats3',
        verdict: 'block',
        processingTimeMs: 150,
        aiCost: 0.0015,
        cacheHit: false,
      });

      const stats = await decisionRepo.getDecisionStats();

      expect(stats.total).toBe(3);
      expect(stats.byVerdict.block).toBe(2);
      expect(stats.byVerdict.allow).toBe(1);
      expect(stats.avgProcessingTime).toBe(150); // (100 + 200 + 150) / 3
      expect(stats.cacheHitRate).toBe(1 / 3); // 1 cache hit out of 3
      expect(stats.totalCost).toBeCloseTo(0.0045); // 0.001 + 0.002 + 0.0015
    });
  });

  describe('DualWriteAdapter', () => {
    let oldDb: any;
    let newDb: any;
    let adapter: DualWriteAdapter;

    beforeEach(async () => {
      oldDb = await dbManager.getConnection('old');

      // Initialize old database schema
      await oldDb.exec(`
        CREATE TABLE IF NOT EXISTS groups (
          chatId TEXT PRIMARY KEY,
          chatTitle TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          userId TEXT PRIMARY KEY,
          username TEXT,
          firstName TEXT,
          lastName TEXT
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          chatId TEXT NOT NULL,
          userId TEXT NOT NULL,
          logData TEXT NOT NULL
        );
      `);

      // Create a separate database manager for the new database and run migrations on it
      const newDbManager = new DatabaseManager({
        type: 'sqlite',
        database: ':memory:',
      });

      // We need to import and register the migrations manually since this is a separate manager
      const { migration_001_initial_schema } = await import(
        '../src/db/migrations/001_initial_schema.js'
      );
      const { migration_002_decision_tracking } = await import(
        '../src/db/migrations/002_decision_tracking.js'
      );
      const { migration_003_policy_management } = await import(
        '../src/db/migrations/003_policy_management.js'
      );
      const { migration_004_usage_tracking } = await import(
        '../src/db/migrations/004_usage_tracking.js'
      );

      newDbManager.registerMigration(migration_001_initial_schema);
      newDbManager.registerMigration(migration_002_decision_tracking);
      newDbManager.registerMigration(migration_003_policy_management);
      newDbManager.registerMigration(migration_004_usage_tracking);

      // Get the connection and run migrations
      newDb = await newDbManager.getConnection();
      await newDbManager.runMigrations();

      adapter = new DualWriteAdapter(oldDb, newDb);
    });

    it('should update feature flags', async () => {
      const initialFlags = adapter.getFlags();
      expect(initialFlags.enableDualWrite).toBe(false);

      adapter.updateFlags({ enableDualWrite: true, writeToNew: true });

      const updatedFlags = adapter.getFlags();
      expect(updatedFlags.enableDualWrite).toBe(true);
      expect(updatedFlags.writeToNew).toBe(true);
    });

    it('should write to both databases when dual-write enabled', async () => {
      // Create a tenant directly in the new database for FK constraint
      await newDb.run(`INSERT INTO tenants (id, name, status, plan_type) VALUES (?, ?, ?, ?)`, [
        'test-tenant-id',
        'Dual Write Test',
        'active',
        'basic',
      ]);

      adapter.updateFlags({
        enableDualWrite: true,
        writeToOld: true,
        writeToNew: true,
      });

      await adapter.upsertGroup({
        chatId: '12345',
        chatTitle: 'Test Group',
        tenantId: 'test-tenant-id',
      });

      // Check old database
      const oldGroups = await oldDb.query('SELECT * FROM groups WHERE chatId = ?', ['12345']);
      expect(oldGroups.length).toBe(1);
      expect(oldGroups[0].chatTitle).toBe('Test Group');

      // Check new database
      const newGroups = await newDb.query('SELECT * FROM groups WHERE chat_id = ?', ['12345']);
      expect(newGroups.length).toBe(1);
      expect(newGroups[0].chat_title).toBe('Test Group');
    });

    it('should handle errors gracefully in dual-write mode', async () => {
      adapter.updateFlags({
        enableDualWrite: true,
        writeToOld: true,
        writeToNew: true,
      });

      // This should fail because no tenant ID provided for new DB
      await expect(
        adapter.upsertGroup({
          chatId: '99999',
          chatTitle: 'Error Test Group',
        })
      ).rejects.toThrow('Dual-write failed');
    });

    it('should read from new database when enabled', async () => {
      // Create a tenant directly in the new database
      await newDb.run(`INSERT INTO tenants (id, name, status, plan_type) VALUES (?, ?, ?, ?)`, [
        'read-test-tenant-id',
        'Read Test Tenant',
        'active',
        'basic',
      ]);

      // Insert into new database
      await newDb.run(
        `
        INSERT INTO groups (tenant_id, chat_id, chat_title, chat_type)
        VALUES (?, ?, ?, ?)
      `,
        ['read-test-tenant-id', '54321', 'New DB Group', 'supergroup']
      );

      adapter.updateFlags({ readFromNew: true });

      const group = await adapter.getGroup('54321', 'read-test-tenant-id');
      expect(group).toBeDefined();
      expect(group.chatTitle).toBe('New DB Group');
      expect(group.chatType).toBe('supergroup');
    });

    it('should fallback to old database when new read fails', async () => {
      // Insert into old database only
      await oldDb.run(
        `
        INSERT INTO groups (chatId, chatTitle) VALUES (?, ?)
      `,
        ['67890', 'Old DB Group']
      );

      adapter.updateFlags({ readFromNew: true });

      const group = await adapter.getGroup('67890', 'non-existent-tenant');
      expect(group).toBeDefined();
      expect(group.chatTitle).toBe('Old DB Group');
      expect(group.chatType).toBe('group'); // Default for old schema
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures', async () => {
      const badConfig: DatabaseConfig = {
        type: 'postgres',
        connectionString: 'postgresql://invalid:invalid@localhost:5432/invalid',
      };

      const badDbManager = new DatabaseManager(badConfig);

      // The connection will only fail when we try to use it
      const connection = await badDbManager.getConnection();
      await expect(connection.query('SELECT 1')).rejects.toThrow();
    });

    it('should handle migration failures', async () => {
      const connection = await dbManager.getConnection();

      // Register a bad migration
      dbManager.registerMigration({
        id: '999',
        name: 'bad_migration',
        async up() {
          throw new Error('Intentional migration failure');
        },
        async down() {
          // Do nothing
        },
      });

      await expect(dbManager.runMigrations()).rejects.toThrow('Intentional migration failure');
    });

    it('should handle repository errors gracefully', async () => {
      const connection = await dbManager.getConnection();
      const repo = new TenantRepository(connection);

      // Try to find non-existent tenant
      const notFound = await repo.findById('non-existent-id');
      expect(notFound).toBeNull();

      // Try to update non-existent tenant
      const notUpdated = await repo.update('non-existent-id', { name: 'New Name' });
      expect(notUpdated).toBeNull();
    });
  });
});
