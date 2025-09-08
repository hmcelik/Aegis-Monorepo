import * as tokenService from '../services/tokenService.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';
import { getGroupSettings as getConfigGroupSettings } from '@telegram-moderator/shared/src/config/index.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';
import ApiError from '../utils/apiError.js';
import { ERROR_TYPES } from '../utils/errorTypes.js';
import { asyncHandler, successResponse, handleDatabaseError } from '../utils/errorHelpers.js';

/**
 * Authenticate Telegram WebApp user and return JWT token
 */
export const authenticate = asyncHandler(async (req, res) => {
  const { telegramUser } = req;

  if (!telegramUser) {
    throw ApiError.fromType(ERROR_TYPES.TELEGRAM_AUTH_FAILED, 'No Telegram user data found');
  }

  try {
    // Ensure user is in our database
    await db.upsertUser({
      id: telegramUser.id,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name || null,
      username: telegramUser.username || null,
      language_code: telegramUser.language_code || 'en',
    });
  } catch (error) {
    throw handleDatabaseError(error);
  }

  // Create a session token (JWT)
  const token = tokenService.generateToken({
    id: telegramUser.id,
    type: 'webapp',
  });

  logger.info('WebApp user authenticated', {
    userId: telegramUser.id,
    username: telegramUser.username,
  });

  const userData = {
    id: telegramUser.id,
    first_name: telegramUser.first_name,
    last_name: telegramUser.last_name,
    username: telegramUser.username,
    language_code: telegramUser.language_code,
  };

  res.status(200).json(
    successResponse(
      {
        token,
        user: userData,
      },
      'Authentication successful'
    )
  );
});

/**
 * Get user profile information
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  const { telegramUser } = req;

  // Get user from database
  let user;
  try {
    user = await db.getUser(telegramUser.id);
  } catch (error) {
    throw handleDatabaseError(error);
  }

  if (!user) {
    throw ApiError.fromType(ERROR_TYPES.USER_NOT_FOUND);
  }

  // Get user's admin groups
  let adminGroups;
  try {
    adminGroups = await db.getUserAdminGroups(telegramUser.id);
  } catch (error) {
    throw handleDatabaseError(error);
  }

  const profileData = {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    admin_groups: adminGroups.map(group => ({
      id: group.id,
      title: group.title,
      type: group.type,
    })),
  };

  res.status(200).json(successResponse(profileData, 'Profile retrieved successfully'));
});

/**
 * Get list of groups where user is admin
 */
export const getUserGroups = asyncHandler(async (req, res) => {
  const { telegramUser } = req;

  let adminGroups;
  try {
    adminGroups = await db.getUserAdminGroups(telegramUser.id);
  } catch (error) {
    throw handleDatabaseError(error);
  }

  const groupsData = adminGroups.map(group => ({
    id: group.id,
    title: group.title,
    type: group.type,
    member_count: group.member_count || 0,
  }));

  res.status(200).json(successResponse(groupsData, 'User groups retrieved successfully'));
});

/**
 * Health check endpoint for WebApp
 */
export const healthCheck = asyncHandler(async (req, res) => {
  res.status(200).json(
    successResponse(
      {
        status: 'healthy',
        features: {
          webAppSupport: true,
          cors: true,
          rateLimit: true,
          authentication: true,
          swagger: true,
        },
      },
      'Service is healthy'
    )
  );
});

/**
 * Get group settings
 */
export const getGroupSettingsWebApp = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
    }

    const settings = await getConfigGroupSettings(groupId);

    res.status(200).json({
      success: true,
      data: {
        groupId,
        settings: {
          alertLevel: settings.alertLevel,
          muteLevel: settings.muteLevel,
          kickLevel: settings.kickLevel,
          banLevel: settings.banLevel,
          spamThreshold: settings.spamThreshold,
          muteDurationMinutes: settings.muteDurationMinutes,
          warningMessage: settings.warningMessage,
          warningMessageDeleteSeconds: settings.warningMessageDeleteSeconds,
          keywordWhitelistBypass: settings.keywordWhitelistBypass,
          strikeExpirationDays: settings.strikeExpirationDays,
          goodBehaviorDays: settings.goodBehaviorDays,
          whitelistedKeywords: settings.whitelistedKeywords,
        },
      },
    });
  } catch (error) {
    logger.error('Error in getGroupSettings:', error);
    next(new ApiError(500, 'Failed to get group settings'));
  }
};

/**
 * Update group settings
 */
export const updateGroupSettingsWebApp = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;
    const { settings } = req.body;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
    }

    // Validate settings
    const validSettings = [
      'alertLevel',
      'muteLevel',
      'kickLevel',
      'banLevel',
      'spamThreshold',
      'muteDurationMinutes',
      'warningMessage',
      'warningMessageDeleteSeconds',
      'keywordWhitelistBypass',
      'strikeExpirationDays',
      'goodBehaviorDays',
    ];

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      if (validSettings.includes(key)) {
        await db.setSetting(groupId, key, value);
      }
    }

    // Handle whitelisted keywords separately
    if (settings.whitelistedKeywords && Array.isArray(settings.whitelistedKeywords)) {
      await db.setWhitelistKeywords(groupId, settings.whitelistedKeywords);
    }

    logger.info(`Settings updated for group ${groupId} by user ${telegramUser.id}`);

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    logger.error('Error in updateGroupSettings:', error);
    next(new ApiError(500, 'Failed to update group settings'));
  }
};

