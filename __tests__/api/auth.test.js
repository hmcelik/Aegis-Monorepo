import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Import your actual routes and error handlers
import authRoutes from 'apps/api/src/routes/auth.js';
import errorResponder from 'apps/api/src/utils/errorResponder.js';
import * as db from '@telegram-moderator/shared/services/database.js';

// Mock the middleware and services
vi.mock('apps/api/src/middleware/verifyTelegramAuth.js', () => ({
  verifyTelegramAuth: (req, res, next) => {
    // Simulate successful Telegram verification
    if (req.body.hash === 'valid_hash') {
      req.user = { id: '12345', first_name: 'Test', username: 'testuser' };
      return next();
    }
    // Simulate failed verification
    res.status(401).json({ message: 'Invalid hash' });
  }
}));

vi.mock('@telegram-moderator/shared/services/database.js');

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);
app.use(errorResponder);

describe('Auth API Endpoints', () => {

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('POST /auth/verify - should return a JWT for valid Telegram data', async () => {
    const validTelegramData = {
      id: 12345,
      first_name: 'Test',
      username: 'testuser',
      auth_date: Date.now() / 1000,
      hash: 'valid_hash'
    };

    // Mock the database function
    db.upsertUser.mockResolvedValue();

    const response = await request(app)
      .post('/api/v1/auth/verify')
      .send(validTelegramData);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(db.upsertUser).toHaveBeenCalledOnce();
  });

  it('POST /auth/verify - should return 401 for invalid Telegram data', async () => {
    const invalidTelegramData = {
      id: 12345,
      hash: 'invalid_hash'
    };

    const response = await request(app)
      .post('/api/v1/auth/verify')
      .send(invalidTelegramData);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid hash');
    expect(db.upsertUser).not.toHaveBeenCalled();
  });
});
