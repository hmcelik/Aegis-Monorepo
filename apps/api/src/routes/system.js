import express from 'express';
import * as systemController from '../controllers/systemController.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Health Check
 *     description: Check if the API is healthy and operational
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy
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
 *                   example: "Service is healthy"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     service:
 *                       type: string
 *                       example: "telegram-moderator-bot-api"
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     uptime:
 *                       type: number
 *                       description: Uptime in seconds
 *                       example: 3600
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: number
 *                           description: Used heap memory in bytes
 *                         total:
 *                           type: number
 *                           description: Total heap memory in bytes
 *                         external:
 *                           type: number
 *                           description: External memory in bytes
 *                     environment:
 *                       type: string
 *                       example: "production"
 */
router.get('/health', systemController.healthCheck);

/**
 * @swagger
 * /api/v1/status:
 *   get:
 *     summary: Detailed System Status
 *     description: Get comprehensive system status including database, memory, and feature status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System status retrieved successfully
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
 *                   example: "System status retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     service:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         version:
 *                           type: string
 *                         status:
 *                           type: string
 *                         uptime:
 *                           type: number
 *                         startTime:
 *                           type: string
 *                           format: date-time
 *                     system:
 *                       type: object
 *                       properties:
 *                         platform:
 *                           type: string
 *                         arch:
 *                           type: string
 *                         nodeVersion:
 *                           type: string
 *                         memory:
 *                           type: object
 *                           properties:
 *                             heapUsed:
 *                               type: number
 *                               description: Used heap memory in MB
 *                             heapTotal:
 *                               type: number
 *                               description: Total heap memory in MB
 *                             external:
 *                               type: number
 *                               description: External memory in MB
 *                             rss:
 *                               type: number
 *                               description: Resident Set Size in MB
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [connected, error, unknown]
 *                         tables:
 *                           type: number
 *                         auditLogs:
 *                           type: number
 *                         groups:
 *                           type: number
 *                         users:
 *                           type: number
 *                     features:
 *                       type: object
 *                       properties:
 *                         authentication:
 *                           type: boolean
 *                         rateLimit:
 *                           type: boolean
 *                         cors:
 *                           type: boolean
 *                         swagger:
 *                           type: boolean
 *                         webAppSupport:
 *                           type: boolean
 *                         nlpProcessing:
 *                           type: boolean
 *                         auditLogging:
 *                           type: boolean
 *                     environment:
 *                       type: object
 *                       properties:
 *                         nodeEnv:
 *                           type: string
 *                         port:
 *                           type: number
 *                         timezone:
 *                           type: string
 *       500:
 *         description: Failed to retrieve system status
 */
router.get('/status', systemController.getStatus);

/**
 * @swagger
 * /api/v1/info:
 *   get:
 *     summary: API Information
 *     description: Get comprehensive API information including available endpoints and features
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information retrieved successfully
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
 *                   example: "API information retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Telegram Moderator Bot API"
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     description:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "running"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     documentation:
 *                       type: string
 *                       example: "http://localhost:3000/api/docs"
 *                     endpoints:
 *                       type: object
 *                       properties:
 *                         system:
 *                           type: object
 *                           properties:
 *                             health:
 *                               type: string
 *                             status:
 *                               type: string
 *                             info:
 *                               type: string
 *                         authentication:
 *                           type: object
 *                         webapp:
 *                           type: object
 *                         groups:
 *                           type: object
 *                         strikes:
 *                           type: object
 *                         nlp:
 *                           type: object
 *                     supportedFeatures:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/info', systemController.getApiInfo);

/**
 * @swagger
 * /api/v1/metrics:
 *   get:
 *     summary: System Metrics
 *     description: Get system and application metrics including database statistics and performance data
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
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
 *                   example: "Metrics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         totalAuditLogs:
 *                           type: number
 *                           example: 1250
 *                         recentAuditLogs24h:
 *                           type: number
 *                           example: 45
 *                         totalGroups:
 *                           type: number
 *                           example: 12
 *                         totalUsers:
 *                           type: number
 *                           example: 150
 *                         totalStrikes:
 *                           type: number
 *                           example: 89
 *                     moderation:
 *                       type: object
 *                       properties:
 *                         topViolationTypes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                               count:
 *                                 type: number
 *                     system:
 *                       type: object
 *                       properties:
 *                         uptime:
 *                           type: number
 *                         memoryUsage:
 *                           type: object
 *                           properties:
 *                             heapUsedMB:
 *                               type: number
 *                             heapTotalMB:
 *                               type: number
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *       500:
 *         description: Failed to retrieve metrics
 */
router.get('/metrics', systemController.getMetrics);

export default router;
