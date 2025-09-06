import { EventEmitter } from 'events';
import { DatabaseConnection } from './index.js';
import { TenantRepository } from './repositories/TenantRepository.js';
import { DecisionRepository } from './repositories/DecisionRepository.js';
import winston from 'winston';

// Create logger for dual-write operations
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Feature flags for database operations
 */
export interface DatabaseFeatureFlags {
  enableDualWrite: boolean;
  readFromNew: boolean;
  writeToOld: boolean;
  writeToNew: boolean;
}

/**
 * Dual-write adapter for gradual database migration
 */
export class DualWriteAdapter extends EventEmitter {
  private oldDb: DatabaseConnection;
  private newDb: DatabaseConnection;
  private flags: DatabaseFeatureFlags;
  private tenantRepo: TenantRepository;

  constructor(
    oldDb: DatabaseConnection,
    newDb: DatabaseConnection,
    flags: DatabaseFeatureFlags = {
      enableDualWrite: false,
      readFromNew: false,
      writeToOld: true,
      writeToNew: false
    }
  ) {
    super();
    this.oldDb = oldDb;
    this.newDb = newDb;
    this.flags = flags;
    this.tenantRepo = new TenantRepository(newDb);
  }

  /**
   * Update feature flags at runtime
   */
  updateFlags(flags: Partial<DatabaseFeatureFlags>): void {
    this.flags = { ...this.flags, ...flags };
    this.emit('flags-updated', { flags: this.flags });
    logger.info('Database feature flags updated', { flags: this.flags });
  }

  /**
   * Get current feature flags
   */
  getFlags(): DatabaseFeatureFlags {
    return { ...this.flags };
  }

