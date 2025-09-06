import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { initializeDatabase } from '@telegram-moderator/shared/src/services/database.js';
import logger from '@telegram-moderator/shared/src/services/logger.js';
import authRoutes from './routes/auth.js';
import unifiedGroupRoutes from './routes/unifiedGroups.js';
import webAppRoutes from './routes/webapp.js';
import nlpRoutes from './routes/nlp.js';
import systemRoutes from './routes/system.js';
import logsRoutes from './routes/logs.js';
import billingRoutes from './routes/billing.js';
import * as systemController from './controllers/systemController.js';
import errorResponder from './utils/errorResponder.js';
import ApiError from './utils/apiError.js';
import { ERROR_TYPES } from './utils/errorTypes.js';
import { maintenanceCheck } from './utils/errorHelpers.js';

const app = express();

// Trust proxy settings for deployment behind reverse proxies (Vercel, etc.)
// This is needed for proper rate limiting and IP detection
const trustProxy = process.env.TRUST_PROXY === 'true' || 
                   process.env.TRUST_PROXY === '1' || 
                   process.env.NODE_ENV === 'production';

app.set('trust proxy', trustProxy);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://web.telegram.org"],
            scriptSrc: ["'self'", "https://web.telegram.org"],
            imgSrc: ["'self'", "data:", "https://web.telegram.org"],
            connectSrc: ["'self'", "https://api.telegram.org"],
            frameSrc: ["https://web.telegram.org"],
        },
    },
}));

// Enhanced CORS configuration for Telegram Mini Apps and external websites
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests from Telegram WebApp
        const allowedOrigins = [
            'https://web.telegram.org',
            'https://t.me',
            'https://aegis-monorepo.vercel.app',
            'https://telegram-moderator-dashboard.vercel.app/',
            process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
            'http://localhost:8080', // For local development server
            'http://localhost:5173', // For Vite development server
            // Add your production domains here
        ];

        // Add additional allowed origins from environment variable
        if (process.env.ADDITIONAL_ALLOWED_ORIGINS) {
            const additionalOrigins = process.env.ADDITIONAL_ALLOWED_ORIGINS
                .split(',')
                .map(origin => origin.trim())
                .filter(origin => origin);
            allowedOrigins.push(...additionalOrigins);
        }
        
        // In development, allow all localhost origins
        if (process.env.NODE_ENV === 'development' && origin && origin.startsWith('http://localhost')) {
            return callback(null, true);
        }
        
        // Allow ngrok tunnels (for development/testing)
        if (origin && origin.match(/^https:\/\/.*\.ngrok-free\.app$/)) {
            return callback(null, true);
        }
        
        // Allow requests with no origin (like mobile apps, curl requests, or file://)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // Instead of throwing an error, deny the request by returning false
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Telegram-Init-Data',
        'ngrok-skip-browser-warning', // ngrok header
        'X-Requested-With'            // Common for AJAX requests
    ],
    credentials: true,
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Middleware to handle ngrok-specific requirements
app.use((req, res, next) => {
    // Add ngrok skip browser warning header to all responses
    res.header('ngrok-skip-browser-warning', 'true');
    
    // Handle preflight requests for ngrok
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Init-Data, ngrok-skip-browser-warning, X-Requested-With');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.status(200).end();
    }
    
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests from this IP, please try again later.',
            statusCode: 429,
            timestamp: new Date().toISOString()
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health checks and docs, and in development for localhost
    skip: (req) => {
        const skipPaths = ['/api/v1/health', '/api/docs', '/'];
        if (skipPaths.includes(req.path)) {
            return true;
        }
        
        // Skip rate limiting in development for localhost
        if (process.env.NODE_ENV === 'development') {
            const isLocalhost = req.ip === '127.0.0.1' || 
                               req.ip === '::1' || 
                               req.ip === '::ffff:127.0.0.1' ||
                               req.hostname === 'localhost';
            return isLocalhost;
        }
        
        return false;
    },
    // Validate proxy headers only when behind a proxy
    validate: {
        xForwardedForHeader: trustProxy
    },
    handler: (req, res) => {
        throw ApiError.fromType(ERROR_TYPES.RATE_LIMIT_EXCEEDED);
    }
});

