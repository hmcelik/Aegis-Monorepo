import { validationResult } from 'express-validator';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import ApiError from '../utils/apiError.js';
import { ERROR_TYPES } from '../utils/errorTypes.js';
import { asyncHandler, successResponse, handleDatabaseError } from '../utils/errorHelpers.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';

/**
 * GET /api/v1/groups/{groupId}/users/{userId}/strikes
 * Get a user's detailed strike history
 */
export const getUserStrikes = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId, userId } = req.params;
  const { limit = 50, offset = 0, includeHistory = 'true' } = req.query;

  try {
    // Get current strike count
    const strikes = await db.getStrikes(groupId, userId);

    let history = [];
    if (includeHistory === 'true') {
      // Get strike history from audit log
      const allHistory = await db.getStrikeHistory(
        groupId,
        userId,
        parseInt(limit) + parseInt(offset)
      );
      history = allHistory.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    }

    // Parse history for better structure
    const parsedHistory = history.map(record => {
      try {
        const logData = JSON.parse(record.logData);
        return {
          id: record.id,
          timestamp: record.timestamp,
          type: logData.type || 'AUTO',
          action: logData.type?.includes('STRIKE') ? logData.type : 'AUTO-STRIKE',
          amount: logData.amount || 1,
          reason: logData.reason || logData.messageExcerpt || 'No reason provided',
          admin: logData.admin
            ? {
                id: logData.admin.id,
                firstName: logData.admin.first_name,
                username: logData.admin.username,
              }
            : null,
          violationType: logData.violationType,
          classificationScore: logData.classificationScore,
          spamScore: logData.spamScore,
          profanityScore: logData.profanityScore,
        };
      } catch (parseError) {
        return {
          id: record.id,
          timestamp: record.timestamp,
          type: 'UNKNOWN',
          action: 'UNKNOWN',
          amount: 1,
          reason: 'Failed to parse log data',
          admin: null,
        };
      }
    });

    const responseData = {
      userId,
      groupId,
      strikes: strikes.count,
      lastStrikeTimestamp: strikes.timestamp,
      history: parsedHistory,
      pagination: {
        offset: parseInt(offset),
        limit: parseInt(limit),
        total: history.length,
        hasMore: history.length === parseInt(limit),
      },
    };

    res.json(successResponse(responseData, 'User strike history retrieved successfully'));
  } catch (error) {
    throw handleDatabaseError(error);
  }
});

/**
 * POST /api/v1/groups/{groupId}/users/{userId}/strikes
 * Add strikes to a user
 */
export const addUserStrikes = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId, userId } = req.params;
    const { amount, reason = 'API strike addition' } = req.body;
    const adminUser = req.user;

    // Validate amount
    if (!amount || amount <= 0 || amount > 100) {
      throw new ApiError(400, 'Amount must be between 1 and 100');
    }

    // Get current strikes before adding
    const beforeStrikes = await db.getStrikes(groupId, userId);

    // Add strikes
    const newCount = await db.addStrikes(groupId, userId, amount);

    // Log the manual action
    await db.logManualAction(groupId, userId, {
      type: 'MANUAL-STRIKE-ADD',
      admin: {
        id: adminUser.id,
        first_name: adminUser.first_name,
        username: adminUser.username,
      },
      targetUser: { id: userId },
      amount,
      reason,
    });

    res.status(200).json({
      success: true,
      message: `Added ${amount} strike(s) to user ${userId}`,
      data: {
        userId,
        groupId,
        previousCount: beforeStrikes.count,
        newCount,
        amountAdded: amount,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/groups/{groupId}/users/{userId}/strikes
 * Remove strikes from a user
 */
export const removeUserStrikes = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId, userId } = req.params;
    const { amount = 1, reason = 'API strike removal' } = req.body;
    const adminUser = req.user;

    // Validate amount
    if (!amount || amount <= 0 || amount > 100) {
      throw new ApiError(400, 'Amount must be between 1 and 100');
    }

    // Get current strikes before removing
    const beforeStrikes = await db.getStrikes(groupId, userId);

    // Remove strikes
    const newCount = await db.removeStrike(groupId, userId, amount);

    // Log the manual action
    await db.logManualAction(groupId, userId, {
      type: 'MANUAL-STRIKE-REMOVE',
      admin: {
        id: adminUser.id,
        first_name: adminUser.first_name,
        username: adminUser.username,
      },
      targetUser: { id: userId },
      amount,
      reason,
    });

    res.status(200).json({
      success: true,
      message: `Removed ${amount} strike(s) from user ${userId}`,
      data: {
        userId,
        groupId,
        previousCount: beforeStrikes.count,
        newCount,
        amountRemoved: amount,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/groups/{groupId}/users/{userId}/strikes
 * Set a specific strike count for a user
 */
export const setUserStrikes = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId, userId } = req.params;
    const { count, reason = 'API strike count set' } = req.body;
    const adminUser = req.user;

    // Validate count
    if (count === undefined || count < 0 || count > 1000) {
      throw new ApiError(400, 'Count must be between 0 and 1000');
    }

    // Get current strikes before setting
    const beforeStrikes = await db.getStrikes(groupId, userId);

    // Set strikes
    const newCount = await db.setStrikes(groupId, userId, count);

    // Log the manual action
    await db.logManualAction(groupId, userId, {
      type: 'MANUAL-STRIKE-SET',
      admin: {
        id: adminUser.id,
        first_name: adminUser.first_name,
        username: adminUser.username,
      },
      targetUser: { id: userId },
      amount: count,
      reason,
    });

    res.status(200).json({
      success: true,
      message: `Set strike count to ${count} for user ${userId}`,
      data: {
        userId,
        groupId,
        previousCount: beforeStrikes.count,
        newCount,
        countSet: count,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
