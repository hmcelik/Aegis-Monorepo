import { ERROR_TYPES, HTTP_STATUS_MESSAGES } from './errorTypes.js';

class ApiError extends Error {
    constructor(statusCode, message, code = null, details = null, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.code = code || `HTTP_${statusCode}`;
        this.details = details;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }

    // Static methods for common error types
    static unauthorized(message = ERROR_TYPES.UNAUTHORIZED.message, details = null) {
        return new ApiError(401, message, ERROR_TYPES.UNAUTHORIZED.code, details);
    }

    static forbidden(message = ERROR_TYPES.FORBIDDEN.message, details = null) {
        return new ApiError(403, message, ERROR_TYPES.FORBIDDEN.code, details);
    }

    static notFound(message = ERROR_TYPES.NOT_FOUND.message, details = null) {
        return new ApiError(404, message, ERROR_TYPES.NOT_FOUND.code, details);
    }

    static badRequest(message = ERROR_TYPES.VALIDATION_ERROR.message, details = null) {
        return new ApiError(400, message, ERROR_TYPES.VALIDATION_ERROR.code, details);
    }

    static internal(message = ERROR_TYPES.INTERNAL_ERROR.message, details = null) {
        return new ApiError(500, message, ERROR_TYPES.INTERNAL_ERROR.code, details);
    }

    static rateLimited(message = ERROR_TYPES.RATE_LIMIT_EXCEEDED.message, details = null) {
        return new ApiError(429, message, ERROR_TYPES.RATE_LIMIT_EXCEEDED.code, details);
    }

    static serviceUnavailable(message = ERROR_TYPES.SERVICE_UNAVAILABLE.message, details = null) {
        return new ApiError(503, message, ERROR_TYPES.SERVICE_UNAVAILABLE.code, details);
    }

    // Create from error type
    static fromType(errorType, customMessage = null, details = null) {
        return new ApiError(
            errorType.statusCode,
            customMessage || errorType.message,
            errorType.code,
            details
        );
    }

    // Convert to JSON for API responses
    toJSON() {
        return {
            status: 'error',
            error: {
                code: this.code,
                message: this.message,
                statusCode: this.statusCode,
                timestamp: this.timestamp,
                ...(this.details && { details: this.details })
            }
        };
    }
}

export default ApiError;