import express from 'express';
import * as groupController from '../controllers/groupController.js';
import * as auditController from '../controllers/auditController.js';
import { checkJwt } from '../middleware/checkJwt.js';
import { checkGroupAdmin } from '../middleware/checkGroupAdmin.js';
import { body, param, query } from 'express-validator';


const router = express.Router();

// All group routes require a valid JWT
router.use(checkJwt);

/**
 * @swagger
 * /api/v1/groups:
 *   get:
 *     summary: List user's groups
 *     description: Get a list of all groups where the authenticated user is an admin
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
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
 *       401:
 *         description: Unauthorized
 */
router.get('/', groupController.listGroups);

/**
 * @swagger
 * /api/v1/groups/{groupId}/settings:
 *   get:
 *     summary: Get group settings
 *     description: Retrieve moderation settings for a specific group
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     spamThreshold:
 *                       type: number
 *                       format: float
 *                       example: 0.85
 *                     profanityThreshold:
 *                       type: number
 *                       format: float
 *                       example: 0.7
 *                     maxStrikes:
 *                       type: integer
 *                       example: 3
 *                     autoModeration:
 *                       type: boolean
 *                       example: true
 *                     strikeExpiration:
 *                       type: integer
 *                       description: Strike expiration in hours
 *                       example: 72
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 *   put:
 *     summary: Update group settings
 *     description: Update moderation settings for a specific group
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
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
 *             properties:
 *               settings:
 *                 type: object
 *                 properties:
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
 *                   maxStrikes:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 10
 *                   autoModeration:
 *                     type: boolean
 *                   strikeExpiration:
 *                     type: integer
 *                     minimum: 1
 *             required: [settings]
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/settings', 
    param('groupId').isString(),
    checkGroupAdmin, 
    groupController.getSettings
);

router.put('/:groupId/settings',
    param('groupId').isString(),
    body('settings').isObject(),
    checkGroupAdmin,
    groupController.updateSettings
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/stats:
 *   get:
 *     summary: Get group statistics
 *     description: Retrieve moderation and activity statistics for a specific group
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *         example: "-1001234567890"
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: week
 *         description: Time period for statistics
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for custom period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for custom period
 *     responses:
 *       200:
 *         description: Group statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalMessages:
 *                       type: integer
 *                       example: 1250
 *                     flaggedMessages:
 *                       type: integer
 *                       example: 45
 *                     deletedMessages:
 *                       type: integer
 *                       example: 32
 *                     mutedUsers:
 *                       type: integer
 *                       example: 8
 *                     kickedUsers:
 *                       type: integer
 *                       example: 3
 *                     bannedUsers:
 *                       type: integer
 *                       example: 1
 *                     avgSpamScore:
 *                       type: number
 *                       format: float
 *                       example: 0.15
 *                     topViolationTypes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           count:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/stats',
    param('groupId').isString(),
    checkGroupAdmin,
    groupController.getStats
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/audit:
 *   get:
 *     summary: Retrieve paginated audit log entries
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
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
 *           maximum: 200
 *           default: 50
 *         description: Number of entries per page
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by specific user ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [AUTO, MANUAL-STRIKE-ADD, MANUAL-STRIKE-REMOVE, MANUAL-STRIKE-SET]
 *         description: Filter by action type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries until this date
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       chatId:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       type:
 *                         type: string
 *                       action:
 *                         type: string
 *                       details:
 *                         type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *                 filters:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/audit',
    param('groupId').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('userId').optional().isString(),
    query('type').optional().isIn(['AUTO', 'MANUAL-STRIKE-ADD', 'MANUAL-STRIKE-REMOVE', 'MANUAL-STRIKE-SET']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    checkGroupAdmin,
    auditController.getAuditLog
);

/**
 * @swagger
 * /api/v1/groups/{groupId}/audit/export:
 *   get:
 *     summary: Generate and return a CSV or JSON file of the audit log
 *     tags: [Audit Log]
 *     security:
 *       - bearerAuth: []
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
 *           enum: [csv, json]
 *           default: csv
 *         description: Export format
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by specific user ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [AUTO, MANUAL-STRIKE-ADD, MANUAL-STRIKE-REMOVE, MANUAL-STRIKE-SET]
 *         description: Filter by action type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries until this date
 *     responses:
 *       200:
 *         description: Audit log file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a group admin
 */
router.get('/:groupId/audit/export',
    param('groupId').isString().notEmpty(),
    query('format').optional().isIn(['csv', 'json']),
    query('userId').optional().isString(),
    query('type').optional().isIn(['AUTO', 'MANUAL-STRIKE-ADD', 'MANUAL-STRIKE-REMOVE', 'MANUAL-STRIKE-SET']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    checkGroupAdmin,
    auditController.exportAuditLog
);


export default router;