app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5, // Limit each IP to 5 auth requests per windowMs
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts, please try again later.',
            statusCode: 429,
            timestamp: new Date().toISOString()
        }
    },
    // Skip rate limiting in development for localhost
    skip: (req) => {
        if (process.env.NODE_ENV === 'development') {
            const isLocalhost = req.ip === '127.0.0.1' || 
                               req.ip === '::1' || 
                               req.ip === '::ffff:127.0.0.1' ||
                               req.hostname === 'localhost';
            return isLocalhost;
        }
        return false;
    },
    // Validate proxy headers only when behind a proxy
    validate: {
        xForwardedForHeader: trustProxy
    },
    handler: (req, res) => {
        throw ApiError.fromType(ERROR_TYPES.RATE_LIMIT_EXCEEDED, 'Too many authentication attempts');
    }
});

app.use('/api/v1/auth', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger JSDoc configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Telegram Moderator Bot API',
      version: '2.0.0',
      description: 'Enhanced REST API for Telegram Moderation Bot with comprehensive analytics, logging system, and strike management',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Production API Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for API authentication',
        },
        TelegramAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Telegram WebApp authentication data',
        },
      },
    },
  },
  apis: ['./src/api/routes/*.js', './src/api/controllers/*.js', './src/api/server.js'],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));

// Global maintenance check middleware
app.use(maintenanceCheck);

// Root endpoint - API information
/**
 * @swagger
 * /:
 *   get:
 *     summary: API Information
 *     description: Get basic information about the Telegram Moderator Bot API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "Telegram Moderator Bot API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 status:
 *                   type: string
 *                   example: "running"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     health:
 *                       type: string
 *                       example: "/api/v1/health"
 *                     docs:
 *                       type: string
 *                       example: "/api/docs"
 *                     auth:
 *                       type: string
 *                       example: "/api/v1/auth"
 *                     groups:
 *                       type: string
 *                       example: "/api/v1/groups"
 *                     strikes:
 *                       type: string
 *                       example: "/api/v1/groups/{groupId}/users/{userId}/strikes"
 *                     webapp:
 *                       type: string
 *                       example: "/api/v1/webapp"
 *                     nlp:
 *                       type: string
 *                       example: "/api/v1/nlp"
 *                 documentation:
 *                   type: string
 *                   example: "http://localhost:3000/api/docs"
 */
app.get('/', systemController.getApiInfo);

// Handle OPTIONS requests for health endpoints explicitly
app.options('/api/v1/health', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).send();
});

// Stricter rate limiting for auth endpoints
app.use('/api/v1/auth', authLimiter);

app.use('/api/v1', systemRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/groups', unifiedGroupRoutes); // Unified API with both auth methods
app.use('/api/v1/webapp', webAppRoutes); // Keep for backward compatibility (deprecated)
app.use('/api/v1/nlp', nlpRoutes);
app.use('/api/v1/logs', logsRoutes);
app.use('/api/v1/billing', billingRoutes);

// 404 handler for API endpoints
app.use('/api', (req, res, next) => {
    next(ApiError.fromType(ERROR_TYPES.ENDPOINT_NOT_FOUND, `API endpoint ${req.method} ${req.path} not found`));
});

// Global 404 handler
app.use((req, res, next) => {
    next(ApiError.fromType(ERROR_TYPES.NOT_FOUND, `Resource ${req.path} not found`));
});

// Global error handler
app.use(errorResponder);

const startServer = async () => {
    try {
        await initializeDatabase();
        logger.info('Database initialized for API server.');
        const PORT = process.env.API_PORT || 3000;
        app.listen(PORT, () => {
            logger.info(`🚀 API Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start API server:', error);
        process.exit(1);
    }
};

// This check prevents the server from starting during tests
if (process.env.NODE_ENV !== 'test') {
    startServer();
}

// Export the app for supertest
export default app;
