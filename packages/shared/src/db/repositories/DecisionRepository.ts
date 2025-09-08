import { BaseRepository, DatabaseConnection } from '../index.js';

export interface Decision {
  id: string;
  tenantId: string;
  groupId?: string;
  userId?: string;
  messageId?: number;
  contentHash: string;
  verdict: 'allow' | 'block' | 'warn' | 'escalate';
  confidence?: number;
  reasoning?: any;
  processingTimeMs?: number;
  aiModel?: string;
  aiCost?: number;
  cacheHit: boolean;
  createdAt: string;
}

export interface Action {
  id: string;
  decisionId: string;
  actionType: 'delete' | 'warn' | 'ban' | 'restrict' | 'none';
  actionData: any;
  executedAt: string;
  success: boolean;
  errorMessage?: string;
}

export interface CreateDecisionInput {
  groupId?: string;
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
}

export interface CreateActionInput {
  decisionId: string;
  actionType: 'delete' | 'warn' | 'ban' | 'restrict' | 'none';
  actionData?: any;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Repository for decision and action tracking
 */
export class DecisionRepository extends BaseRepository {
  constructor(db: DatabaseConnection, tenantId: string) {
    super(db, tenantId);
  }

  /**
   * Create a new decision
   */
  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    this.validateTenantAccess();

    const {
      groupId,
      userId,
      messageId,
      contentHash,
      verdict,
      confidence,
      reasoning,
      processingTimeMs,
      aiModel,
      aiCost,
      cacheHit = false,
    } = input;

    // Generate a UUID for the decision
    const decisionId = require('crypto').randomUUID();

    await this.run(
      `
      INSERT INTO decisions (
        id, tenant_id, group_id, user_id, message_id, content_hash, verdict,
        confidence, reasoning, processing_time_ms, ai_model, ai_cost, cache_hit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        decisionId,
        this.tenantId,
        groupId || null,
        userId || null,
        messageId || null,
        contentHash,
        verdict,
        confidence || null,
        reasoning ? JSON.stringify(reasoning) : null,
        processingTimeMs || null,
        aiModel || null,
        aiCost || null,
        cacheHit ? 1 : 0,
      ]
    );

    const decision = await this.getDecisionById(decisionId);
    if (!decision) {
      throw new Error('Failed to create decision');
    }

    this.emit('decision-created', { decision });
    return decision;
  }

  /**
   * Get decision by ID
   */
  async getDecisionById(id: string): Promise<Decision | null> {
    this.validateTenantAccess();

    const results = await this.query<Decision>(
      `
      SELECT 
        id, tenant_id as tenantId, group_id as groupId, user_id as userId,
        message_id as messageId, content_hash as contentHash, verdict,
        confidence, reasoning, processing_time_ms as processingTimeMs,
        ai_model as aiModel, ai_cost as aiCost, cache_hit as cacheHit,
        created_at as createdAt
      FROM decisions 
      WHERE id = ? AND tenant_id = ?
    `,
      [id, this.tenantId]
    );

    const decision = results[0];
    if (decision) {
      // Parse JSON fields
      if (decision.reasoning) {
        try {
          decision.reasoning = JSON.parse(decision.reasoning as string);
        } catch {
          // Keep as string if parsing fails
        }
      }
      decision.cacheHit = Boolean(decision.cacheHit);
    }

    return decision || null;
  }

  /**
   * Find decision by content hash (for cache lookup)
   */
  async findByContentHash(contentHash: string, maxAgeHours: number = 24): Promise<Decision | null> {
    this.validateTenantAccess();

    const results = await this.query<Decision>(
      `
      SELECT 
        id, tenant_id as tenantId, group_id as groupId, user_id as userId,
        message_id as messageId, content_hash as contentHash, verdict,
        confidence, reasoning, processing_time_ms as processingTimeMs,
        ai_model as aiModel, ai_cost as aiCost, cache_hit as cacheHit,
        created_at as createdAt
      FROM decisions 
      WHERE content_hash = ? AND tenant_id = ?
        AND created_at > datetime('now', '-${maxAgeHours} hours')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [contentHash, this.tenantId]
    );

    const decision = results[0];
    if (decision) {
      if (decision.reasoning) {
        try {
          decision.reasoning = JSON.parse(decision.reasoning as string);
        } catch {
          // Keep as string if parsing fails
        }
      }
      decision.cacheHit = Boolean(decision.cacheHit);
    }

    return decision || null;
  }

