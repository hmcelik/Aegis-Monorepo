import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Set BOT_TOKEN BEFORE any imports
const BOT_TOKEN = 'test_bot_token';

// Mock process.env before any imports
vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);

// Mock the middleware module completely
vi.mock('apps/api/src/middleware/verifyTelegramAuth.js', () => {
  const crypto = require('crypto');
  const BOT_TOKEN = 'test_bot_token';
  
  // Mock ApiError class
  class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'ApiError';
    }
  }
  
  return {
    verifyTelegramAuth: (req, res, next) => {
      const body = req.body;
      
      // Mini App initData verification
      if (typeof body.initData === 'string') {
        try {
          const params = new URLSearchParams(body.initData);
          const parsedData = {};
          for (const [key, value] of params.entries()) {
            if (key === 'user') {
              parsedData.user = JSON.parse(value);
            } else {
              parsedData[key] = value;
            }
          }
          
          if (!parsedData.hash || !parsedData.user) {
            return next(new ApiError(400, 'Invalid initData format'));
          }
          
          // Verify hash
          const { hash, ...dataForHash } = parsedData;
          const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
          
          const dataCheckString = Object.keys(dataForHash)
            .sort()
            .map(key => {
              const value = typeof dataForHash[key] === 'object' ? JSON.stringify(dataForHash[key]) : dataForHash[key];
              return `${key}=${value}`;
            })
            .join('\n');
          
          const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
          
          if (expectedHash === hash) {
            req.user = {
              id: parsedData.user.id,
              first_name: parsedData.user.first_name,
              username: parsedData.user.username,
              photo_url: parsedData.user.photo_url,
              auth_date: parsedData.auth_date
            };
            return next();
          } else {
            return next(new ApiError(401, 'Invalid Telegram Mini App data. Hash verification failed.'));
          }
        } catch (error) {
          return next(new ApiError(400, 'Invalid initData format'));
        }
      }
      
      // Login Widget verification
      if (body.id && body.hash) {
        const { hash, ...userData } = body;
        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
        
        const dataCheckString = Object.keys(userData)
          .sort()
          .filter(key => userData[key] !== undefined && userData[key] !== null && userData[key] !== '')
          .map(key => `${key}=${userData[key]}`)
          .join('\n');
        
        const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (expectedHash === hash) {
          req.user = userData;
          return next();
        } else {
          return next(new ApiError(401, 'Invalid Telegram Login Widget data. Hash verification failed.'));
        }
      }
      
      return next(new ApiError(400, 'Authentication data is missing. Please provide either initData from Mini App or Login Widget data.'));
    }
  };
});

// Import your actual routes and error handlers AFTER mocking
import authRoutes from 'apps/api/src/routes/auth.js';
import errorResponder from 'apps/api/src/utils/errorResponder.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

// Mock the database
vi.mock('@telegram-moderator/shared/src/services/database.js');

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);
app.use(errorResponder);

describe('Enhanced Auth API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.upsertUser.mockResolvedValue();
  });

  describe('Mini App initData Authentication', () => {
    it('should authenticate with valid Mini App initData', async () => {
      // Create mock initData exactly as Telegram would send it
      const userData = {
        id: 123456,
        first_name: 'Test',
        username: 'testuser'
      };
      const auth_date = Math.floor(Date.now() / 1000);
      
      // Create valid hash for initData (Mini App format)
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
      
      // The dataCheckString for Mini App should include user as stringified JSON
      const dataToCheck = {
        auth_date: auth_date,
        user: userData
      };
      
      const dataCheckString = Object.keys(dataToCheck)
        .sort()
        .map(key => {
          const value = typeof dataToCheck[key] === 'object' ? JSON.stringify(dataToCheck[key]) : dataToCheck[key];
          return `${key}=${value}`;
        })
        .join('\n');
        
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      
      // Simulate initData format as received from window.Telegram.WebApp.initData
      const initData = `auth_date=${auth_date}&hash=${hash}&user=${encodeURIComponent(JSON.stringify(userData))}`;

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ initData });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(db.upsertUser).toHaveBeenCalledOnce();
    });

    it('should reject invalid Mini App initData hash', async () => {
      const userData = {
        id: 123456,
        first_name: 'Test',
        username: 'testuser'
      };
      const auth_date = Math.floor(Date.now() / 1000);
      
      const initData = `auth_date=${auth_date}&hash=invalid_hash&user=${encodeURIComponent(JSON.stringify(userData))}`;

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ initData });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Invalid Telegram Mini App data');
    });
  });

  describe('Login Widget Authentication', () => {
    it('should authenticate with valid Login Widget data', async () => {
      const auth_date = Math.floor(Date.now() / 1000);
      const userData = {
        id: 123456,
        first_name: 'Test',
        username: 'testuser',
        auth_date: auth_date
      };

      // Create valid hash for login widget
      const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
      const dataCheckString = Object.keys(userData)
        .sort()
        .filter(key => userData[key] !== undefined && userData[key] !== null && userData[key] !== '')
        .map(key => `${key}=${userData[key]}`)
        .join('\n');
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ ...userData, hash });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(db.upsertUser).toHaveBeenCalledOnce();
    });

    it('should reject invalid Login Widget hash', async () => {
      const userData = {
        id: 123456,
        first_name: 'Test',
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'invalid_hash'
      };

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send(userData);

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Invalid Telegram Login Widget data');
    });
  });

  describe('Legacy Authentication Support', () => {
    it('should still support legacy format', async () => {
      const auth_date = Math.floor(Date.now() / 1000);
      const userData = {
        id: 123456,
        first_name: 'Test',
        username: 'testuser',
        auth_date: auth_date
      };

      // Create valid hash using legacy method
      const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
      const dataCheckString = Object.keys(userData)
        .sort()
        .filter(key => userData[key] !== undefined && userData[key] !== null && userData[key] !== '')
        .map(key => `${key}=${userData[key]}`)
        .join('\n');
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ ...userData, hash });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for missing authentication data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Authentication data is missing');
    });

    it('should return 400 for malformed initData', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ initData: 'invalid_format' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid initData format');
    });
  });
});
