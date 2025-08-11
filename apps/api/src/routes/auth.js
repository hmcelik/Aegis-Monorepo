import express from 'express';
import * as authController from '../controllers/authController.js';
import { verifyTelegramAuth } from '../middleware/verifyTelegramAuth.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/auth/verify:
 *   post:
 *     summary: Verify Telegram authentication (Login Widget or Mini App)
 *     description: |
 *       Supports two authentication methods:
 *       1. Telegram Login Widget - for external websites
 *       2. Telegram Mini App initData - for Mini Apps
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 title: Login Widget Data
 *                 description: Data from Telegram Login Widget
 *                 properties:
 *                   id:
 *                     type: number
 *                     description: Telegram user ID
 *                   first_name:
 *                     type: string
 *                     description: User's first name
 *                   username:
 *                     type: string
 *                     description: User's username (optional)
 *                   photo_url:
 *                     type: string
 *                     description: User's photo URL (optional)
 *                   auth_date:
 *                     type: number
 *                     description: Authentication timestamp
 *                   hash:
 *                     type: string
 *                     description: Authentication hash from Telegram
 *                 required: [id, first_name, auth_date, hash]
 *               - type: object
 *                 title: Mini App Data
 *                 description: Data from Telegram Mini App
 *                 properties:
 *                   initData:
 *                     type: string
 *                     description: Raw initData string from Telegram Mini App
 *                 required: [initData]
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
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     first_name:
 *                       type: string
 *                     username:
 *                       type: string
 *                     photo_url:
 *                       type: string
 *                     auth_date:
 *                       type: number
 *       400:
 *         description: Invalid request format
 *       401:
 *         description: Authentication failed
 */
router.post('/verify', verifyTelegramAuth, authController.verify);

/**
 * @swagger
 * /api/v1/auth/login-widget:
 *   post:
 *     summary: Authenticate using Telegram Login Widget (External Websites)
 *     description: |
 *       Dedicated endpoint for Telegram Login Widget authentication.
 *       Use this for external websites that implement the Telegram Login Widget.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: number
 *                 description: Telegram user ID
 *               first_name:
 *                 type: string
 *                 description: User's first name
 *               last_name:
 *                 type: string
 *                 description: User's last name (optional)
 *               username:
 *                 type: string
 *                 description: User's username (optional)
 *               photo_url:
 *                 type: string
 *                 description: User's photo URL (optional)
 *               auth_date:
 *                 type: number
 *                 description: Authentication timestamp
 *               hash:
 *                 type: string
 *                 description: Authentication hash from Telegram
 *             required: [id, first_name, auth_date, hash]
 *     responses:
 *       200:
 *         description: Authentication successful, returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                   description: JWT token for API access
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     username:
 *                       type: string
 *                     photo_url:
 *                       type: string
 *       400:
 *         description: Invalid login widget data
 *       401:
 *         description: Authentication failed
 */
router.post('/login-widget', verifyTelegramAuth, authController.loginWidget);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     description: Refresh an existing JWT token to extend its validity
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
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
 *                   example: "Token refreshed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: New JWT token
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Invalid or expired token
 */
router.post('/refresh', authController.refreshToken);

/**
 * @swagger
 * /api/v1/auth/verify-token:
 *   get:
 *     summary: Verify JWT token
 *     description: Verify if the current JWT token is valid and return user info
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
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
 *                   example: "Token is valid"
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       example: true
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         first_name:
 *                           type: string
 *                         username:
 *                           type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Invalid or expired token
 */
router.get('/verify-token', authController.verifyToken);

export default router;