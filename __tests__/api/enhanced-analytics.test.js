/**
 * @fileoverview Tests for the enhanced analytics and logging system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from 'apps/api/src/server.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

// Mock the database and telegram services
vi.mock('@telegram-moderator/shared/src/services/database.js', () => ({
  Database: {
    getInstance: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      close: vi.fn(),
    })),
  },
  initializeDatabase: vi.fn(),
  getDb: vi.fn(),
  isUserGroupAdmin: vi.fn(),
  getGroupStats: vi.fn(),
  getUserActivityStats: vi.fn(),
  getActivityPatterns: vi.fn(),
  getModerationEffectiveness: vi.fn(),
  logManualAction: vi.fn(),
}));

vi.mock('packages/shared/src/services/telegram.js', () => ({
  getChatAdmins: vi.fn(() => Promise.resolve([123456789])),
  getChatMemberCount: vi.fn(() => Promise.resolve(150)),
}));

// Mock the Telegram WebApp middleware
vi.mock('apps/api/src/middleware/verifyTelegramWebApp.js', () => ({
  verifyTelegramWebApp: (req, res, next) => {
    // Check for valid authentication header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authentication token provided' },
      });
    }

    // For testing, simulate successful authentication
    try {
      const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      req.telegramUser = decoded.telegramUser;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token' },
      });
    }
  },
}));

describe('Enhanced Analytics API', () => {
  let validToken;
  const groupId = '-1001234567890';
  const testUser = {
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a valid JWT token for testing
    validToken = jwt.sign({ telegramUser: testUser }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });

    // Mock admin check to return true
    db.isUserGroupAdmin.mockResolvedValue(true);
  });

  describe('GET /api/v1/webapp/group/:groupId/stats', () => {
    it('should return enhanced group statistics', async () => {
      const mockStats = {
        totalMessages: 1250,
        flaggedMessages: {
          total: 45,
          spam: 32,
          profanity: 13,
        },
        deletedMessages: 45,
        mutedUsers: 5,
        kickedUsers: 2,
        bannedUsers: 1,
        averageSpamScore: 0.72,
        topViolationTypes: [
          { type: 'SPAM', count: 32 },
          { type: 'PROFANITY', count: 13 },
        ],
        flaggedRate: 3.6,
        autoModerationEfficiency: {
          messagesScanned: 1250,
          violationsDetected: 45,
          usersActioned: 8,
        },
      };

      db.getGroupStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/stats`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({ period: 'week' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.data.period).toBe('week');
      expect(response.body.data.stats).toMatchObject({
        totalMessages: 1250,
        flaggedMessages: {
          total: 45,
          spam: 32,
          profanity: 13,
        },
        penalties: {
          mutedUsers: 5,
          kickedUsers: 2,
          bannedUsers: 1,
          totalUsersActioned: 8,
        },
        qualityMetrics: {
          averageSpamScore: 0.72,
          flaggedRate: 3.6,
          moderationEfficiency: {
            messagesScanned: 1250,
            violationsDetected: 45,
            usersActioned: 8,
          },
        },
      });
    });

    it('should validate period parameter', async () => {
      db.getGroupStats.mockResolvedValue({
        totalMessages: 100,
        flaggedMessages: { total: 5, spam: 3, profanity: 2 },
        deletedMessages: 5,
        mutedUsers: 1,
        kickedUsers: 0,
        bannedUsers: 0,
        averageSpamScore: 0.5,
        topViolationTypes: [],
      });

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/stats`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({ period: 'month' });

      expect(response.status).toBe(200);
      expect(db.getGroupStats).toHaveBeenCalledWith(groupId, expect.any(Date), expect.any(Date));
    });

    it('should deny access for non-admin users', async () => {
      db.isUserGroupAdmin.mockResolvedValue(false);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/stats`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/webapp/group/:groupId/users', () => {
    it('should return user activity statistics', async () => {
      const mockUserStats = [
        {
          userId: '123456789',
          username: 'testuser1',
          firstName: 'Test',
          lastName: 'User1',
          messages_sent: 156,
          violations: 3,
          penalties: 2,
          avg_spam_score: 0.65,
        },
        {
          userId: '987654321',
          username: 'testuser2',
          firstName: 'Test',
          lastName: 'User2',
          messages_sent: 89,
          violations: 1,
          penalties: 1,
          avg_spam_score: 0.45,
        },
      ];

      db.getUserActivityStats.mockResolvedValue(mockUserStats);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/users`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({ period: 'week', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(2);
      expect(response.body.data.users[0]).toMatchObject({
        userId: '123456789',
        username: 'testuser1',
        stats: {
          messagesSent: 156,
          violations: 3,
          penalties: 2,
          averageSpamScore: 0.65,
          violationRate: expect.any(Number),
        },
      });
    });

    it('should respect limit parameter', async () => {
      db.getUserActivityStats.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/users`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(db.getUserActivityStats).toHaveBeenCalledWith(
        groupId,
        expect.any(Date),
        expect.any(Date),
        5
      );
    });
  });

  describe('GET /api/v1/webapp/group/:groupId/patterns', () => {
    it('should return activity patterns', async () => {
      const mockPatterns = {
        hourlyDistribution: [
          { hour: '08', messages: 45, violations: 2 },
          { hour: '14', messages: 78, violations: 5 },
          { hour: '20', messages: 92, violations: 3 },
        ],
        dailyActivity: [
          { date: '2025-08-01', messages: 234, violations: 12 },
          { date: '2025-08-02', messages: 156, violations: 8 },
          { date: '2025-08-03', messages: 298, violations: 15 },
        ],
      };

      db.getActivityPatterns.mockResolvedValue(mockPatterns);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/patterns`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.patterns.hourlyDistribution).toHaveLength(3);
      expect(response.body.data.patterns.dailyActivity).toHaveLength(3);
      expect(response.body.data.patterns.hourlyDistribution[0]).toMatchObject({
        hour: 8,
        messages: 45,
        violations: 2,
        violationRate: expect.any(Number),
      });
    });
  });

  describe('GET /api/v1/webapp/group/:groupId/effectiveness', () => {
    it('should return moderation effectiveness metrics', async () => {
      const mockEffectiveness = {
        averageResponseTimeSeconds: 12.5,
        effectivenessScore: 85,
        totalRepeatOffenders: 3,
        responseTimeDistribution: [
          {
            violation_type: 'SPAM',
            penalty_action: 'user_muted',
            response_time_seconds: 8.2,
          },
        ],
        repeatOffenders: [
          {
            userId: '123456789',
            total_violations: 5,
            active_days: 3,
            avg_violation_score: 0.75,
          },
        ],
      };

      db.getModerationEffectiveness.mockResolvedValue(mockEffectiveness);

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/effectiveness`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.effectiveness).toMatchObject({
        averageResponseTimeSeconds: 12.5,
        effectivenessScore: 85,
        totalRepeatOffenders: 3,
      });
      expect(response.body.data.effectiveness.topRepeatOffenders).toHaveLength(1);
      expect(response.body.data.effectiveness.responseTimeDistribution[0]).toMatchObject({
        violationType: 'SPAM',
        penaltyAction: 'muted',
        responseTimeSeconds: 8.2,
      });
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      db.getGroupStats.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get(`/api/v1/webapp/group/${groupId}/stats`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.statusCode).toBe(500);
    });

    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        `/api/v1/webapp/group/${groupId}/stats`,
        `/api/v1/webapp/group/${groupId}/users`,
        `/api/v1/webapp/group/${groupId}/patterns`,
        `/api/v1/webapp/group/${groupId}/effectiveness`,
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
      }
    });
  });
});
