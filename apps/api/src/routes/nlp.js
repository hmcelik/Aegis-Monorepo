import express from 'express';
import * as nlpController from '../controllers/nlpController.js';
import { checkJwt } from '../middleware/checkJwt.js';
import { body } from 'express-validator';

const router = express.Router();

// All NLP routes require a valid JWT
router.use(checkJwt);

/**
 * @swagger
 * /api/v1/nlp/status:
 *   get:
 *     summary: Get NLP service status
 *     description: Check the status and health of the NLP processing services
 *     tags: [NLP]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: NLP service status information
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
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     spamDetection:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         model:
 *                           type: string
 *                     profanityDetection:
 *                       type: object
 *                       properties:
 *                         enabled:
 *                           type: boolean
 *                         dictionaries:
 *                           type: array
 *                           items:
 *                             type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/status', nlpController.getNLPStatus);

/**
 * @swagger
 * /api/v1/nlp/test/spam:
 *   post:
 *     summary: Test spam detection
 *     description: Test the spam detection algorithm on a piece of text
 *     tags: [NLP]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *                 description: Text to analyze for spam
 *                 example: "Check out this amazing offer! Click here now!"
 *               whitelistedKeywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Keywords to whitelist (optional)
 *                 example: ["offer", "click"]
 *             required: [text]
 *     responses:
 *       200:
 *         description: Spam detection results
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
 *                     isSpam:
 *                       type: boolean
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *                       maximum: 1
 *                     keywords:
 *                       type: array
 *                       items:
 *                         type: string
 *                     whitelisted:
 *                       type: boolean
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/test/spam',
    body('text').isString().isLength({ min: 1, max: 4000 }),
    body('whitelistedKeywords').optional().isArray(),
    nlpController.testSpamDetection
);

/**
 * @swagger
 * /api/v1/nlp/test/profanity:
 *   post:
 *     summary: Test profanity detection
 *     description: Test the profanity detection algorithm on a piece of text
 *     tags: [NLP]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *                 description: Text to analyze for profanity
 *                 example: "This is a clean message"
 *             required: [text]
 *     responses:
 *       200:
 *         description: Profanity detection results
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
 *                     hasProfanity:
 *                       type: boolean
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *                       maximum: 1
 *                     detectedWords:
 *                       type: array
 *                       items:
 *                         type: string
 *                     severity:
 *                       type: string
 *                       enum: [mild, moderate, severe]
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/test/profanity',
    body('text').isString().isLength({ min: 1, max: 4000 }),
    nlpController.testProfanityDetection
);

/**
 * @swagger
 * /api/v1/nlp/analyze:
 *   post:
 *     summary: Complete message analysis
 *     description: Perform comprehensive analysis including spam and profanity detection
 *     tags: [NLP]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *                 description: Text to analyze
 *                 example: "Hey everyone, check out this amazing deal!"
 *               whitelistedKeywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Keywords to whitelist (optional)
 *                 example: ["deal", "amazing"]
 *               groupId:
 *                 type: string
 *                 description: Group ID for context-specific analysis (optional)
 *                 example: "-1001234567890"
 *             required: [text]
 *     responses:
 *       200:
 *         description: Complete analysis results
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
 *                     spam:
 *                       type: object
 *                       properties:
 *                         isSpam:
 *                           type: boolean
 *                         confidence:
 *                           type: number
 *                         keywords:
 *                           type: array
 *                           items:
 *                             type: string
 *                     profanity:
 *                       type: object
 *                       properties:
 *                         hasProfanity:
 *                           type: boolean
 *                         confidence:
 *                           type: number
 *                         detectedWords:
 *                           type: array
 *                           items:
 *                             type: string
 *                         severity:
 *                           type: string
 *                     classification:
 *                       type: object
 *                       properties:
 *                         violationType:
 *                           type: string
 *                           enum: [SPAM, PROFANITY, CLEAN]
 *                         overallScore:
 *                           type: number
 *                         shouldFlag:
 *                           type: boolean
 *                         reason:
 *                           type: string
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/analyze',
    body('text').isString().isLength({ min: 1, max: 4000 }),
    body('whitelistedKeywords').optional().isArray(),
    body('groupId').optional().isString(),
    nlpController.analyzeMessageEndpoint
);

export default router;
