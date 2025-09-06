import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import axios from 'axios';
import app from 'apps/api/src/server.js';
import * as tokenService from 'apps/api/src/services/tokenService.js';
import telegramService from '@telegram-moderator/shared/src/services/telegram.js';

// --- MOCK SETUP ---

vi.mock('axios');

// ✅ Mock NLP service with named export
vi.mock('@telegram-moderator/shared/src/services/nlp.js', () => ({
  isPromotional: vi.fn().mockResolvedValue({ score: 1.0 }), // always spam
}));

// ✅ Mock config service (API and bot config usage)
vi.mock('@telegram-moderator/shared/src/config/index.js', () => ({
  updateSetting: vi.fn(),
  getGroupSettings: vi.fn(),
  default: {
    telegram: { token: 'mock-token' },
  },
}));

// ✅ Mock database service (named + default)
vi.mock('@telegram-moderator/shared/src/services/database.js', () => {
  const mockDb = {
    upsertUser: vi.fn(),
    getStrikes: vi.fn().mockResolvedValue({ count: 0 }),
    removeStrike: vi.fn(),
    recordStrike: vi.fn().mockResolvedValue(1),
    resetStrikes: vi.fn(),
    logManualAction: vi.fn(), // Add missing mock for the new logging functionality
    isUserGroupAdmin: vi.fn().mockResolvedValue(true),
    getGroup: vi.fn().mockResolvedValue({ 
      chatId: '-1001', 
      title: 'Test Group',
      type: 'supergroup',
      memberCount: 100
    }),
  };

  return {
    ...mockDb,        // named exports
    default: mockDb,  // default import
  };
});
describe('End-to-End API and Bot Integration Test', () => {
  let configService, db, handleMessage;

  beforeEach(async () => {
    configService = await import('@telegram-moderator/shared/src/config/index.js');
    db = (await import('@telegram-moderator/shared/src/services/database.js')).default;

    // ✅ Get the named export correctly
    handleMessage = (await import('apps/bot/src/handlers/messageHandler.js')).handleMessage;

    vi.clearAllMocks();

    // ✅ Mock all telegram functions
    telegramService.deleteMessage = vi.fn();
    telegramService.restrictChatMember = vi.fn();
    telegramService.muteUser = vi.fn(); // Add missing mock for muteUser
    telegramService.kickUser = vi.fn();
    telegramService.banUser = vi.fn();
    telegramService.sendMessage = vi.fn().mockResolvedValue({ message_id: 999 });
    telegramService.getChatAdmins = vi.fn().mockResolvedValue([]); // no admins → user is not whitelisted
  });

  it('should mute a user on first strike after an admin sets muteLevel=1 via API', async () => {
    // --- Phase 1: API call to change group setting ---
    // Mock axios for the admin check in checkGroupAdmin middleware
    axios.post.mockResolvedValue({ 
      data: { 
        ok: true,
        result: [{ user: { id: 123 } }] // User 123 is admin
      } 
    });
    
    configService.updateSetting.mockResolvedValue({ success: true });

    const adminToken = tokenService.generateToken({ id: 123 });

    const apiResponse = await request(app)
      .put('/api/v1/groups/-1001/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: { muteLevel: 1 } });

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body).toHaveProperty('success', true);
    expect(configService.updateSetting).toHaveBeenCalledWith('-1001', 'muteLevel', 1);

    // --- Phase 2: Bot handles spam message from user ---
    configService.getGroupSettings.mockResolvedValue({
      muteLevel: 1,
      kickLevel: 3,
      banLevel: 5,
      alertLevel: 0,
      muteDurationMinutes: 5,
      spamThreshold: 0.5,
      warningMessage: 'Watch out, {user}!',
      warningMessageDeleteSeconds: 0,
      moderatorIds: [],
      whitelistedKeywords: [],
      keywordWhitelistBypass: false,
      goodBehaviorDays: 0,
    });

    await handleMessage({
      from: { id: 555, first_name: 'Spammer' },
      chat: { id: -1001, type: 'group', title: 'Test Group' },
      message_id: 111,
      text: 'Buy now cheap deals!',
    });

    // ✅ Expect the user to be muted
    expect(telegramService.restrictChatMember).toHaveBeenCalledWith(
      -1001,
      555,
      expect.any(Object) // mute permissions object
    );
  });
});
