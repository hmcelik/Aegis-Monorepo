import express from 'express';
import * as groupController from '../controllers/unifiedGroupController.js';
import * as strikeController from '../controllers/strikeController.js';
import { unifiedAuth } from '../middleware/unifiedAuth.js';
import { checkGroupAdmin } from '../middleware/checkGroupAdmin.js';
import { body, param, query } from 'express-validator';

const router = express.Router();

// All group routes require unified authentication (JWT or WebApp)
router.use(unifiedAuth);

/**
 * @swagger
 * /api/v1/groups:
 *   get:
 *     summary: List user's groups with enhanced data
 *     description: |
 *       Get a list of all groups where the authenticated user is an admin.
 *       Supports both JWT token (external) and Telegram WebApp authentication.
 *       Returns enhanced group data including basic settings and statistics.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     responses:
 *       200:
 *         description: List of groups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Groups retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Group ID
 *                         example: "-1001234567890"
 *                       title:
 *                         type: string
 *                         description: Group title
 *                         example: "My Telegram Group"
 *                       type:
 *                         type: string
 *                         description: Group type
 *                         example: "supergroup"
 *                       memberCount:
 *                         type: integer
 *                         description: Number of members
 *                         example: 150
 *                       settings:
 *                         type: object
 *                         properties:
 *                           autoModeration:
 *                             type: boolean
 *                           maxStrikes:
 *                             type: integer
 *                           spamThreshold:
 *                             type: number
 *                       stats:
 *                         type: object
 *                         properties:
 *                           totalMessages:
 *                             type: integer
 *                           flaggedToday:
 *                             type: integer
 *                           activeStrikes:
 *                             type: integer
 *       401:
 *         description: Unauthorized - No valid authentication provided
 */
router.get('/', groupController.listGroups);

/**
 * @swagger
 * /api/v1/groups/{groupId}/settings:
 *   get:
 *     summary: Get comprehensive group settings
 *     description: |
 *       Retrieve complete moderation settings for a specific group.
 *       Supports both JWT and WebApp authentication.
 *       Returns enhanced settings with group information.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *         example: "-1001234567890"
 *     responses:
 *       200:
 *         description: Group settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     groupId:
 *                       type: string
 *                     groupInfo:
 *                       type: object
 *                       properties:
 *                         title:
 *                           type: string
 *                         type:
 *                           type: string
 *                         memberCount:
 *                           type: integer
 *                     settings:
 *                       type: object
 *                       properties:
 *                         alertLevel:
 *                           type: integer
 *                         muteLevel:
 *                           type: integer
 *                         kickLevel:
 *                           type: integer
 *                         banLevel:
 *                           type: integer
 *                         spamThreshold:
 *                           type: number
 *                         profanityThreshold:
 *                           type: number
 *                         muteDurationMinutes:
 *                           type: integer
 *                         strikeExpirationDays:
 *                           type: integer
 *                         goodBehaviorDays:
 *                           type: integer
 *                         warningMessage:
 *                           type: string
 *                         warningMessageDeleteSeconds:
 *                           type: integer
 *                         keywordWhitelistBypass:
 *                           type: boolean
 *                         whitelistedKeywords:
 *                           type: array
 *                           items:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 *       404:
 *         description: Group not found
 */
