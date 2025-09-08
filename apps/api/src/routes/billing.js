import express from 'express';
import { BudgetManager } from '../services/budgetManager.js';
import { checkJwt } from '../middleware/checkJwt.js';
import ApiError from '../utils/apiError.js';

/** @type {import('express').Router} */
const router = express.Router();

// Lazy initialization of BudgetManager
let budgetManager = null;
const getBudgetManager = () => {
  if (!budgetManager) {
    budgetManager = new BudgetManager();
  }
  return budgetManager;
};

/**
 * Get current budget status for a tenant
 * GET /api/billing/budget/:tenantId
 */
router.get('/budget/:tenantId', checkJwt, async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    // Verify user has access to this tenant
    if (req.user.tenantId !== tenantId && !req.user.isAdmin) {
      throw new ApiError('Forbidden', 403);
    }

    const budget = await getBudgetManager().getBudget(tenantId);
    const usage = await getBudgetManager().getCurrentUsage(tenantId);
    const remaining = budget.monthlyLimit - usage.totalSpent;

    res.json({
      budget: {
        tenantId,
        monthlyLimit: budget.monthlyLimit,
        currentSpent: usage.totalSpent,
        remaining: Math.max(0, remaining),
        remainingPercentage: Math.max(0, (remaining / budget.monthlyLimit) * 100),
        degradeMode: budget.degradeMode,
        resetDate: budget.resetDate,
        isExhausted: remaining <= 0,
      },
      usage: {
        tokenCount: usage.tokenCount,
        apiCalls: usage.apiCalls,
        averageCostPerCall: usage.apiCalls > 0 ? usage.totalSpent / usage.apiCalls : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update budget settings for a tenant
 * PUT /api/billing/budget/:tenantId
 */
router.put('/budget/:tenantId', checkJwt, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { monthlyLimit, degradeMode } = req.body;

    // Verify user has admin access
    if (!req.user.isAdmin && req.user.tenantId !== tenantId) {
      throw new ApiError('Forbidden', 403);
    }

    // Validate inputs
    if (typeof monthlyLimit !== 'number' || monthlyLimit < 0) {
      throw new ApiError('Invalid monthly limit', 400);
    }

    const validDegradeModes = ['strict_rules', 'link_blocks', 'disable_ai'];
    if (degradeMode && !validDegradeModes.includes(degradeMode)) {
      throw new ApiError(
        `Invalid degrade mode. Must be one of: ${validDegradeModes.join(', ')}`,
        400
      );
    }

    const updatedBudget = await getBudgetManager().updateBudget(tenantId, {
      monthlyLimit,
      degradeMode: degradeMode || 'strict_rules',
    });

    res.json({
      success: true,
      budget: updatedBudget,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Record AI usage for a tenant
 * POST /api/billing/usage/:tenantId
 */
router.post('/usage/:tenantId', checkJwt, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { tokens, cost, model, operation } = req.body;

    // Validate inputs
    if (typeof tokens !== 'number' || tokens < 0) {
      throw new ApiError('Invalid token count', 400);
    }
    if (typeof cost !== 'number' || cost < 0) {
      throw new ApiError('Invalid cost', 400);
    }

    const usage = await getBudgetManager().recordUsage(tenantId, {
      tokens,
      cost,
      model: model || 'unknown',
      operation: operation || 'moderation',
      timestamp: new Date(),
    });

    // Check if budget is now exhausted
    const budget = await getBudgetManager().getBudget(tenantId);
    const currentUsage = await getBudgetManager().getCurrentUsage(tenantId);
    const isExhausted = currentUsage.totalSpent >= budget.monthlyLimit;

    res.json({
      success: true,
      usage,
      budgetStatus: {
        remaining: Math.max(0, budget.monthlyLimit - currentUsage.totalSpent),
        isExhausted,
        degradeMode: budget.degradeMode,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get usage history for a tenant
 * GET /api/billing/usage/:tenantId/history
 */
router.get('/usage/:tenantId/history', checkJwt, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;

    // Verify user has access to this tenant
    if (req.user.tenantId !== tenantId && !req.user.isAdmin) {
      throw new ApiError('Forbidden', 403);
    }

    const history = await getBudgetManager().getUsageHistory(tenantId, {
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate: endDate ? new Date(endDate) : new Date(),
      limit: Math.min(parseInt(limit), 1000), // Cap at 1000 records
    });

    res.json({
      history,
      summary: {
        totalRecords: history.length,
        totalTokens: history.reduce((sum, record) => sum + record.tokens, 0),
        totalCost: history.reduce((sum, record) => sum + record.cost, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get budget analytics for dashboard
 * GET /api/billing/analytics/:tenantId
 */
router.get('/analytics/:tenantId', checkJwt, async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { period = '30d' } = req.query;

    // Verify user has access to this tenant
    if (req.user.tenantId !== tenantId && !req.user.isAdmin) {
      throw new ApiError('Forbidden', 403);
    }

    const analytics = await getBudgetManager().getAnalytics(tenantId, period);

    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

export default router;
