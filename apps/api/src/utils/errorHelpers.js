import ApiError from './apiError.js';
import { ERROR_TYPES } from './errorTypes.js';

/**
 * Middleware to handle async route handlers and catch errors
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware to validate request data
 */
export const validateRequest = (schema, source = 'body') => {
    return (req, res, next) => {
        const data = req[source];
        const { error, value } = schema.validate(data, { abortEarly: false });
        
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));
            
            throw ApiError.fromType(ERROR_TYPES.VALIDATION_ERROR, 'Request validation failed', details);
        }
        
        req[source] = value;
        next();
    };
};

/**
 * Middleware to check if service is in maintenance mode
 */
export const maintenanceCheck = (req, res, next) => {
    if (process.env.MAINTENANCE_MODE === 'true') {
        throw ApiError.fromType(ERROR_TYPES.MAINTENANCE_MODE);
    }
    next();
};

/**
 * Create standardized success response
 * Ensures consistent API response format across all endpoints
 */
export const successResponse = (data, message = 'Success', meta = null) => {
    const response = {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
    
    if (meta) {
        response.meta = meta;
    }
    
    return response;
};

/**
 * Create standardized success response (legacy format for backward compatibility)
 * @deprecated Use successResponse instead
 */
export const legacySuccessResponse = (data, message = 'Success') => {
    return {
        status: 'success',
        message,
        data,
        timestamp: new Date().toISOString()
    };
};

/**
 * Create paginated response
 */
export const paginatedResponse = (data, page, limit, total, message = 'Success') => {
    const totalPages = Math.ceil(total / limit);
    
    return successResponse(data, message, {
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    });
};

/**
 * Handle database errors and convert to ApiError
 */
export const handleDatabaseError = (error) => {
    console.error('Database error:', error);
    
    if (error.code === 'SQLITE_CONSTRAINT') {
        return ApiError.badRequest('Data constraint violation', {
            type: 'constraint_error',
            details: error.message
        });
    }
    
    if (error.code === 'SQLITE_BUSY') {
        return ApiError.serviceUnavailable('Database is busy, please try again');
    }
    
    return ApiError.fromType(ERROR_TYPES.DATABASE_ERROR, 'Database operation failed', {
        type: 'database_error',
        code: error.code
    });
};

/**
 * Sanitize error for client response
 */
export const sanitizeError = (error) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Don't expose internal errors in production
    if (isProduction && !error.isOperational) {
        return ApiError.internal();
    }
    
    return error;
};
