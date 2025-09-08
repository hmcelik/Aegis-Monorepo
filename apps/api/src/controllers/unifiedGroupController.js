import { validationResult } from 'express-validator';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import { getGroupSettings, updateSetting } from '@telegram-moderator/shared/src/config/index.js';
import ApiError from '../utils/apiError.js';
import { ERROR_TYPES } from '../utils/errorTypes.js';
import {
  asyncHandler,
  successResponse,
  handleDatabaseError,
  paginatedResponse,
} from '../utils/errorHelpers.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';

/**
 * List groups where the user is an admin
 */
export const listGroups = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const userAdminGroups = await db.getUserAdminGroups(userId);

    // Enhanced group data with basic stats
    const enhancedGroups = await Promise.all(
      userAdminGroups.map(async group => {
        try {
          const settings = await getGroupSettings(group.id);
          const basicStats = await db.getBasicGroupStats(group.id);

          return {
            id: group.id,
            title: group.title,
            type: group.type || 'supergroup',
            memberCount: group.memberCount || 0,
            settings: {
              autoModeration: settings.alertLevel > 0,
              maxStrikes: settings.kickLevel || 3,
              spamThreshold: settings.spamThreshold || 0.8,
            },
            stats: {
              totalMessages: basicStats.totalMessages || 0,
              flaggedToday: basicStats.flaggedToday || 0,
              activeStrikes: basicStats.activeStrikes || 0,
            },
          };
        } catch (error) {
          logger.warn(`Failed to get enhanced data for group ${group.id}:`, error.message);
          return group; // Return basic group data if enhanced fails
        }
      })
    );

    res.json(successResponse(enhancedGroups, 'Groups retrieved successfully'));
  } catch (error) {
    throw handleDatabaseError(error);
  }
});

/**
 * Get group settings with enhanced data
 */
export const getSettings = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId } = req.params;
  const userId = req.user.id;

  try {
    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(userId, groupId);
    if (!isAdmin) {
      throw ApiError.fromType(
        ERROR_TYPES.FORBIDDEN,
        'Access denied. User is not admin of this group'
      );
    }

    const settings = await getGroupSettings(groupId);

    // Get group info
    const groupInfo = await db.getGroup(groupId);
    if (!groupInfo) {
      throw ApiError.fromType(ERROR_TYPES.NOT_FOUND, 'Group not found');
    }

    const response = {
      groupId,
      groupInfo: {
        title: groupInfo.title,
        type: groupInfo.type,
        memberCount: groupInfo.memberCount,
      },
      settings: {
        // Core moderation settings
        alertLevel: settings.alertLevel,
        muteLevel: settings.muteLevel,
        kickLevel: settings.kickLevel,
        banLevel: settings.banLevel,

        // Thresholds
        spamThreshold: settings.spamThreshold,
        profanityThreshold: settings.profanityThreshold || 0.8,

        // Timing settings
        muteDurationMinutes: settings.muteDurationMinutes,
        strikeExpirationDays: settings.strikeExpirationDays,
        goodBehaviorDays: settings.goodBehaviorDays,

        // Messages
        warningMessage: settings.warningMessage,
        warningMessageDeleteSeconds: settings.warningMessageDeleteSeconds,

        // Advanced features
        keywordWhitelistBypass: settings.keywordWhitelistBypass,
        whitelistedKeywords: settings.whitelistedKeywords || [],
      },
    };

    res.json(successResponse(response, 'Group settings retrieved successfully'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw handleDatabaseError(error);
  }
});

/**
 * Update group settings with validation
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId } = req.params;
  const { settings } = req.body;
  const userId = req.user.id;

  try {
    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(userId, groupId);
    if (!isAdmin) {
      throw ApiError.fromType(
        ERROR_TYPES.FORBIDDEN,
        'Access denied. User is not admin of this group'
      );
    }

    // Validate settings
    const validSettings = [
      'alertLevel',
      'muteLevel',
      'kickLevel',
      'banLevel',
      'spamThreshold',
      'profanityThreshold',
      'muteDurationMinutes',
      'warningMessage',
      'warningMessageDeleteSeconds',
      'keywordWhitelistBypass',
      'strikeExpirationDays',
      'goodBehaviorDays',
      'whitelistedKeywords',
    ];

    const invalidSettings = Object.keys(settings).filter(key => !validSettings.includes(key));
    if (invalidSettings.length > 0) {
      throw ApiError.badRequest(`Invalid settings: ${invalidSettings.join(', ')}`);
    }

    // Update settings
    for (const [key, value] of Object.entries(settings)) {
      await updateSetting(groupId, key, value);
    }

    // Get updated settings
    const updatedSettings = await getGroupSettings(groupId);

    // Log the update
    logger.info('Group settings updated', {
      groupId,
      userId,
      updatedFields: Object.keys(settings),
      authType: req.authType,
    });

    res.json(
      successResponse(
        {
          groupId,
          settings: updatedSettings,
          updatedFields: Object.keys(settings),
        },
        'Settings updated successfully'
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw handleDatabaseError(error);
  }
});

/**
 * Get comprehensive group statistics (unified from webapp version)
 */
