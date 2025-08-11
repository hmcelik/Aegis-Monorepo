import express from 'express';
import * as logsController from '../controllers/logsController.js';
import { checkJwt } from '../middleware/checkJwt.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     LogEntry:
 *       type: object
 *       properties:
 *         timestamp:
 *           type: string
 *           format: date-time
 *         level:
 *           type: string
 *           enum: [error, warn, info, debug]
 *         message:
 *           type: string
 *         meta:
 *           type: object
 *         
 * /api/v1/logs:
 *   get:
 *     summary: Get system logs
 *     description: Retrieve system logs with filtering and pagination
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [error, warn, info, debug]
 *         description: Filter by log level
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of log entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of log entries to skip
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for log filtering
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for log filtering
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LogEntry'
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 */
router.get('/', checkJwt, logsController.getLogs);

/**
 * @swagger
 * /api/v1/logs/download:
 *   get:
 *     summary: Download logs
 *     description: Download system logs as a file
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, txt]
 *           default: txt
 *         description: Download format
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [error, warn, info, debug]
 *         description: Filter by log level
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for log filtering
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for log filtering
 *     responses:
 *       200:
 *         description: Log file download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/download', checkJwt, logsController.downloadLogs);

/**
 * @swagger
 * /api/v1/logs/stats:
 *   get:
 *     summary: Get log statistics
 *     description: Get statistics about log entries by level and time period
 *     tags: [Logs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Log statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     byLevel:
 *                       type: object
 *                       properties:
 *                         error:
 *                           type: integer
 *                         warn:
 *                           type: integer
 *                         info:
 *                           type: integer
 *                         debug:
 *                           type: integer
 *                     byTime:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           count:
 *                             type: integer
 */
router.get('/stats', checkJwt, logsController.getLogStats);

export default router;