  /**
   * Write audit log entry with dual-write support
   */
  async writeAuditLog(data: {
    chatId: string;
    userId: string;
    logData: any;
    tenantId?: string;
  }): Promise<void> {
    const errors: Error[] = [];

    // Write to old database (if enabled)
    if (this.flags.writeToOld) {
      try {
        await this.oldDb.run(`
          INSERT INTO audit_log (timestamp, chatId, userId, logData)
          VALUES (datetime('now'), ?, ?, ?)
        `, [data.chatId, data.userId, JSON.stringify(data.logData)]);
        
        this.emit('old-db-write', { table: 'audit_log', success: true });
      } catch (error) {
        errors.push(error as Error);
        this.emit('old-db-write', { table: 'audit_log', success: false, error });
        logger.error('Failed to write to old audit_log', { error, data });
      }
    }

    // Write to new database (if enabled)
    if (this.flags.writeToNew && data.tenantId) {
      try {
        // Create event in new event sourcing table
        await this.newDb.run(`
          INSERT INTO events (tenant_id, event_type, aggregate_id, aggregate_type, event_data, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          data.tenantId,
          'audit_log_entry',
          data.chatId,
          'group',
          JSON.stringify({
            userId: data.userId,
            logData: data.logData,
            timestamp: new Date().toISOString()
          }),
          JSON.stringify({ source: 'dual_write_adapter' })
        ]);
        
        this.emit('new-db-write', { table: 'events', success: true });
      } catch (error) {
        errors.push(error as Error);
        this.emit('new-db-write', { table: 'events', success: false, error });
        logger.error('Failed to write to new events table', { error, data });
      }
    }

    // If dual-write is enabled, both writes should succeed
    if (this.flags.enableDualWrite && errors.length > 0) {
      throw new Error(`Dual-write failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * Create or update group with dual-write support
   */
  async upsertGroup(data: {
    chatId: string;
    chatTitle: string;
    chatType?: string;
    tenantId?: string;
  }): Promise<void> {
    const errors: Error[] = [];

    // Write to old database (if enabled)
    if (this.flags.writeToOld) {
      try {
        // Check if group exists first
        const existing = await this.oldDb.query(`SELECT chatId FROM groups WHERE chatId = ?`, [data.chatId]);
        
        if (existing.length > 0) {
          // Update existing group
          await this.oldDb.run(`UPDATE groups SET chatTitle = ? WHERE chatId = ?`, [data.chatTitle, data.chatId]);
        } else {
          // Insert new group
          await this.oldDb.run(`INSERT INTO groups (chatId, chatTitle) VALUES (?, ?)`, [data.chatId, data.chatTitle]);
        }
        
        this.emit('old-db-write', { table: 'groups', success: true });
      } catch (error) {
        errors.push(error as Error);
        this.emit('old-db-write', { table: 'groups', success: false, error });
        logger.error('Failed to write to old groups table', { error, data });
      }
    }

    // Write to new database (if enabled)
    if (this.flags.writeToNew) {
      if (!data.tenantId) {
        const error = new Error('tenantId is required for new database writes');
        errors.push(error);
        this.emit('new-db-write', { table: 'groups', success: false, error });
        logger.error('Missing tenantId for new database write', { data });
      } else {
        try {
          // Check if group exists
          const existing = await this.newDb.query(`
            SELECT id FROM groups WHERE chat_id = ? AND tenant_id = ?
          `, [data.chatId, data.tenantId]);

          if (existing.length > 0) {
            // Update existing group
            await this.newDb.run(`
              UPDATE groups 
              SET chat_title = ?, chat_type = ?, updated_at = CURRENT_TIMESTAMP
              WHERE chat_id = ? AND tenant_id = ?
            `, [data.chatTitle, data.chatType || 'group', data.chatId, data.tenantId]);
          } else {
            // Create new group
            await this.newDb.run(`
              INSERT INTO groups (tenant_id, chat_id, chat_title, chat_type)
              VALUES (?, ?, ?, ?)
            `, [data.tenantId, data.chatId, data.chatTitle, data.chatType || 'group']);
          }
          
          this.emit('new-db-write', { table: 'groups', success: true });
        } catch (error) {
          errors.push(error as Error);
          this.emit('new-db-write', { table: 'groups', success: false, error });
          logger.error('Failed to write to new groups table', { error, data });
        }
      }
    }

    if (this.flags.enableDualWrite && errors.length > 0) {
      throw new Error(`Dual-write failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * Create or update user with dual-write support
   */
  async upsertUser(data: {
    userId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
    isBot?: boolean;
    tenantId?: string;
  }): Promise<void> {
    const errors: Error[] = [];

    // Write to old database (if enabled)
    if (this.flags.writeToOld) {
      try {
        await this.oldDb.run(`
          INSERT INTO users (userId, username, firstName, lastName)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(userId) DO UPDATE SET
            username = excluded.username,
            firstName = excluded.firstName,
            lastName = excluded.lastName
        `, [data.userId, data.username, data.firstName, data.lastName]);
        
        this.emit('old-db-write', { table: 'users', success: true });
      } catch (error) {
        errors.push(error as Error);
        this.emit('old-db-write', { table: 'users', success: false, error });
        logger.error('Failed to write to old users table', { error, data });
      }
    }

    // Write to new database (if enabled)
    if (this.flags.writeToNew && data.tenantId) {
      try {
        // Check if user exists
        const existing = await this.newDb.query(`
          SELECT id FROM users WHERE user_id = ? AND tenant_id = ?
        `, [data.userId, data.tenantId]);

        if (existing.length > 0) {
          // Update existing user
          await this.newDb.run(`
            UPDATE users 
            SET username = ?, first_name = ?, last_name = ?, 
                language_code = ?, is_bot = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND tenant_id = ?
          `, [
            data.username, data.firstName, data.lastName,
            data.languageCode, data.isBot ? 1 : 0,
            data.userId, data.tenantId
          ]);
        } else {
          // Create new user
          await this.newDb.run(`
            INSERT INTO users (tenant_id, user_id, username, first_name, last_name, language_code, is_bot)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            data.tenantId, data.userId, data.username, data.firstName,
            data.lastName, data.languageCode, data.isBot ? 1 : 0
          ]);
        }
        
        this.emit('new-db-write', { table: 'users', success: true });
      } catch (error) {
        errors.push(error as Error);
        this.emit('new-db-write', { table: 'users', success: false, error });
        logger.error('Failed to write to new users table', { error, data });
      }
    }

    if (this.flags.enableDualWrite && errors.length > 0) {
      throw new Error(`Dual-write failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  /**
   * Record moderation decision with dual-write support
   */
  async recordDecision(data: {
    chatId: string;
    userId?: string;
    messageId?: number;
    contentHash: string;
    verdict: 'allow' | 'block' | 'warn' | 'escalate';
    confidence?: number;
    reasoning?: any;
    processingTimeMs?: number;
    aiModel?: string;
    aiCost?: number;
    cacheHit?: boolean;
    tenantId?: string;
  }): Promise<string | null> {
    const errors: Error[] = [];
    let newDecisionId: string | null = null;

    // Write to new database first (if enabled) to get decision ID
    if (this.flags.writeToNew && data.tenantId) {
      try {
        // Get group and user IDs from new database
        const [groupResult, userResult] = await Promise.all([
          this.newDb.query('SELECT id FROM groups WHERE chat_id = ? AND tenant_id = ?', [data.chatId, data.tenantId]),
          data.userId ? this.newDb.query('SELECT id FROM users WHERE user_id = ? AND tenant_id = ?', [data.userId, data.tenantId]) : Promise.resolve([])
        ]);

        const groupId = groupResult[0]?.id;
        const userId = userResult[0]?.id;

        if (groupId) {
          const decisionRepo = new DecisionRepository(this.newDb, data.tenantId);
          const decision = await decisionRepo.createDecision({
            groupId,
            userId,
            messageId: data.messageId,
            contentHash: data.contentHash,
            verdict: data.verdict,
            confidence: data.confidence,
            reasoning: data.reasoning,
            processingTimeMs: data.processingTimeMs,
            aiModel: data.aiModel,
            aiCost: data.aiCost,
            cacheHit: data.cacheHit
          });
          
          newDecisionId = decision.id;
          this.emit('new-db-write', { table: 'decisions', success: true, decisionId: newDecisionId });
        }
      } catch (error) {
        errors.push(error as Error);
        this.emit('new-db-write', { table: 'decisions', success: false, error });
        logger.error('Failed to write to new decisions table', { error, data });
      }
    }

    // For backwards compatibility, we could write to old audit log
    if (this.flags.writeToOld) {
      try {
        await this.writeAuditLog({
          chatId: data.chatId,
          userId: data.userId || 'system',
          logData: {
            type: 'moderation_decision',
            verdict: data.verdict,
            confidence: data.confidence,
            reasoning: data.reasoning,
            processingTimeMs: data.processingTimeMs,
            aiModel: data.aiModel,
            aiCost: data.aiCost,
            cacheHit: data.cacheHit
          },
          tenantId: data.tenantId
        });
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (this.flags.enableDualWrite && errors.length > 0) {
      throw new Error(`Dual-write failed: ${errors.map(e => e.message).join(', ')}`);
    }

    return newDecisionId;
  }

  /**
   * Get group information with fallback support
   */
  async getGroup(chatId: string, tenantId?: string): Promise<any> {
    // Try new database first if enabled
    if (this.flags.readFromNew && tenantId) {
      try {
        const results = await this.newDb.query(`
          SELECT id, chat_id as chatId, chat_title as chatTitle, chat_type as chatType,
                 member_count as memberCount, is_active as isActive
          FROM groups 
          WHERE chat_id = ? AND tenant_id = ?
        `, [chatId, tenantId]);
        
        if (results.length > 0) {
          this.emit('new-db-read', { table: 'groups', success: true });
          return results[0];
        }
      } catch (error) {
        this.emit('new-db-read', { table: 'groups', success: false, error });
        logger.error('Failed to read from new groups table', { error, chatId, tenantId });
      }
    }

    // Fallback to old database
    try {
      const results = await this.oldDb.query(`
        SELECT chatId, chatTitle
        FROM groups 
        WHERE chatId = ?
      `, [chatId]);
      
      if (results.length > 0) {
        this.emit('old-db-read', { table: 'groups', success: true });
        return {
          chatId: results[0].chatId,
          chatTitle: results[0].chatTitle,
          chatType: 'group', // Default for old schema
          isActive: true
        };
      }
    } catch (error) {
      this.emit('old-db-read', { table: 'groups', success: false, error });
      logger.error('Failed to read from old groups table', { error, chatId });
    }

    return null;
  }

  /**
   * Validate data consistency between old and new databases
   */
  async validateConsistency(options: {
    checkGroups?: boolean;
    checkUsers?: boolean;
    sampleSize?: number;
  } = {}): Promise<{
    groupsConsistent: boolean;
    usersConsistent: boolean;
    inconsistencies: any[];
  }> {
    const { checkGroups = true, checkUsers = true, sampleSize = 100 } = options;
    const inconsistencies: any[] = [];
    let groupsConsistent = true;
    let usersConsistent = true;

    if (checkGroups) {
      try {
        // Sample groups from old database
        const oldGroups = await this.oldDb.query(`
          SELECT chatId, chatTitle FROM groups LIMIT ?
        `, [sampleSize]);

        for (const oldGroup of oldGroups) {
          // Check if exists in new database (need tenant context)
          const newGroups = await this.newDb.query(`
            SELECT chat_id, chat_title FROM groups WHERE chat_id = ?
          `, [oldGroup.chatId]);

          if (newGroups.length === 0) {
            inconsistencies.push({
              type: 'missing_group',
              chatId: oldGroup.chatId,
              oldData: oldGroup
            });
            groupsConsistent = false;
          } else if (newGroups[0].chat_title !== oldGroup.chatTitle) {
            inconsistencies.push({
              type: 'group_title_mismatch',
              chatId: oldGroup.chatId,
              oldTitle: oldGroup.chatTitle,
              newTitle: newGroups[0].chat_title
            });
            groupsConsistent = false;
          }
        }
      } catch (error) {
        logger.error('Failed to validate group consistency', { error });
        groupsConsistent = false;
      }
    }

    if (checkUsers) {
      try {
        // Sample users from old database
        const oldUsers = await this.oldDb.query(`
          SELECT userId, username, firstName, lastName FROM users LIMIT ?
        `, [sampleSize]);

        for (const oldUser of oldUsers) {
          // Check if exists in new database
          const newUsers = await this.newDb.query(`
            SELECT user_id, username, first_name, last_name FROM users WHERE user_id = ?
          `, [oldUser.userId]);

          if (newUsers.length === 0) {
            inconsistencies.push({
              type: 'missing_user',
              userId: oldUser.userId,
              oldData: oldUser
            });
            usersConsistent = false;
          } else {
            const newUser = newUsers[0];
            if (newUser.username !== oldUser.username ||
                newUser.first_name !== oldUser.firstName ||
                newUser.last_name !== oldUser.lastName) {
              inconsistencies.push({
                type: 'user_data_mismatch',
                userId: oldUser.userId,
                oldData: oldUser,
                newData: newUser
              });
              usersConsistent = false;
            }
          }
        }
      } catch (error) {
        logger.error('Failed to validate user consistency', { error });
        usersConsistent = false;
      }
    }

    this.emit('consistency-check', {
      groupsConsistent,
      usersConsistent,
      inconsistencyCount: inconsistencies.length
    });

    return {
      groupsConsistent,
      usersConsistent,
      inconsistencies
    };
  }
}
