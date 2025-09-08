import express from 'express';
import { checkJwt } from '../middleware/checkJwt.js';
import { checkGroupAdmin } from '../middleware/checkGroupAdmin.js';
import { body, query, validationResult } from 'express-validator';
import logger from '@telegram-moderator/shared/src/services/logger.js';

/** @type {import('express').Router} */
const router = express.Router();

// Temporary implementation - will be moved to shared package
class SimpleUsageAnalytics {
  // Placeholder implementation until proper service is integrated
  async getDailyRollups(tenantId, startDate, endDate) {
    // Mock data for now
    return [
      {
        tenantId,
        date: startDate,
        messagesProcessed: 100,
        aiCallsMade: 50,
        aiCost: 2.5,
        cacheHits: 30,
        cacheMisses: 20,
        avgProcessingTimeMs: 150,
      },
    ];
  }

  async getAggregatedMetrics(tenantId, startDate, endDate) {
    // Mock data for now
    return {
      totalMessages: 1000,
      totalAICalls: 500,
      totalCost: 25.0,
      cacheHitRate: 0.6,
      avgProcessingTime: 140,
    };
  }

  async performDailyRollup(targetDate) {
    // Mock implementation
    logger.info('Daily rollup performed', { targetDate });
  }

  async cleanupOldMetrics(retentionDays) {
    // Mock implementation
    logger.info('Cleanup performed', { retentionDays });
    return 150; // Mock deleted count
  }
}

function createUsageRollupService() {
  return new SimpleUsageAnalytics();
}

/**
 * Get daily usage rollups for a tenant
 * GET /api/v1/analytics/daily-usage
 */
router.get(
  '/daily-usage',
  checkJwt,
  [
    query('startDate')
      .isISO8601()
      .withMessage('Start date must be in ISO 8601 format (YYYY-MM-DD)'),
    query('endDate').isISO8601().withMessage('End date must be in ISO 8601 format (YYYY-MM-DD)'),
    query('tenantId').optional().isString().withMessage('Tenant ID must be a string'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array(),
        });
      }

      const { startDate, endDate, tenantId } = req.query;
      const effectiveTenantId = tenantId || req.user.tenantId || 'default';

      const service = createUsageRollupService();
      const rollups = await service.getDailyRollups(effectiveTenantId, startDate, endDate);

      res.json({
        success: true,
        message: 'Daily usage rollups retrieved successfully',
        data: rollups,
        metadata: {
          tenantId: effectiveTenantId,
          period: { startDate, endDate },
          count: rollups.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get daily usage rollups', {
        error: error.message,
        user: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve usage data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

/**
 * Get aggregated usage metrics for a tenant
 * GET /api/v1/analytics/metrics
 */
router.get(
  '/metrics',
  checkJwt,
  [
    query('startDate')
      .isISO8601()
      .withMessage('Start date must be in ISO 8601 format (YYYY-MM-DD)'),
    query('endDate').isISO8601().withMessage('End date must be in ISO 8601 format (YYYY-MM-DD)'),
    query('tenantId').optional().isString().withMessage('Tenant ID must be a string'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array(),
        });
      }

      const { startDate, endDate, tenantId } = req.query;
      const effectiveTenantId = tenantId || req.user.tenantId || 'default';

      const service = createUsageRollupService();
      const metrics = await service.getAggregatedMetrics(effectiveTenantId, startDate, endDate);

      res.json({
        success: true,
        message: 'Aggregated metrics retrieved successfully',
        data: metrics,
        metadata: {
          tenantId: effectiveTenantId,
          period: { startDate, endDate },
        },
      });
    } catch (error) {
      logger.error('Failed to get aggregated metrics', {
        error: error.message,
        user: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve metrics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

/**
 * Trigger manual daily rollup (admin only)
 * POST /api/v1/analytics/rollup
 */
router.post(
  '/rollup',
  checkJwt,
  [body('date').optional().isISO8601().withMessage('Date must be in ISO 8601 format (YYYY-MM-DD)')],
  async (req, res) => {
    try {
      // Check if user is admin (you may want to implement proper role checking)
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to trigger rollup',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array(),
        });
      }

      const { date } = req.body;
      const targetDate = date ? new Date(date) : undefined;

      logger.info('Manual rollup triggered', {
        user: req.user.id,
        targetDate: targetDate?.toISOString(),
      });

      const service = createUsageRollupService();
      await service.performDailyRollup(targetDate);

      res.json({
        success: true,
        message: 'Daily rollup completed successfully',
        data: {
          date: targetDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        },
      });
    } catch (error) {
      logger.error('Manual rollup failed', {
        error: error.message,
        user: req.user?.id,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        message: 'Rollup failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

/**
 * Clean up old usage metrics (admin only)
 * DELETE /api/v1/analytics/cleanup
 */
router.delete(
  '/cleanup',
  checkJwt,
  [
    query('retentionDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Retention days must be between 1 and 365'),
  ],
  async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to perform cleanup',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array(),
        });
      }

      const retentionDays = parseInt(req.query.retentionDays) || 30;

      logger.info('Cleanup triggered', {
        user: req.user.id,
        retentionDays,
      });

      const service = createUsageRollupService();
      const deletedCount = await service.cleanupOldMetrics(retentionDays);

      res.json({
        success: true,
        message: 'Cleanup completed successfully',
        data: {
          deletedCount,
          retentionDays,
        },
      });
    } catch (error) {
      logger.error('Cleanup failed', {
        error: error.message,
        user: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Cleanup failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

/**
 * Get usage overview for dashboard
 * GET /api/v1/analytics/overview
 */
router.get(
  '/overview',
  checkJwt,
  [
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Period must be one of: day, week, month, year'),
    query('tenantId').optional().isString().withMessage('Tenant ID must be a string'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array(),
        });
      }

      const { period = 'month', tenantId } = req.query;
      const effectiveTenantId = tenantId || req.user.tenantId || 'default';

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const service = createUsageRollupService();
      const [metrics, rollups] = await Promise.all([
        service.getAggregatedMetrics(effectiveTenantId, startDateStr, endDateStr),
        service.getDailyRollups(effectiveTenantId, startDateStr, endDateStr),
      ]);

      res.json({
        success: true,
        message: 'Usage overview retrieved successfully',
        data: {
          summary: metrics,
          dailyBreakdown: rollups,
          period: {
            type: period,
            startDate: startDateStr,
            endDate: endDateStr,
          },
        },
        metadata: {
          tenantId: effectiveTenantId,
          dataPoints: rollups.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get usage overview', {
        error: error.message,
        user: req.user?.id,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve usage overview',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  }
);

export default router;