/**
 * Get group moderation statistics
 */
export const getGroupStats = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;
    const { period = 'week' } = req.query;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
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

    res.status(200).json({
      success: true,
      data: {
        groupId,
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        stats: {
          // Core metrics
          totalMessages: stats.totalMessages || 0,
          flaggedMessages: stats.flaggedMessages || { total: 0, spam: 0, profanity: 0 },
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
            flaggedRate: stats.flaggedRate || 0,
            moderationEfficiency: stats.autoModerationEfficiency || {
              messagesScanned: 0,
              violationsDetected: 0,
              usersActioned: 0,
            },
          },

          // Top violation types
          topViolationTypes: stats.topViolationTypes || [],
        },
      },
    });
  } catch (error) {
    logger.error('Error in getGroupStats:', error);
    next(new ApiError(500, 'Failed to get group statistics'));
  }
};

/**
 * Get detailed user activity stats for a group
 */
export const getUserActivityStats = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;
    const { period = 'week', limit = 10 } = req.query;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
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

    const userStats = await db.getUserActivityStats(groupId, startDate, now, parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        groupId,
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        users: userStats.map(user => ({
          userId: user.userId,
          username: user.username || 'N/A',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          stats: {
            messagesSent: user.messages_sent || 0,
            violations: user.violations || 0,
            penalties: user.penalties || 0,
            averageSpamScore: Math.round((user.avg_spam_score || 0) * 100) / 100,
            violationRate:
              user.messages_sent > 0
                ? Math.round((user.violations / user.messages_sent) * 10000) / 100
                : 0,
          },
        })),
      },
    });
  } catch (error) {
    logger.error('Error in getUserActivityStats:', error);
    next(new ApiError(500, 'Failed to get user activity statistics'));
  }
};

/**
 * Get activity patterns for a group (hourly/daily distribution)
 */
export const getActivityPatterns = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;
    const { period = 'week' } = req.query;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
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

    const patterns = await db.getActivityPatterns(groupId, startDate, now);

    res.status(200).json({
      success: true,
      data: {
        groupId,
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        patterns: {
          hourlyDistribution: patterns.hourlyDistribution.map(hour => ({
            hour: parseInt(hour.hour),
            messages: hour.messages || 0,
            violations: hour.violations || 0,
            violationRate:
              hour.messages > 0 ? Math.round((hour.violations / hour.messages) * 10000) / 100 : 0,
          })),
          dailyActivity: patterns.dailyActivity.map(day => ({
            date: day.date,
            messages: day.messages || 0,
            violations: day.violations || 0,
            violationRate:
              day.messages > 0 ? Math.round((day.violations / day.messages) * 10000) / 100 : 0,
          })),
        },
      },
    });
  } catch (error) {
    logger.error('Error in getActivityPatterns:', error);
    next(new ApiError(500, 'Failed to get activity patterns'));
  }
};

/**
 * Get moderation effectiveness metrics
 */
export const getModerationEffectiveness = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { telegramUser } = req;
    const { period = 'week' } = req.query;

    // Check if user is admin of this group
    const isAdmin = await db.isUserGroupAdmin(telegramUser.id, groupId);
    if (!isAdmin) {
      return next(new ApiError(403, 'Access denied. User is not admin of this group'));
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

    const effectiveness = await db.getModerationEffectiveness(groupId, startDate, now);

    res.status(200).json({
      success: true,
      data: {
        groupId,
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        effectiveness: {
          averageResponseTimeSeconds: effectiveness.averageResponseTimeSeconds || 0,
          effectivenessScore: Math.round(effectiveness.effectivenessScore || 0),
          totalRepeatOffenders: effectiveness.totalRepeatOffenders || 0,
          responseTimeDistribution:
            effectiveness.responseTimeDistribution?.map(response => ({
              violationType: response.violation_type,
              penaltyAction: response.penalty_action?.replace('user_', ''),
              responseTimeSeconds: Math.round(response.response_time_seconds * 100) / 100,
            })) || [],
          topRepeatOffenders:
            effectiveness.repeatOffenders?.slice(0, 5).map(offender => ({
              userId: offender.userId,
              totalViolations: offender.total_violations,
              activeDays: offender.active_days,
              averageViolationScore: Math.round((offender.avg_violation_score || 0) * 100) / 100,
            })) || [],
        },
      },
    });
  } catch (error) {
    logger.error('Error in getModerationEffectiveness:', error);
    next(new ApiError(500, 'Failed to get moderation effectiveness'));
  }
};
