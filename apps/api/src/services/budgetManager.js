import { getDb } from '@telegram-moderator/shared/src/services/database.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';

/**
 * BudgetManager handles tenant AI budget caps and spend tracking
 *
 * Features:
 * - Monthly budget limits per tenant
 * - Real-time spend tracking
 * - Configurable degrade modes when budget exhausted
 * - Usage analytics and reporting
 */
class BudgetManager {
  constructor() {
    this.db = getDb();
    this.initializeTables();
  }

  /**
   * Initialize database tables for budget tracking
   */
  async initializeTables() {
    try {
      // Budget settings table
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS tenant_budgets (
          tenant_id TEXT PRIMARY KEY,
          monthly_limit REAL NOT NULL DEFAULT 100.0,
          degrade_mode TEXT NOT NULL DEFAULT 'strict_rules',
          reset_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Usage tracking table
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          tokens INTEGER NOT NULL,
          cost REAL NOT NULL,
          model TEXT NOT NULL,
          operation TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenant_budgets (tenant_id)
        )
      `);

      // Index for performance
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_timestamp 
        ON ai_usage (tenant_id, timestamp)
      `);

      logger.info('BudgetManager: Database tables initialized');
    } catch (error) {
      logger.error('BudgetManager: Failed to initialize tables', { error: error.message });
      throw error;
    }
  }

  /**
   * Get budget settings for a tenant
   */
  async getBudget(tenantId) {
    try {
      let budget = await this.db.get(
        `
        SELECT * FROM tenant_budgets WHERE tenant_id = ?
      `,
        [tenantId]
      );

      // Create default budget if none exists
      if (!budget) {
        budget = await this.createDefaultBudget(tenantId);
      }

      // Check if we need to reset for new month
      const resetDate = new Date(budget.reset_date);
      const now = new Date();

      if (now >= resetDate) {
        budget = await this.resetMonthlyBudget(tenantId);
      }

      return {
        tenantId: budget.tenant_id,
        monthlyLimit: budget.monthly_limit,
        degradeMode: budget.degrade_mode,
        resetDate: budget.reset_date,
        createdAt: budget.created_at,
        updatedAt: budget.updated_at,
      };
    } catch (error) {
      logger.error('BudgetManager: Failed to get budget', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Update budget settings for a tenant
   */
  async updateBudget(tenantId, updates) {
    try {
      const { monthlyLimit, degradeMode } = updates;

      await this.db.run(
        `
        UPDATE tenant_budgets 
        SET monthly_limit = ?, 
            degrade_mode = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `,
        [monthlyLimit, degradeMode, tenantId]
      );

      logger.info('BudgetManager: Budget updated', {
        tenantId,
        monthlyLimit,
        degradeMode,
      });

      return await this.getBudget(tenantId);
    } catch (error) {
      logger.error('BudgetManager: Failed to update budget', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Record AI usage for a tenant
   */
  async recordUsage(tenantId, usage) {
    try {
      const { tokens, cost, model, operation, timestamp } = usage;

      const result = await this.db.run(
        `
        INSERT INTO ai_usage (tenant_id, tokens, cost, model, operation, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [tenantId, tokens, cost, model, operation, timestamp || new Date()]
      );

      logger.debug('BudgetManager: Usage recorded', {
        tenantId,
        tokens,
        cost,
        model,
        operation,
      });

      return {
        id: result.lastID,
        tenantId,
        tokens,
        cost,
        model,
        operation,
        timestamp,
      };
    } catch (error) {
      logger.error('BudgetManager: Failed to record usage', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Get current month usage for a tenant
   */
  async getCurrentUsage(tenantId) {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usage = await this.db.get(
        `
        SELECT 
          COUNT(*) as api_calls,
          SUM(tokens) as total_tokens,
          SUM(cost) as total_spent,
          AVG(cost) as avg_cost_per_call
        FROM ai_usage 
        WHERE tenant_id = ? 
        AND timestamp >= ?
      `,
        [tenantId, startOfMonth.toISOString()]
      );

      return {
        apiCalls: usage.api_calls || 0,
        tokenCount: usage.total_tokens || 0,
        totalSpent: usage.total_spent || 0,
        avgCostPerCall: usage.avg_cost_per_call || 0,
      };
    } catch (error) {
      logger.error('BudgetManager: Failed to get current usage', {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if tenant budget is exhausted
   */
  async isBudgetExhausted(tenantId) {
    try {
      const budget = await this.getBudget(tenantId);
      const usage = await this.getCurrentUsage(tenantId);

      return usage.totalSpent >= budget.monthlyLimit;
    } catch (error) {
      logger.error('BudgetManager: Failed to check budget status', {
        tenantId,
        error: error.message,
      });
      return false; // Default to allowing operations on error
    }
  }

  /**
   * Get usage history for a tenant
   */
  async getUsageHistory(tenantId, options = {}) {
    try {
      const { startDate, endDate, limit = 100 } = options;

      const history = await this.db.all(
        `
        SELECT * FROM ai_usage 
        WHERE tenant_id = ? 
        AND timestamp >= ? 
        AND timestamp <= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
        [tenantId, startDate.toISOString(), endDate.toISOString(), limit]
      );

      return history.map(record => ({
        id: record.id,
        tenantId: record.tenant_id,
        tokens: record.tokens,
        cost: record.cost,
        model: record.model,
        operation: record.operation,
        timestamp: record.timestamp,
      }));
    } catch (error) {
      logger.error('BudgetManager: Failed to get usage history', {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get analytics for dashboard
   */
  async getAnalytics(tenantId, period = '30d') {
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Daily usage breakdown
      const dailyUsage = await this.db.all(
        `
        SELECT 
          DATE(timestamp) as date,
          SUM(cost) as daily_spent,
          SUM(tokens) as daily_tokens,
          COUNT(*) as daily_calls
        FROM ai_usage 
        WHERE tenant_id = ? 
        AND timestamp >= ?
        GROUP BY DATE(timestamp)
        ORDER BY date
      `,
        [tenantId, startDate.toISOString()]
      );

      // Model usage breakdown
      const modelUsage = await this.db.all(
        `
        SELECT 
          model,
          SUM(cost) as total_cost,
          SUM(tokens) as total_tokens,
          COUNT(*) as call_count
        FROM ai_usage 
        WHERE tenant_id = ? 
        AND timestamp >= ?
        GROUP BY model
        ORDER BY total_cost DESC
      `,
        [tenantId, startDate.toISOString()]
      );

      // Operation type breakdown
      const operationUsage = await this.db.all(
        `
        SELECT 
          operation,
          SUM(cost) as total_cost,
          SUM(tokens) as total_tokens,
          COUNT(*) as call_count
        FROM ai_usage 
        WHERE tenant_id = ? 
        AND timestamp >= ?
        GROUP BY operation
        ORDER BY total_cost DESC
      `,
        [tenantId, startDate.toISOString()]
      );

      return {
        period,
        dailyUsage: dailyUsage.map(day => ({
          date: day.date,
          spent: day.daily_spent || 0,
          tokens: day.daily_tokens || 0,
          calls: day.daily_calls || 0,
        })),
        modelBreakdown: modelUsage.map(model => ({
          model: model.model,
          cost: model.total_cost || 0,
          tokens: model.total_tokens || 0,
          calls: model.call_count || 0,
        })),
        operationBreakdown: operationUsage.map(op => ({
          operation: op.operation,
          cost: op.total_cost || 0,
          tokens: op.total_tokens || 0,
          calls: op.call_count || 0,
        })),
      };
    } catch (error) {
      logger.error('BudgetManager: Failed to get analytics', { tenantId, error: error.message });
      throw error;
    }
  }

  /**
   * Create default budget for new tenant
   */
  async createDefaultBudget(tenantId) {
    try {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);

      await this.db.run(
        `
        INSERT INTO tenant_budgets (tenant_id, monthly_limit, degrade_mode, reset_date)
        VALUES (?, ?, ?, ?)
      `,
        [tenantId, 100.0, 'strict_rules', nextMonth.toISOString()]
      );

      logger.info('BudgetManager: Created default budget', { tenantId });

      return await this.getBudget(tenantId);
    } catch (error) {
      logger.error('BudgetManager: Failed to create default budget', {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reset monthly budget at month rollover
   */
  async resetMonthlyBudget(tenantId) {
    try {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);

      await this.db.run(
        `
        UPDATE tenant_budgets 
        SET reset_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `,
        [nextMonth.toISOString(), tenantId]
      );

      logger.info('BudgetManager: Reset monthly budget', { tenantId, nextResetDate: nextMonth });

      return await this.getBudget(tenantId);
    } catch (error) {
      logger.error('BudgetManager: Failed to reset monthly budget', {
        tenantId,
        error: error.message,
      });
      throw error;
    }
  }
}

export { BudgetManager };
