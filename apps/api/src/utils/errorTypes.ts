/**
 * @fileoverview Defines standardized error types and messages for the API
 */

export interface ErrorType {
  code: string;
  message: string;
  statusCode: number;
}

export const ERROR_TYPES = {
  // Authentication errors (401)
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    statusCode: 401,
  } as ErrorType,
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Invalid or expired token',
    statusCode: 401,
  } as ErrorType,
  TELEGRAM_AUTH_FAILED: {
    code: 'TELEGRAM_AUTH_FAILED',
    message: 'Telegram authentication failed',
    statusCode: 401,
  } as ErrorType,

  // Authorization errors (403)
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Insufficient permissions',
    statusCode: 403,
  } as ErrorType,
  GROUP_ACCESS_DENIED: {
    code: 'GROUP_ACCESS_DENIED',
    message: 'Access denied to this group',
    statusCode: 403,
  } as ErrorType,
  ADMIN_REQUIRED: {
    code: 'ADMIN_REQUIRED',
    message: 'Administrator privileges required',
    statusCode: 403,
  } as ErrorType,

  // Not found errors (404)
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    statusCode: 404,
  } as ErrorType,
  ENDPOINT_NOT_FOUND: {
    code: 'ENDPOINT_NOT_FOUND',
    message: 'API endpoint not found',
    statusCode: 404,
  } as ErrorType,
  GROUP_NOT_FOUND: {
    code: 'GROUP_NOT_FOUND',
    message: 'Group not found',
    statusCode: 404,
  } as ErrorType,
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: 'User not found',
    statusCode: 404,
  } as ErrorType,

  // Validation errors (400)
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    statusCode: 400,
  } as ErrorType,
  MISSING_REQUIRED_FIELD: {
    code: 'MISSING_REQUIRED_FIELD',
    message: 'Required field is missing',
    statusCode: 400,
  } as ErrorType,
  INVALID_FORMAT: {
    code: 'INVALID_FORMAT',
    message: 'Invalid data format',
    statusCode: 400,
  } as ErrorType,

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
    statusCode: 429,
  } as ErrorType,

  // Server errors (500)
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    statusCode: 500,
  } as ErrorType,
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database operation failed',
    statusCode: 500,
  } as ErrorType,
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporarily unavailable',
    statusCode: 503,
  } as ErrorType,
  NLP_SERVICE_ERROR: {
    code: 'NLP_SERVICE_ERROR',
    message: 'NLP service error',
    statusCode: 500,
  } as ErrorType,

  // Maintenance mode (503)
  MAINTENANCE_MODE: {
    code: 'MAINTENANCE_MODE',
    message: 'Service is under maintenance',
    statusCode: 503,
  } as ErrorType,
} as const;

export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};
