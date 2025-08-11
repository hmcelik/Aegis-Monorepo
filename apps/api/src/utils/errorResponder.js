import logger from '@telegram-moderator/shared/services/logger.js';
import { ERROR_TYPES, HTTP_STATUS_MESSAGES } from './errorTypes.js';

const errorResponder = (err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Default error structure
    let errorResponse = {
        status: 'error',
        error: {
            code: err.code || `HTTP_${err.statusCode || 500}`,
            message: err.message || 'Internal Server Error',
            statusCode: err.statusCode || 500,
            timestamp: new Date().toISOString()
        }
    };

    // Handle different error types
    if (err.name === 'ValidationError') {
        errorResponse.error.code = 'VALIDATION_ERROR';
        errorResponse.error.statusCode = 400;
        errorResponse.error.message = 'Validation failed';
        if (err.details) {
            errorResponse.error.details = err.details;
        }
    } else if (err.name === 'CastError') {
        errorResponse.error.code = 'INVALID_FORMAT';
        errorResponse.error.statusCode = 400;
        errorResponse.error.message = 'Invalid data format';
    } else if (err.code === 'LIMIT_FILE_SIZE') {
        errorResponse.error.code = 'FILE_TOO_LARGE';
        errorResponse.error.statusCode = 413;
        errorResponse.error.message = 'File size too large';
    }

    // For non-operational errors in production, use generic message
    if (isProduction && !err.isOperational) {
        errorResponse.error.code = 'INTERNAL_ERROR';
        errorResponse.error.message = 'Internal server error';
        errorResponse.error.statusCode = 500;
        // Remove details in production for security
        delete errorResponse.error.details;
    }

    // Add request context for better debugging
    const requestContext = {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString()
    };

    // Enhanced logging based on error severity
    const logData = {
        error: {
            message: err.message,
            code: errorResponse.error.code,
            statusCode: errorResponse.error.statusCode,
            ...(err.details && { details: err.details })
        },
        request: requestContext,
        ...(isDevelopment && { stack: err.stack })
    };

    // Log based on severity
    if (errorResponse.error.statusCode >= 500) {
        logger.error('Server Error', logData);
    } else if (errorResponse.error.statusCode >= 400) {
        logger.warn('Client Error', logData);
    } else {
        logger.info('Request Error', logData);
    }

    // Add development-specific information
    if (isDevelopment) {
        errorResponse.error.stack = err.stack;
        errorResponse.request = {
            method: req.method,
            url: req.originalUrl,
            headers: req.headers,
            body: req.body
        };
    }

    // Handle specific status codes
    const statusCode = errorResponse.error.statusCode;
    
    // Set appropriate headers
    if (statusCode === 429) {
        res.set('Retry-After', '900'); // 15 minutes
    }

    if (statusCode === 503) {
        res.set('Retry-After', '3600'); // 1 hour
    }

    res.status(statusCode).json(errorResponse);
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack
    });
    
    // Graceful shutdown
    process.exit(1);
});

export default errorResponder;