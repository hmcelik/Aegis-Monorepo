import { ERROR_TYPES, HTTP_STATUS_MESSAGES, ErrorType } from './errorTypes.js';

export interface ApiErrorJSON {
  status: 'error';
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    details?: any;
  };
}

class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details: any;
  public isOperational: boolean;
  public timestamp: string;

  constructor(
    statusCode: number,
    message: string,
    code: string | null = null,
    details: any = null,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || `HTTP_${statusCode}`;
    this.details = details;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  // Static methods for common error types
  static unauthorized(message: string = ERROR_TYPES.UNAUTHORIZED.message, details: any = null): ApiError {
    return new ApiError(401, message, ERROR_TYPES.UNAUTHORIZED.code, details);
  }

  static forbidden(message: string = ERROR_TYPES.FORBIDDEN.message, details: any = null): ApiError {
    return new ApiError(403, message, ERROR_TYPES.FORBIDDEN.code, details);
  }

  static notFound(message: string = ERROR_TYPES.NOT_FOUND.message, details: any = null): ApiError {
    return new ApiError(404, message, ERROR_TYPES.NOT_FOUND.code, details);
  }

  static badRequest(message: string = ERROR_TYPES.VALIDATION_ERROR.message, details: any = null): ApiError {
    return new ApiError(400, message, ERROR_TYPES.VALIDATION_ERROR.code, details);
  }

  static internal(message: string = ERROR_TYPES.INTERNAL_ERROR.message, details: any = null): ApiError {
    return new ApiError(500, message, ERROR_TYPES.INTERNAL_ERROR.code, details);
  }

  static rateLimited(message: string = ERROR_TYPES.RATE_LIMIT_EXCEEDED.message, details: any = null): ApiError {
    return new ApiError(429, message, ERROR_TYPES.RATE_LIMIT_EXCEEDED.code, details);
  }

  static serviceUnavailable(message: string = ERROR_TYPES.SERVICE_UNAVAILABLE.message, details: any = null): ApiError {
    return new ApiError(503, message, ERROR_TYPES.SERVICE_UNAVAILABLE.code, details);
  }

  // Create from error type
  static fromType(errorType: ErrorType, customMessage?: string, details: any = null): ApiError {
    return new ApiError(
      errorType.statusCode,
      customMessage || errorType.message,
      errorType.code,
      details
    );
  }

  // Convert to JSON for API responses
  toJSON(): ApiErrorJSON {
    return {
      status: 'error',
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export default ApiError;