  /**
   * List decisions with filtering
   */
  async listDecisions(
    options: {
      groupId?: string;
      userId?: string;
      verdict?: string;
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<Decision[]> {
    this.validateTenantAccess();

    const { groupId, userId, verdict, limit = 100, offset = 0, startDate, endDate } = options;

    let sql = `
      SELECT 
        id, tenant_id as tenantId, group_id as groupId, user_id as userId,
        message_id as messageId, content_hash as contentHash, verdict,
        confidence, reasoning, processing_time_ms as processingTimeMs,
        ai_model as aiModel, ai_cost as aiCost, cache_hit as cacheHit,
        created_at as createdAt
      FROM decisions
      WHERE tenant_id = ?
    `;
    const params: any[] = [this.tenantId];

    if (groupId) {
      sql += ' AND group_id = ?';
      params.push(groupId);
    }

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    if (verdict) {
      sql += ' AND verdict = ?';
      params.push(verdict);
    }

    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const decisions = await this.query<Decision>(sql, params);

    // Parse JSON fields
    return decisions.map(decision => {
      if (decision.reasoning) {
        try {
          decision.reasoning = JSON.parse(decision.reasoning as string);
        } catch {
          // Keep as string if parsing fails
        }
      }
      decision.cacheHit = Boolean(decision.cacheHit);
      return decision;
    });
  }

  /**
   * Create an action for a decision
   */
  async createAction(input: CreateActionInput): Promise<Action> {
    const { decisionId, actionType, actionData = {}, success = false, errorMessage } = input;

    // Generate a UUID for the action
    const actionId = require('crypto').randomUUID();

    await this.run(
      `
      INSERT INTO actions (id, decision_id, action_type, action_data, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        actionId,
        decisionId,
        actionType,
        JSON.stringify(actionData),
        success ? 1 : 0,
        errorMessage || null,
      ]
    );

    const action = await this.getActionById(actionId);
    if (!action) {
      throw new Error('Failed to create action');
    }

    this.emit('action-created', { action });
    return action;
  }

  /**
   * Get action by ID
   */
  async getActionById(id: string): Promise<Action | null> {
    const results = await this.query<Action>(
      `
      SELECT 
        id, decision_id as decisionId, action_type as actionType,
        action_data as actionData, executed_at as executedAt,
        success, error_message as errorMessage
      FROM actions 
      WHERE id = ?
    `,
      [id]
    );

    const action = results[0];
    if (action) {
      try {
        action.actionData = JSON.parse(action.actionData as string);
      } catch {
        action.actionData = {};
      }
      action.success = Boolean(action.success);
    }

    return action || null;
  }

  /**
   * Get actions for a decision
   */
  async getActionsByDecisionId(decisionId: string): Promise<Action[]> {
    const actions = await this.query<Action>(
      `
      SELECT 
        id, decision_id as decisionId, action_type as actionType,
        action_data as actionData, executed_at as executedAt,
        success, error_message as errorMessage
      FROM actions 
      WHERE decision_id = ?
      ORDER BY executed_at ASC
    `,
      [decisionId]
    );

    return actions.map(action => {
      try {
        action.actionData = JSON.parse(action.actionData as string);
      } catch {
        action.actionData = {};
      }
      action.success = Boolean(action.success);
      return action;
    });
  }

  /**
   * Get decision statistics
   */
  async getDecisionStats(
    options: {
      groupId?: string;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<{
    total: number;
    byVerdict: Record<string, number>;
    avgProcessingTime: number;
    cacheHitRate: number;
    totalCost: number;
  }> {
    this.validateTenantAccess();

    const { groupId, startDate, endDate } = options;

    let whereClause = 'WHERE tenant_id = ?';
    const params: any[] = [this.tenantId];

    if (groupId) {
      whereClause += ' AND group_id = ?';
      params.push(groupId);
    }

    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    // Get overall stats
    const [totalResult, verdictResult, avgTimeResult, cacheResult, costResult] = await Promise.all([
      this.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM decisions ${whereClause}`,
        params
      ),
      this.query<{ verdict: string; count: number }>(
        `SELECT verdict, COUNT(*) as count FROM decisions ${whereClause} GROUP BY verdict`,
        params
      ),
      this.query<{ avg_time: number }>(
        `SELECT AVG(processing_time_ms) as avg_time FROM decisions ${whereClause} AND processing_time_ms IS NOT NULL`,
        params
      ),
      this.query<{ cache_hits: number; total: number }>(
        `SELECT SUM(cache_hit) as cache_hits, COUNT(*) as total FROM decisions ${whereClause}`,
        params
      ),
      this.query<{ total_cost: number }>(
        `SELECT SUM(ai_cost) as total_cost FROM decisions ${whereClause} AND ai_cost IS NOT NULL`,
        params
      ),
    ]);

    const byVerdict: Record<string, number> = {};
    for (const row of verdictResult) {
      byVerdict[row.verdict] = row.count;
    }

    const cacheStats = cacheResult[0];
    const cacheHitRate =
      cacheStats?.total > 0 ? (cacheStats.cache_hits || 0) / cacheStats.total : 0;

    return {
      total: totalResult[0]?.count || 0,
      byVerdict,
      avgProcessingTime: avgTimeResult[0]?.avg_time || 0,
      cacheHitRate,
      totalCost: costResult[0]?.total_cost || 0,
    };
  }
}
