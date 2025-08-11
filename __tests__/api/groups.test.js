import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import axios from 'axios';
import querystring from 'node:querystring';
import app from 'apps/api/src/server.js';
import * as tokenService from 'apps/api/src/services/tokenService.js';
import * as telegramService from 'packages/shared/services/telegram.js';

// --- MOCK SETUP ---
vi.mock('axios');

vi.mock('packages/shared/config/index.js', () => ({
  getGroupSettings: vi.fn(),
  updateSetting: vi.fn(),
  default: {
    getAllGroups: vi.fn(),
    telegram: {
      token: 'mock-telegram-token',
    },
  },
}));

vi.mock('packages/shared/services/database.js', () => ({
  getGroup: vi.fn().mockResolvedValue({ 
    chatId: '-1001', 
    title: 'Test Group',
    type: 'supergroup',
    memberCount: 100
  }),
  getAuditLog: vi.fn().mockResolvedValue(new Array(5).fill({})),
  getTotalDeletionsToday: vi.fn().mockResolvedValue(3),
  getAllGroups: vi.fn().mockResolvedValue([
    { chatId: '-1001', chatTitle: 'Group A' },
    { chatId: '-1002', chatTitle: 'Group B' }
  ]),
  getUserAdminGroups: vi.fn().mockResolvedValue([
    { id: '-1001', title: 'Group A', type: 'supergroup', memberCount: 100 }
  ]),
  isUserGroupAdmin: vi.fn().mockResolvedValue(true),
  getStrikes: vi.fn().mockResolvedValue({ count: 0, timestamp: null }),
  getStrikeHistory: vi.fn().mockResolvedValue([]),
  getBasicGroupStats: vi.fn().mockResolvedValue({
    totalMessages: 1000,
    flaggedToday: 5,
    activeStrikes: 3
  }),
  getGroupStats: vi.fn().mockResolvedValue({
    totalMessagesProcessed: 5000,
    violationsDetected: 25,
    actionsTaken: 15,
    deletionsToday: 3,
    mutesToday: 8,
    kicksToday: 2,
    bansToday: 1
  }),
  getAuditLogPaginated: vi.fn().mockResolvedValue({
    logs: [],
    pagination: { total: 0, offset: 0, limit: 50, hasMore: false }
  }),
  exportAuditLog: vi.fn().mockResolvedValue([])
}));

vi.mock('packages/shared/services/telegram.js', () => ({
  getChatAdmins: vi.fn(),
}));

describe('Group API Endpoints', () => {
  let configService;
  let adminToken;

  beforeEach(async () => {
    configService = await import('packages/shared/config/index.js');
    vi.clearAllMocks();
    adminToken = tokenService.generateToken({ id: 123 });
  });

  describe('Settings Endpoints', () => {
    it('should return 401 if no token is provided', async () => {
      const response = await request(app).get('/api/v1/groups/-1001/settings');
      expect(response.status).toBe(401);
    });

    it('should return settings for an admin', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 123 } }] } });
      configService.getGroupSettings.mockResolvedValue({ 
        muteLevel: 3,
        alertLevel: 1,
        kickLevel: 5,
        banLevel: 7,
        spamThreshold: 0.8,
        profanityThreshold: 0.8,
        muteDurationMinutes: 60,
        strikeExpirationDays: 30,
        goodBehaviorDays: 7,
        warningMessage: 'Warning!',
        warningMessageDeleteSeconds: 30,
        keywordWhitelistBypass: false,
        whitelistedKeywords: []
      });

      const response = await request(app)
        .get('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.settings).toEqual(expect.objectContaining({ muteLevel: 3 }));
    });

    it('should return 403 if user is not an admin of the group', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 999 } }] } });
      
      // Mock database service to return false for this test
      const dbService = await import('packages/shared/services/database.js');
      dbService.isUserGroupAdmin.mockResolvedValueOnce(false);

      const response = await request(app)
        .get('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow an admin to update settings', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 123 } }] } });
      configService.updateSetting.mockResolvedValue({ success: true });
      configService.getGroupSettings.mockResolvedValue({ kickLevel: 5 });

      const newSettings = { kickLevel: 5 };

      const response = await request(app)
        .put('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settings: newSettings });

      expect(response.status).toBe(200);
      expect(configService.updateSetting).toHaveBeenCalledWith('-1001', 'kickLevel', 5);
    });

    it('should update multiple settings individually', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 123 } }] } });
      configService.updateSetting.mockResolvedValue();
      configService.getGroupSettings.mockResolvedValue({ kickLevel: 3, muteLevel: 1 });

      const response = await request(app)
        .put('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settings: { kickLevel: 3, muteLevel: 1 } });

      expect(response.status).toBe(200);
      expect(configService.updateSetting).toHaveBeenCalledTimes(2);
    });

    it('should return 403 for non-admin users', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 999 } }] } });
      
      // Mock isUserGroupAdmin to return false for this specific test
      const dbService = await import('packages/shared/services/database.js');
      dbService.isUserGroupAdmin.mockResolvedValueOnce(false);

      const response = await request(app)
        .put('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settings: { kickLevel: 1 } });

      expect(response.status).toBe(403);
    });

    it('should return 400 for invalid settings object', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 123 } }] } });

      const response = await request(app)
        .put('/api/v1/groups/-1001/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settings: null });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /groups', () => {
    it('should return only groups the user is admin of', async () => {
      // Mock getChatAdmins to return user ID 123 for group -1001 only
      telegramService.getChatAdmins.mockImplementation(async (chatId) => {
        console.log('Mock getChatAdmins called with chatId:', chatId);
        if (chatId === '-1001') {
          return [123]; // User IS admin of -1001
        } else if (chatId === '-1002') {
          return [999]; // User is NOT admin of -1002
        }
        return [];
      });

      const response = await request(app)
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${adminToken}`);

      console.log('Actual response:', response.body);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ 
          id: '-1001', 
          title: 'Group A' 
        })
      ]));
    });
  });

  describe('GET /groups/:groupId/stats', () => {
    it('should return stats for a valid group', async () => {
      axios.post.mockResolvedValue({ data: { result: [{ user: { id: 123 } }] } });

      const response = await request(app)
        .get('/api/v1/groups/-1001/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Check the new unified API response structure
      expect(response.body.data).toEqual(expect.objectContaining({
        groupId: '-1001',
        stats: expect.objectContaining({
          totalMessages: expect.any(Number),
          flaggedMessages: expect.objectContaining({
            total: expect.any(Number)
          }),
          penalties: expect.objectContaining({
            totalUsersActioned: expect.any(Number)
          })
        })
      }));
    });
  });
});
