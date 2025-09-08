import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';

import { checkJwt } from 'apps/api/src/middleware/checkJwt.js';
import { checkGroupAdmin } from 'apps/api/src/middleware/checkGroupAdmin.js';
import { verifyTelegramAuth } from 'apps/api/src/middleware/verifyTelegramAuth.js';

// Mock dependencies
vi.mock('apps/api/src/services/tokenService.js', () => ({
  verifyToken: vi.fn(),
  generateToken: vi.fn(),
}));

vi.mock('axios');

vi.mock('@telegram-moderator/shared/src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('API Middleware', () => {
  let app;
  const JWT_SECRET = 'test-secret';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    vi.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  describe('JWT Authentication Middleware', () => {
    it('should accept valid JWT tokens', async () => {
      const validToken = jwt.sign({ id: 123 }, JWT_SECRET);

      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockReturnValue({ id: 123 });

      app.get('/protected', checkJwt, (req, res) => {
        res.json({ success: true, userId: req.user.id });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(123);
    });

    it('should reject requests without tokens', async () => {
      app.get('/protected', checkJwt, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app).get('/protected');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid JWT tokens', async () => {
      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      app.get('/protected', checkJwt, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject expired JWT tokens', async () => {
      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      const expiredToken = jwt.sign(
        { id: 123, exp: Math.floor(Date.now() / 1000) - 3600 }, // 1 hour ago
        JWT_SECRET
      );

      app.get('/protected', checkJwt, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle malformed Authorization headers', async () => {
      app.get('/protected', checkJwt, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app).get('/protected').set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Group Admin Verification Middleware', () => {
    it('should allow group administrators to access endpoints', async () => {
      app.use((req, res, next) => {
        req.user = { id: 123 };
        next();
      });

      axios.post.mockResolvedValue({
        data: {
          ok: true,
          result: [
            { user: { id: 123 } }, // Current user is admin
            { user: { id: 456 } },
          ],
        },
      });

      app.get('/groups/:groupId/test', checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/groups/-1001/test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/getChatAdministrators'), {
        chat_id: '-1001',
      });
    });

    it('should reject non-administrators', async () => {
      app.use((req, res, next) => {
        req.user = { id: 123 };
        next();
      });

      axios.post.mockResolvedValue({
        data: {
          ok: true,
          result: [
            { user: { id: 456 } }, // Current user (123) is not admin
            { user: { id: 789 } },
          ],
        },
      });

      app.get('/groups/:groupId/test', checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app).get('/groups/-1001/test');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('statusCode', 403);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle Telegram API errors gracefully', async () => {
      app.use((req, res, next) => {
        req.user = { id: 123 };
        next();
      });

      axios.post.mockRejectedValue(new Error('API Error'));

      app.get('/groups/:groupId/test', checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app).get('/groups/-1001/test');

      expect(response.status).toBe(500); // Should return 500 for network/API errors
      expect(response.body).toHaveProperty('statusCode', 500);
    });

    it('should validate group ID format', async () => {
      app.use((req, res, next) => {
        req.user = { id: 123 };
        next();
      });

      axios.post.mockResolvedValue({
        data: {
          ok: true,
          result: [{ user: { id: 123 } }],
        },
      });

      app.get('/groups/:groupId/test', checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/groups/invalid-group-id/test');

      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/getChatAdministrators'), {
        chat_id: 'invalid-group-id',
      });
      expect(response.status).toBe(200); // Should still work if user is admin
    });
  });

  describe('Middleware Chain Integration', () => {
    it('should properly chain JWT and admin verification', async () => {
      const validToken = jwt.sign({ id: 123 }, JWT_SECRET);

      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockReturnValue({ id: 123 });

      axios.post.mockResolvedValue({
        data: {
          ok: true,
          result: [{ user: { id: 123 } }],
        },
      });

      app.get('/groups/:groupId/admin-only', checkJwt, checkGroupAdmin, (req, res) => {
        res.json({
          success: true,
          userId: req.user.id,
          groupId: req.params.groupId,
        });
      });

      app.use((error, req, res, next) => {
        res.status(error.statusCode || 500).json({
          statusCode: error.statusCode || 500,
          message: error.message || 'Internal server error',
        });
      });

      const response = await request(app)
        .get('/groups/-1001/admin-only')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(123);
      expect(response.body.groupId).toBe('-1001');
    });

    it('should fail chain if JWT is invalid even with admin access', async () => {
      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      app.get('/groups/:groupId/admin-only', checkJwt, checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/groups/-1001/admin-only')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401); // Should fail at JWT stage
    });

    it('should fail chain if user is not admin even with valid JWT', async () => {
      const validToken = jwt.sign({ id: 123 }, JWT_SECRET);

      const { verifyToken } = await import('apps/api/src/services/tokenService.js');
      verifyToken.mockReturnValue({ id: 123 });

      axios.post.mockResolvedValue({
        data: {
          ok: true,
          result: [
            { user: { id: 456 } }, // User 123 is not in admin list
          ],
        },
      });

      app.get('/groups/:groupId/admin-only', checkJwt, checkGroupAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/groups/-1001/admin-only')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
    });
  });
});
