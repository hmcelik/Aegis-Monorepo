import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import strikeRoutes from 'apps/api/src/routes/strikes.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

// Mock the database
vi.mock('@telegram-moderator/shared/src/services/database.js');

// Mock the middleware
vi.mock('apps/api/src/middleware/checkJwt.js', () => ({
  checkJwt: (req, res, next) => {
    req.user = {
      id: '123456789',
      first_name: 'Test',
      username: 'testuser',
    };
    next();
  },
}));

vi.mock('apps/api/src/middleware/checkGroupAdmin.js', () => ({
  checkGroupAdmin: (req, res, next) => next(),
}));

describe('Strike Management API', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/groups', strikeRoutes);

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('GET /api/v1/groups/:groupId/users/:userId/strikes', () => {
    it('should get user strikes with history', async () => {
      const mockStrikes = { count: 5, timestamp: '2023-01-01T00:00:00.000Z' };
      const mockHistory = [
        {
          id: 1,
          timestamp: '2023-01-01T00:00:00.000Z',
          logData: JSON.stringify({
            type: 'MANUAL-STRIKE-ADD',
            amount: 2,
            reason: 'Test reason',
            admin: { id: '123', first_name: 'Admin', username: 'admin' },
          }),
        },
      ];

      db.getStrikes.mockResolvedValue(mockStrikes);
      db.getStrikeHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/v1/groups/test-group/users/test-user/strikes')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('userId', 'test-user');
      expect(response.body.data).toHaveProperty('groupId', 'test-group');
      expect(response.body.data).toHaveProperty('strikes', 5);
      expect(response.body.data.history).toHaveLength(1);
      expect(response.body.data.history[0]).toHaveProperty('type', 'MANUAL-STRIKE-ADD');
      expect(response.body.data.history[0]).toHaveProperty('amount', 2);
    });

    it('should get user strikes without history when includeHistory=false', async () => {
      const mockStrikes = { count: 3, timestamp: '2023-01-01T00:00:00.000Z' };

      db.getStrikes.mockResolvedValue(mockStrikes);

      const response = await request(app)
        .get('/api/v1/groups/test-group/users/test-user/strikes?includeHistory=false')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('strikes', 3);
      expect(response.body.data.history).toHaveLength(0);
      expect(db.getStrikeHistory).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/groups/:groupId/users/:userId/strikes', () => {
    it('should add strikes to a user', async () => {
      const mockBeforeStrikes = { count: 3 };
      const mockNewCount = 5;

      db.getStrikes.mockResolvedValue(mockBeforeStrikes);
      db.addStrikes.mockResolvedValue(mockNewCount);
      db.logManualAction.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          amount: 2,
          reason: 'Test violation',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.previousCount).toBe(3);
      expect(response.body.data.newCount).toBe(5);
      expect(response.body.data.amountAdded).toBe(2);

      expect(db.addStrikes).toHaveBeenCalledWith('test-group', 'test-user', 2);
      expect(db.logManualAction).toHaveBeenCalledWith(
        'test-group',
        'test-user',
        expect.objectContaining({
          type: 'MANUAL-STRIKE-ADD',
          amount: 2,
          reason: 'Test violation',
        })
      );
    });

    it('should reject invalid amount', async () => {
      const response = await request(app)
        .post('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          amount: 0,
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should reject amount over 100', async () => {
      const response = await request(app)
        .post('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          amount: 101,
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('DELETE /api/v1/groups/:groupId/users/:userId/strikes', () => {
    it('should remove strikes from a user', async () => {
      const mockBeforeStrikes = { count: 5 };
      const mockNewCount = 3;

      db.getStrikes.mockResolvedValue(mockBeforeStrikes);
      db.removeStrike.mockResolvedValue(mockNewCount);
      db.logManualAction.mockResolvedValue();

      const response = await request(app)
        .delete('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          amount: 2,
          reason: 'Appeal accepted',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.previousCount).toBe(5);
      expect(response.body.data.newCount).toBe(3);
      expect(response.body.data.amountRemoved).toBe(2);

      expect(db.removeStrike).toHaveBeenCalledWith('test-group', 'test-user', 2);
    });

    it('should default to removing 1 strike when amount not specified', async () => {
      const mockBeforeStrikes = { count: 2 };
      const mockNewCount = 1;

      db.getStrikes.mockResolvedValue(mockBeforeStrikes);
      db.removeStrike.mockResolvedValue(mockNewCount);
      db.logManualAction.mockResolvedValue();

      const response = await request(app)
        .delete('/api/v1/groups/test-group/users/test-user/strikes')
        .send({})
        .expect(200);

      expect(response.body.data.amountRemoved).toBe(1);
      expect(db.removeStrike).toHaveBeenCalledWith('test-group', 'test-user', 1);
    });
  });

  describe('PUT /api/v1/groups/:groupId/users/:userId/strikes', () => {
    it('should set strike count to specific value', async () => {
      const mockBeforeStrikes = { count: 5 };
      const mockNewCount = 10;

      db.getStrikes.mockResolvedValue(mockBeforeStrikes);
      db.setStrikes.mockResolvedValue(mockNewCount);
      db.logManualAction.mockResolvedValue();

      const response = await request(app)
        .put('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          count: 10,
          reason: 'Manual adjustment',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.previousCount).toBe(5);
      expect(response.body.data.newCount).toBe(10);
      expect(response.body.data.countSet).toBe(10);

      expect(db.setStrikes).toHaveBeenCalledWith('test-group', 'test-user', 10);
    });

    it('should allow setting strike count to 0', async () => {
      const mockBeforeStrikes = { count: 5 };
      const mockNewCount = 0;

      db.getStrikes.mockResolvedValue(mockBeforeStrikes);
      db.setStrikes.mockResolvedValue(mockNewCount);
      db.logManualAction.mockResolvedValue();

      const response = await request(app)
        .put('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          count: 0,
          reason: 'Reset strikes',
        })
        .expect(200);

      expect(response.body.data.countSet).toBe(0);
    });

    it('should reject negative count', async () => {
      const response = await request(app)
        .put('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          count: -1,
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should reject count over 1000', async () => {
      const response = await request(app)
        .put('/api/v1/groups/test-group/users/test-user/strikes')
        .send({
          count: 1001,
        })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });
});
