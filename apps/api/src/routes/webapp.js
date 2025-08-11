import express from 'express';
import * as webAppController from '../controllers/webAppController.js';
import { verifyTelegramWebApp } from '../middleware/verifyTelegramWebApp.js';
import { checkJwt } from '../middleware/checkJwt.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/webapp/auth:
 *   post:
 *     summary: Authenticate Telegram WebApp user
 *     description: Validates Telegram WebApp initData and returns JWT token
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *     responses:
 *       200:
 *         description: Authentication successful
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
 *                   example: "Authentication successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT token for API access
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 123456789
 *                         first_name:
 *                           type: string
 *                           example: "John"
 *                         last_name:
 *                           type: string
 *                           example: "Doe"
 *                         username:
 *                           type: string
 *                           example: "johndoe"
 *                         language_code:
 *                           type: string
 *                           example: "en"
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "TELEGRAM_AUTH_FAILED"
 *                     message:
 *                       type: string
 *                       example: "Invalid Telegram WebApp authentication"
 */
router.post('/auth', verifyTelegramWebApp, webAppController.authenticate);

/**
 * @swagger
 * /api/v1/webapp/user/profile:
 *   get:
 *     summary: Get user profile
 *     description: Get the current user's profile information including admin groups
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
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
 *                   example: "Profile retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 123456789
 *                     first_name:
 *                       type: string
 *                       example: "John"
 *                     last_name:
 *                       type: string
 *                       example: "Doe"
 *                     username:
 *                       type: string
 *                       example: "johndoe"
 *                     language_code:
 *                       type: string
 *                       example: "en"
 *                     admin_groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "-1001234567890"
 *                           title:
 *                             type: string
 *                             example: "My Group"
 *                           type:
 *                             type: string
 *                             example: "supergroup"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/user/profile', verifyTelegramWebApp, webAppController.getUserProfile);

/**
 * @swagger
 * /api/v1/webapp/user/groups:
 *   get:
 *     summary: Get user's groups
 *     description: Get list of groups where user is admin
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Groups retrieved successfully
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
 *                         example: "-1001234567890"
 *                       title:
 *                         type: string
 *                         example: "My Telegram Group"
 *                       type:
 *                         type: string
 *                         example: "supergroup"
 *                       memberCount:
 *                         type: integer
 *                         example: 150
 *                       settings:
 *                         type: object
 *                         description: Current moderation settings
 *       401:
 *         description: Unauthorized
 */
router.get('/user/groups', verifyTelegramWebApp, webAppController.getUserGroups);

/**
 * @swagger
 * /api/v1/webapp/group/{groupId}/settings:
 *   get:
 *     summary: Get group settings
 *     description: Get moderation settings for a specific group
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group settings retrieved successfully
 *   put:
 *     summary: Update group settings
 *     description: Update moderation settings for a specific group
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Settings updated successfully
 */
router.get('/group/:groupId/settings', verifyTelegramWebApp, webAppController.getGroupSettingsWebApp);
router.put('/group/:groupId/settings', verifyTelegramWebApp, webAppController.updateGroupSettingsWebApp);

/**
 * @swagger
 * /api/v1/webapp/group/{groupId}/stats:
 *   get:
 *     summary: Get group moderation statistics
 *     description: Get moderation statistics for a specific group
 *     tags: [WebApp]
 *     security:
 *       - TelegramAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: week
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/group/:groupId/stats', verifyTelegramWebApp, webAppController.getGroupStats);

// New analytics endpoints
router.get('/group/:groupId/users', verifyTelegramWebApp, webAppController.getUserActivityStats);
router.get('/group/:groupId/patterns', verifyTelegramWebApp, webAppController.getActivityPatterns);
router.get('/group/:groupId/effectiveness', verifyTelegramWebApp, webAppController.getModerationEffectiveness);

/**
 * @swagger
 * /api/v1/webapp/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API is healthy and ready for WebApp connections
 *     tags: [WebApp]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 features:
 *                   type: object
 *                   properties:
 *                     webAppSupport:
 *                       type: boolean
 *                     cors:
 *                       type: boolean
 *                     rateLimit:
 *                       type: boolean
 */
router.get('/health', webAppController.healthCheck);

export default router;
