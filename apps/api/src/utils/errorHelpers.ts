import { Request, Response, NextFunction } from 'express';
import ApiError from './apiError.js';
import { ERROR_TYPES } from './errorTypes.js';

export interface ValidationDetail {
  field: string;
  message: string;
  value?: any;
}

export interface SuccessResponse {
  success: true;
  message: string;
  data: any;
  timestamp: string;
  meta?: any;
}

export interface LegacySuccessResponse {
  status: 'success';
  message: string;
  data: any;
  timestamp: string;
}

export interface PaginationMeta {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any> | any;

/**
 * Middleware to handle async route handlers and catch errors
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware to validate request data
 */
export const validateRequest = (schema: any, source: keyof Request = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const { error, value } = schema.validate(data, { abortEarly: false });

    if (error) {
      const details: ValidationDetail[] = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw ApiError.fromType(ERROR_TYPES.VALIDATION_ERROR, 'Request validation failed', details);
    }

    (req as any)[source] = value;
    next();
  };
};

/**
 * Middleware to check if service is in maintenance mode
 */
export const maintenanceCheck = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    throw ApiError.fromType(ERROR_TYPES.MAINTENANCE_MODE);
  }
  next();
};

/**
 * Create standardized success response
 * Ensures consistent API response format across all endpoints
 */
export const successResponse = (data: any, message: string = 'Success', meta: any = null): SuccessResponse => {
  const response: SuccessResponse = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
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
export const legacySuccessResponse = (data: any, message: string = 'Success'): LegacySuccessResponse => {
  return {
    status: 'success',
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Create paginated response
 */
export const paginatedResponse = (
  data: any,
  page: number | string,
  limit: number | string,
  total: number,
  message: string = 'Success'
): SuccessResponse => {
  const pageNum = parseInt(page.toString());
  const limitNum = parseInt(limit.toString());
  const totalPages = Math.ceil(total / limitNum);

  return successResponse(data, message, {
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  } as PaginationMeta);
};

/**
 * Handle database errors and convert to ApiError
 */
export const handleDatabaseError = (error: any): ApiError => {
  console.error('Database error:', error);

  if (error.code === 'SQLITE_CONSTRAINT') {
    return ApiError.badRequest('Data constraint violation', {
      type: 'constraint_error',
      details: error.message,
    });
  }

  if (error.code === 'SQLITE_BUSY') {
    return ApiError.serviceUnavailable('Database is busy, please try again');
  }

  return ApiError.fromType(ERROR_TYPES.DATABASE_ERROR, 'Database operation failed', {
    type: 'database_error',
    code: error.code,
  });
};

/**
 * Sanitize error for client response
 */
export const sanitizeError = (error: any): ApiError => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Don't expose internal errors in production
  if (isProduction && !error.isOperational) {
    return ApiError.internal();
  }

  return error;
};