router.get('/:groupId/settings',
    param('groupId').isString().notEmpty().withMessage('Group ID is required'),
    groupController.getSettings
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/settings:
 *   put:
 *     summary: Update group settings with validation
 *     description: |
 *       Update moderation settings for a specific group.
 *       Supports both JWT and WebApp authentication.
 *       Validates all settings and provides detailed feedback.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *         example: "-1001234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: object
 *                 properties:
 *                   alertLevel:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 10
 *                   muteLevel:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 10
 *                   kickLevel:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 10
 *                   banLevel:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 10
 *                   spamThreshold:
 *                     type: number
 *                     format: float
 *                     minimum: 0
 *                     maximum: 1
 *                   profanityThreshold:
 *                     type: number
 *                     format: float
 *                     minimum: 0
 *                     maximum: 1
 *                   muteDurationMinutes:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 10080
 *                   strikeExpirationDays:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 365
 *                   goodBehaviorDays:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 365
 *                   warningMessage:
 *                     type: string
 *                     maxLength: 500
 *                   warningMessageDeleteSeconds:
 *                     type: integer
 *                     minimum: 5
 *                     maximum: 300
 *                   keywordWhitelistBypass:
 *                     type: boolean
 *                   whitelistedKeywords:
 *                     type: array
 *                     items:
 *                       type: string
 *                     maxItems: 100
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.put('/:groupId/settings',
    param('groupId').isString().notEmpty().withMessage('Group ID is required'),
    body('settings').isObject().withMessage('Settings object is required'),
    body('settings.alertLevel').optional().isInt({ min: 0, max: 10 }),
    body('settings.muteLevel').optional().isInt({ min: 0, max: 10 }),
    body('settings.kickLevel').optional().isInt({ min: 0, max: 10 }),
    body('settings.banLevel').optional().isInt({ min: 0, max: 10 }),
    body('settings.spamThreshold').optional().isFloat({ min: 0, max: 1 }),
    body('settings.profanityThreshold').optional().isFloat({ min: 0, max: 1 }),
    body('settings.muteDurationMinutes').optional().isInt({ min: 1, max: 10080 }),
    body('settings.strikeExpirationDays').optional().isInt({ min: 1, max: 365 }),
    body('settings.goodBehaviorDays').optional().isInt({ min: 1, max: 365 }),
    body('settings.warningMessage').optional().isLength({ max: 500 }),
    body('settings.warningMessageDeleteSeconds').optional().isInt({ min: 5, max: 300 }),
    body('settings.keywordWhitelistBypass').optional().isBoolean(),
    body('settings.whitelistedKeywords').optional().isArray({ max: 100 }),
    groupController.updateSettings
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/stats:
 *   get:
 *     summary: Get comprehensive group statistics
 *     description: |
 *       Get detailed statistics for a group including:
 *       - Message counts and violation metrics
 *       - User penalties (mutes, kicks, bans)
 *       - Quality metrics and moderation efficiency
 *       - Top violation types
 *       Supports flexible time periods and enhanced analytics.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: week
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Comprehensive statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     groupId:
 *                       type: string
 *                     period:
 *                       type: string
 *                     dateRange:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalMessages:
 *                           type: integer
 *                         flaggedMessages:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: integer
 *                             spam:
 *                               type: integer
 *                             profanity:
 *                               type: integer
 *                         deletedMessages:
 *                           type: integer
 *                         penalties:
 *                           type: object
 *                           properties:
 *                             mutedUsers:
 *                               type: integer
 *                             kickedUsers:
 *                               type: integer
 *                             bannedUsers:
 *                               type: integer
 *                             totalUsersActioned:
 *                               type: integer
 *                         qualityMetrics:
 *                           type: object
 *                           properties:
 *                             averageSpamScore:
 *                               type: number
 *                             flaggedRate:
 *                               type: string
 *                             moderationEfficiency:
 *                               type: object
 *                         topViolationTypes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 *       404:
 *         description: Group not found
 */
router.get('/:groupId/stats',
    param('groupId').isString().notEmpty().withMessage('Group ID is required'),
    query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid period'),
    groupController.getStats
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/audit:
 *   get:
 *     summary: Get paginated audit log
 *     description: Get paginated audit log entries for a group with filtering options
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of entries per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Audit log retrieved successfully with pagination
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/audit',
    param('groupId').isString().notEmpty().withMessage('Group ID is required'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isString(),
    query('userId').optional().isString(),
    groupController.getAuditLog
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/audit/export:
 *   get:
 *     summary: Export audit log
 *     description: Export audit log in CSV or JSON format with date filtering
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *       - TelegramAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO 8601)
 *     responses:
 *       200:
 *         description: Audit log export file
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/audit/export',
    param('groupId').isString().notEmpty().withMessage('Group ID is required'),
    query('format').optional().isIn(['json', 'csv']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    groupController.exportAuditLog
);

// Strike management routes (existing implementation with unified auth)
router.use('/:groupId/users/:userId/strikes', 
    param('groupId').isString().notEmpty(),
    param('userId').isString().notEmpty(),
    checkGroupAdmin
);

// Mount strike routes
router.get('/:groupId/users/:userId/strikes',
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('includeHistory').optional().isIn(['true', 'false']),
    strikeController.getUserStrikes
);

router.post('/:groupId/users/:userId/strikes',
    body('amount').isInt({ min: 1, max: 100 }).withMessage('Amount must be between 1 and 100'),
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
    strikeController.addUserStrikes
);

router.delete('/:groupId/users/:userId/strikes',
    body('amount').optional().isInt({ min: 1, max: 100 }).withMessage('Amount must be between 1 and 100'),
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
    strikeController.removeUserStrikes
);

router.put('/:groupId/users/:userId/strikes',
    body('count').isInt({ min: 0, max: 1000 }).withMessage('Count must be between 0 and 1000'),
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
    strikeController.setUserStrikes
);

export default router;
