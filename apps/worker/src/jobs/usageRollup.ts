import { logger } from '@telegram-moderator/shared/src/services/logger';

export interface RollupMetrics {
  tenantId: string;
  date: string;
  messagesProcessed: number;
  aiCallsMade: number;
  aiCost: number;
  cacheHits: number;
  cacheMisses: number;
  avgProcessingTimeMs: number;
}

export class UsageRollupService {
  private db: any; // Using any for now to match the database service API

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Performs daily usage rollup for all tenants
   * Idempotent by (tenant_id, date) - safe to rerun
   */
  async performDailyRollup(targetDate?: Date): Promise<void> {
    const rollupDate = targetDate || new Date();
    // Use previous day for rollup (allow time for late data)
    rollupDate.setDate(rollupDate.getDate() - 1);
    const dateStr = rollupDate.toISOString().split('T')[0]; // YYYY-MM-DD

    logger.info('Starting daily usage rollup', {
      date: dateStr,
      timestamp: new Date().toISOString(),
    });

    try {
      const tenants = await this.getTenants();
      let processedTenants = 0;
      let skippedTenants = 0;

      for (const tenant of tenants) {
        try {
          const metrics = await this.calculateDailyMetrics(tenant.id, dateStr);
          if (metrics) {
            await this.upsertDailyRollup(metrics);
            processedTenants++;
            logger.debug('Processed rollup for tenant', {
              tenantId: tenant.id,
              date: dateStr,
              metrics,
            });
          } else {
            skippedTenants++;
          }
        } catch (error) {
          logger.error('Failed to process rollup for tenant', {
            tenantId: tenant.id,
            date: dateStr,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Daily usage rollup completed', {
        date: dateStr,
        processedTenants,
        skippedTenants,
        totalTenants: tenants.length,
      });
    } catch (error) {
      logger.error('Daily usage rollup failed', {
        date: dateStr,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all active tenants
   */
  private async getTenants(): Promise<Array<{ id: string }>> {
    const query = 'SELECT id FROM tenants WHERE is_active = 1';
    const rows = await this.db.all(query);
    return rows;
  }

  /**
   * Calculate daily metrics for a specific tenant and date
   */
  private async calculateDailyMetrics(
    tenantId: string,
    date: string
  ): Promise<RollupMetrics | null> {
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    // Check if we have any data for this tenant on this date
    const hasDataQuery = `
      SELECT COUNT(*) as count 
      FROM usage_metrics 
      WHERE tenant_id = ? 
        AND period_start >= ? 
        AND period_end <= ?
    `;

    const hasData = await this.db.get(hasDataQuery, [tenantId, startOfDay, endOfDay]);
    if (!hasData || hasData.count === 0) {
      return null; // No data to rollup
    }

    // Aggregate metrics for the day
    const metricsQuery = `
      SELECT 
        tenant_id,
        SUM(CASE WHEN metric_type = 'messages_processed' THEN metric_value ELSE 0 END) as messages_processed,
        SUM(CASE WHEN metric_type = 'ai_calls' THEN metric_value ELSE 0 END) as ai_calls_made,
        SUM(CASE WHEN metric_type = 'ai_cost' THEN cost ELSE 0 END) as ai_cost,
        SUM(CASE WHEN metric_type = 'cache_hits' THEN metric_value ELSE 0 END) as cache_hits,
        SUM(CASE WHEN metric_type = 'cache_misses' THEN metric_value ELSE 0 END) as cache_misses,
        AVG(CASE WHEN metric_type = 'processing_time' THEN metric_value ELSE NULL END) as avg_processing_time_ms
      FROM usage_metrics 
      WHERE tenant_id = ? 
        AND period_start >= ? 
        AND period_end <= ?
      GROUP BY tenant_id
    `;

    const result = await this.db.get(metricsQuery, [tenantId, startOfDay, endOfDay]);

    if (!result) {
      return null;
    }

    return {
      tenantId,
      date,
      messagesProcessed: result.messages_processed || 0,
      aiCallsMade: result.ai_calls_made || 0,
      aiCost: result.ai_cost || 0,
      cacheHits: result.cache_hits || 0,
      cacheMisses: result.cache_misses || 0,
      avgProcessingTimeMs: result.avg_processing_time_ms || 0,
    };
  }

  /**
   * Insert or update daily rollup (idempotent)
   */
  private async upsertDailyRollup(metrics: RollupMetrics): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO daily_usage_rollups (
        tenant_id,
        usage_date,
        messages_processed,
        ai_calls_made,
        ai_cost,
        cache_hits,
        cache_misses,
        avg_processing_time_ms,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await this.db.run(query, [
      metrics.tenantId,
      metrics.date,
      metrics.messagesProcessed,
      metrics.aiCallsMade,
      metrics.aiCost,
      metrics.cacheHits,
      metrics.cacheMisses,
      metrics.avgProcessingTimeMs,
    ]);

    logger.debug('Upserted daily rollup', { metrics });
  }

  /**
   * Get daily rollup data for analytics dashboard
   */
  async getDailyRollups(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<RollupMetrics[]> {
    const query = `
      SELECT 
        tenant_id as tenantId,
        usage_date as date,
        messages_processed as messagesProcessed,
        ai_calls_made as aiCallsMade,
        ai_cost as aiCost,
        cache_hits as cacheHits,
        cache_misses as cacheMisses,
        avg_processing_time_ms as avgProcessingTimeMs
      FROM daily_usage_rollups 
      WHERE tenant_id = ? 
        AND usage_date >= ? 
        AND usage_date <= ?
      ORDER BY usage_date DESC
    `;

    const rows = await this.db.all(query, [tenantId, startDate, endDate]);
    return rows;
  }

  /**
   * Get aggregated metrics for a tenant over a period
   */
  async getAggregatedMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    totalMessages: number;
    totalAICalls: number;
    totalCost: number;
    cacheHitRate: number;
    avgProcessingTime: number;
  }> {
    const query = `
      SELECT 
        SUM(messages_processed) as total_messages,
        SUM(ai_calls_made) as total_ai_calls,
        SUM(ai_cost) as total_cost,
        SUM(cache_hits) as total_cache_hits,
        SUM(cache_misses) as total_cache_misses,
        AVG(avg_processing_time_ms) as avg_processing_time
      FROM daily_usage_rollups 
      WHERE tenant_id = ? 
        AND usage_date >= ? 
        AND usage_date <= ?
    `;

    const result = await this.db.get(query, [tenantId, startDate, endDate]);

    if (!result) {
      return {
        totalMessages: 0,
        totalAICalls: 0,
        totalCost: 0,
        cacheHitRate: 0,
        avgProcessingTime: 0,
      };
    }

    const totalCacheRequests = (result.total_cache_hits || 0) + (result.total_cache_misses || 0);
    const cacheHitRate =
      totalCacheRequests > 0 ? (result.total_cache_hits || 0) / totalCacheRequests : 0;

    return {
      totalMessages: result.total_messages || 0,
      totalAICalls: result.total_ai_calls || 0,
      totalCost: result.total_cost || 0,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100, // Round to 2 decimal places
      avgProcessingTime: result.avg_processing_time || 0,
    };
  }

  /**
   * Clean up old usage metrics (retention policy)
   */
  async cleanupOldMetrics(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString();

    const query = `
      DELETE FROM usage_metrics 
      WHERE period_start < ?
    `;

    const result = await this.db.run(query, [cutoffStr]);
    const deletedCount = result.changes || 0;

    logger.info('Cleaned up old usage metrics', {
      retentionDays,
      cutoffDate: cutoffStr,
      deletedCount,
    });

    return deletedCount;
  }
}

/**
 * Factory function to create UsageRollupService
 */
export async function createUsageRollupService(): Promise<UsageRollupService> {
  // Import the database service dynamically to avoid circular dependencies
  const { initializeDatabase } = await import(
    '@telegram-moderator/shared/src/services/database.js'
  );
  const db = await initializeDatabase();
  return new UsageRollupService(db);
}

/**
 * Standalone function for scheduled rollup jobs
 */
export async function runDailyRollup(targetDate?: Date): Promise<void> {
  const service = await createUsageRollupService();
  await service.performDailyRollup(targetDate);
}
