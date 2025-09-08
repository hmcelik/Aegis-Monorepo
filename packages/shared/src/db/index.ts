import { EventEmitter } from 'events';
import winston from 'winston';

// Create a simple logger for the database module
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Database connection interface for abstraction
 */
export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Migration definition interface
 */
export interface Migration {
  id: string;
  name: string;
  up: (db: DatabaseConnection) => Promise<void>;
  down: (db: DatabaseConnection) => Promise<void>;
  dependencies?: string[];
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  poolSize?: number;
  timeoutMs?: number;
}

/**
 * Repository base class for database operations
 */
export abstract class BaseRepository extends EventEmitter {
  protected db: DatabaseConnection;
  protected tenantId?: string;

  constructor(db: DatabaseConnection, tenantId?: string) {
    super();
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Execute a query with tenant isolation
   */
  protected async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const result = await this.db.query(sql, params);
      this.emit('query', { sql, params, resultCount: result.length });
      return result as T[];
    } catch (error) {
      this.emit('error', { sql, params, error });
      logger.error('Database query failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a command (INSERT, UPDATE, DELETE)
   */
  protected async run(
    sql: string,
    params: any[] = []
  ): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    try {
      const result = await this.db.run(sql, params);
      this.emit('command', { sql, params, changes: result.changes });
      return result;
    } catch (error) {
      this.emit('error', { sql, params, error });
      logger.error('Database command failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute raw SQL
   */
  protected async exec(sql: string): Promise<void> {
    try {
      await this.db.exec(sql);
      this.emit('exec', { sql });
    } catch (error) {
      this.emit('error', { sql, error });
      logger.error('Database exec failed', { sql, error });
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  protected async beginTransaction(): Promise<void> {
    await this.db.begin();
    this.emit('transaction', { action: 'begin' });
  }

  /**
   * Commit a transaction
   */
  protected async commitTransaction(): Promise<void> {
    await this.db.commit();
    this.emit('transaction', { action: 'commit' });
  }

  /**
   * Rollback a transaction
   */
  protected async rollbackTransaction(): Promise<void> {
    await this.db.rollback();
    this.emit('transaction', { action: 'rollback' });
  }

  /**
   * Execute operations within a transaction
   */
  protected async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await operation();
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Add tenant filtering to WHERE clause
   */
  protected addTenantFilter(baseWhere: string = ''): string {
    if (!this.tenantId) {
      return baseWhere;
    }

    const tenantFilter = `tenant_id = '${this.tenantId}'`;

    if (!baseWhere.trim()) {
      return `WHERE ${tenantFilter}`;
    }

    if (baseWhere.trim().toUpperCase().startsWith('WHERE')) {
      return `${baseWhere} AND ${tenantFilter}`;
    }

    return `WHERE ${tenantFilter} AND (${baseWhere})`;
  }

  /**
   * Validate tenant access
   */
  protected validateTenantAccess(): void {
    if (!this.tenantId) {
      throw new Error('Tenant ID required for this operation');
    }
  }
}

/**
 * Database manager for connection lifecycle and migrations
 */
export class DatabaseManager extends EventEmitter {
  private connections: Map<string, DatabaseConnection> = new Map();
  private migrations: Map<string, Migration> = new Map();
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    super();
    this.config = config;
  }

  /**
   * Get a database connection
   */
  async getConnection(name: string = 'default'): Promise<DatabaseConnection> {
    if (!this.connections.has(name)) {
      const connection = await this.createConnection();
      this.connections.set(name, connection);
      this.emit('connection-created', { name, type: this.config.type });
    }

    return this.connections.get(name)!;
  }

  /**
   * Register a migration
   */
  registerMigration(migration: Migration): void {
    this.migrations.set(migration.id, migration);
    logger.info('Migration registered', {
      id: migration.id,
      name: migration.name,
      dependencies: migration.dependencies,
    });
  }

  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<void> {
    const connection = await this.getConnection();

    // Ensure migrations table exists
    await this.ensureMigrationsTable(connection);

    // Get completed migrations
    const completed = await this.getCompletedMigrations(connection);
    const completedIds = new Set(completed.map(m => m.id));

    // Find pending migrations
    const pending = Array.from(this.migrations.values())
      .filter(m => !completedIds.has(m.id))
      .sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID for deterministic order

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info('Running migrations', { count: pending.length });

    for (const migration of pending) {
      await this.runSingleMigration(connection, migration);
    }

    this.emit('migrations-completed', { count: pending.length });
  }

  /**
   * Create a database connection based on configuration
   */
  private async createConnection(): Promise<DatabaseConnection> {
    if (this.config.type === 'sqlite') {
      return this.createSQLiteConnection();
    } else if (this.config.type === 'postgres') {
      return this.createPostgresConnection();
    } else {
      throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  /**
   * Create SQLite connection wrapper
   */
  private async createSQLiteConnection(): Promise<DatabaseConnection> {
    const sqlite3 = await import('sqlite3');
    const { open } = await import('sqlite');

    const db = await open({
      filename: this.config.database || ':memory:',
      driver: sqlite3.Database,
    });

    // Enable WAL mode for better concurrency
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA foreign_keys = ON;');

    return {
      async query(sql: string, params: any[] = []): Promise<any[]> {
        return db.all(sql, params);
      },

      async run(
        sql: string,
        params: any[] = []
      ): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
        const result = await db.run(sql, params);
        return {
          changes: result.changes || 0,
          lastInsertRowid: result.lastID,
        };
      },

      async exec(sql: string): Promise<void> {
        await db.exec(sql);
      },

      async close(): Promise<void> {
        await db.close();
      },

      async begin(): Promise<void> {
        await db.exec('BEGIN TRANSACTION;');
      },

      async commit(): Promise<void> {
        await db.exec('COMMIT;');
      },

      async rollback(): Promise<void> {
        await db.exec('ROLLBACK;');
      },
    };
  }

  /**
   * Create Postgres connection wrapper
   */
  private async createPostgresConnection(): Promise<DatabaseConnection> {
    const { Pool } = await import('pg');

    const pool = new Pool({
      connectionString: this.config.connectionString,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      max: this.config.poolSize || 10,
      connectionTimeoutMillis: this.config.timeoutMs || 30000,
    });

    let currentClient: any = null;

    return {
      async query(sql: string, params: any[] = []): Promise<any[]> {
        const client = currentClient || pool;
        const result = await client.query(sql, params);
        return result.rows;
      },

      async run(
        sql: string,
        params: any[] = []
      ): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
        const client = currentClient || pool;
        const result = await client.query(sql, params);
        return {
          changes: result.rowCount || 0,
          lastInsertRowid: result.rows[0]?.id,
        };
      },

      async exec(sql: string): Promise<void> {
        const client = currentClient || pool;
        await client.query(sql);
      },

      async close(): Promise<void> {
        await pool.end();
      },

      async begin(): Promise<void> {
        if (!currentClient) {
          currentClient = await pool.connect();
        }
        await currentClient.query('BEGIN');
      },

      async commit(): Promise<void> {
        if (currentClient) {
          await currentClient.query('COMMIT');
          currentClient.release();
          currentClient = null;
        }
      },

      async rollback(): Promise<void> {
        if (currentClient) {
          await currentClient.query('ROLLBACK');
          currentClient.release();
          currentClient = null;
        }
      },
    };
  }

  /**
   * Ensure migrations tracking table exists
   */
  private async ensureMigrationsTable(connection: DatabaseConnection): Promise<void> {
    const sql =
      this.config.type === 'postgres'
        ? `CREATE TABLE IF NOT EXISTS schema_migrations (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
        : `CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`;

    await connection.exec(sql);
  }

  /**
   * Get list of completed migrations
   */
  private async getCompletedMigrations(
    connection: DatabaseConnection
  ): Promise<{ id: string; name: string; applied_at: string }[]> {
    try {
      return await connection.query(
        'SELECT id, name, applied_at FROM schema_migrations ORDER BY applied_at'
      );
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Run a single migration
   */
  private async runSingleMigration(
    connection: DatabaseConnection,
    migration: Migration
  ): Promise<void> {
    logger.info('Running migration', { id: migration.id, name: migration.name });

    await connection.begin();
    try {
      // Run the migration
      await migration.up(connection);

      // Record completion
      await connection.run('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [
        migration.id,
        migration.name,
      ]);

      await connection.commit();

      logger.info('Migration completed', { id: migration.id, name: migration.name });
      this.emit('migration-completed', { id: migration.id, name: migration.name });
    } catch (error) {
      await connection.rollback();
      logger.error('Migration failed', { id: migration.id, name: migration.name, error });
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    for (const [name, connection] of this.connections) {
      try {
        await connection.close();
        this.emit('connection-closed', { name });
      } catch (error) {
        logger.error('Failed to close connection', { name, error });
      }
    }
    this.connections.clear();
  }
}