export const getStats = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId } = req.params;
  const { period = 'week' } = req.query;
  const userId = req.user.id;

  try {
    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(userId, groupId);
    if (!isAdmin) {
      throw ApiError.fromType(
        ERROR_TYPES.FORBIDDEN,
        'Access denied. User is not admin of this group'
      );
    }

    const group = await db.getGroup(groupId);
    if (!group) {
      throw ApiError.fromType(ERROR_TYPES.NOT_FOUND, 'Group not found');
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get enhanced statistics from database
    const stats = await db.getGroupStats(groupId, startDate, now);

    const response = {
      groupId,
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
      stats: {
        // Core metrics
        totalMessages: stats.totalMessages || 0,
        flaggedMessages: stats.flaggedMessages || {
          total: 0,
          spam: 0,
          profanity: 0,
        },
        deletedMessages: stats.deletedMessages || 0,

        // User penalties
        penalties: {
          mutedUsers: stats.mutedUsers || 0,
          kickedUsers: stats.kickedUsers || 0,
          bannedUsers: stats.bannedUsers || 0,
          totalUsersActioned:
            (stats.mutedUsers || 0) + (stats.kickedUsers || 0) + (stats.bannedUsers || 0),
        },

        // Quality metrics
        qualityMetrics: {
          averageSpamScore: stats.averageSpamScore || 0,
          flaggedRate:
            stats.totalMessages > 0
              ? (((stats.flaggedMessages?.total || 0) / stats.totalMessages) * 100).toFixed(2)
              : 0,
          moderationEfficiency: stats.autoModerationEfficiency || {
            messagesScanned: 0,
            violationsDetected: 0,
            usersActioned: 0,
          },
        },

        // Top violation types
        topViolationTypes: stats.topViolationTypes || [
          { type: 'SPAM', count: 0 },
          { type: 'PROFANITY', count: 0 },
        ],
      },
    };

    res.json(successResponse(response, 'Group statistics retrieved successfully'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw handleDatabaseError(error);
  }
});

/**
 * Get paginated audit log
 */
export const getAuditLog = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId } = req.params;
  const { page = 1, limit = 50, type, userId: filterUserId } = req.query;
  const userId = req.user.id;

  try {
    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(userId, groupId);
    if (!isAdmin) {
      throw ApiError.fromType(
        ERROR_TYPES.FORBIDDEN,
        'Access denied. User is not admin of this group'
      );
    }

    const offset = (page - 1) * limit;
    const auditData = await db.getAuditLogPaginated(groupId, {
      limit: parseInt(limit),
      offset,
      type,
      userId: filterUserId,
    });

    res.json(
      paginatedResponse(
        auditData.entries,
        page,
        limit,
        auditData.total,
        'Audit log retrieved successfully'
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw handleDatabaseError(error);
  }
});

/**
 * Export audit log
 */
export const exportAuditLog = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw ApiError.badRequest('Validation error', errors.array());
  }

  const { groupId } = req.params;
  const { format = 'json', startDate, endDate } = req.query;
  const userId = req.user.id;

  try {
    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(userId, groupId);
    if (!isAdmin) {
      throw ApiError.fromType(
        ERROR_TYPES.FORBIDDEN,
        'Access denied. User is not admin of this group'
      );
    }

    const auditData = await db.exportAuditLog(groupId, { startDate, endDate });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-log-${groupId}-${new Date().toISOString().split('T')[0]}.csv"`
      );
      res.send(auditData.csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-log-${groupId}-${new Date().toISOString().split('T')[0]}.json"`
      );
      res.json(successResponse(auditData.entries, 'Audit log exported successfully'));
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw handleDatabaseError(error);
  }
});
