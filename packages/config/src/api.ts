export interface ApiConfig {
  port: number;
  host: string;
  jwtSecret: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export const apiConfig: ApiConfig = {
  port: parseInt(process.env.API_PORT || '3000'),
  host: process.env.API_HOST || 'localhost',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
};
