import { vi, describe, it, expect, beforeEach } from 'vitest';
import { handleCallback } from 'apps/bot/src/handlers/callbackHandler'; // Adjust path as needed
import * as db from 'packages/shared/src/services/database';
import * as telegram from 'packages/shared/src/services/telegram';
import * as config from '@telegram-moderator/shared/src/config/index';

// Mock all dependencies
vi.mock('packages/shared/src/services/database');
vi.mock('packages/shared/src/services/telegram');
vi.mock('@telegram-moderator/shared/src/config/index');
vi.mock('packages/shared/src/services/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock keyboards to prevent UI rendering logic from interfering with tests
vi.mock('../../src/bot/keyboards/mainMenu.js', () => ({ mainKeyboard: vi.fn(() => ({})) }));
vi.mock('../../src/bot/keyboards/penaltyLevelsMenu.js', () => ({ penaltyLevelsKeyboard: vi.fn(() => ({})) }));
vi.mock('../../src/bot/keyboards/aiSensitivityMenu.js', () => ({ aiSensitivityKeyboard: vi.fn(() => ({})) }));

describe('callbackHandler', () => {
  const MOCK_USER_ID = 12345;
  const MOCK_CHAT_ID = 54321;
  const MOCK_GROUP_ID = '-100123';
  const MOCK_MESSAGE_ID = 987;

  const mockCallbackQuery = (data) => ({
    id: 'query-id-1',
    from: { id: MOCK_USER_ID, first_name: 'Tester' },
    message: {
      message_id: MOCK_MESSAGE_ID,
      chat: { id: MOCK_CHAT_ID, type: 'private' },
    },
    data,
  });

  const mockGroupSettings = {
    alertLevel: 1,
    muteLevel: 3,
    kickLevel: 5,
    banLevel: 10,
    spamThreshold: 0.75,
    keywordWhitelistBypass: false,
    moderatorIds: [],
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Default mock implementations
    db.getGroup.mockResolvedValue({ chatId: MOCK_GROUP_ID, chatTitle: 'Test Group' });
    config.getGroupSettings.mockResolvedValue(mockGroupSettings);
    telegram.answerCallbackQuery.mockResolvedValue(true);
    telegram.editMessageText.mockResolvedValue(true);
  });

  it('TC-01: should navigate to a submenu and back correctly', async () => {
    // 1. User navigates to penalty levels
    const queryToSubmenu = mockCallbackQuery(`settings_penalty_levels:${MOCK_GROUP_ID}`);
    await handleCallback(queryToSubmenu);

    expect(telegram.editMessageText).toHaveBeenCalledWith(
      'Configure penalty level settings:',
      expect.any(Object)
    );
    expect(config.getGroupSettings).toHaveBeenCalledWith(MOCK_GROUP_ID);

    // 2. User navigates back to main menu
    const queryToMain = mockCallbackQuery(`settings_main:${MOCK_GROUP_ID}`);
    await handleCallback(queryToMain);

    expect(telegram.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Managing settings for'),
      expect.any(Object)
    );
    expect(db.getGroup).toHaveBeenCalledWith(MOCK_GROUP_ID);
  });

  it('TC-02: should handle callback after a simulated restart', async () => {
    // The bot "restarts", so no in-memory state exists.
    // The user clicks a button with embedded state.
    const query = mockCallbackQuery(`toggle_bypass:${MOCK_GROUP_ID}`);
    
    // Mock the setting update and retrieval
    config.updateSetting.mockResolvedValue(true);
    
    await handleCallback(query);

    // The handler should successfully identify the target group and action
    expect(config.updateSetting).toHaveBeenCalledWith(MOCK_GROUP_ID, 'keywordWhitelistBypass', true);
    
    // It should answer the query with feedback
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith(expect.any(String), {
      text: 'Keyword Bypass is now ON',
    });

    // And it should refresh the menu correctly
    expect(telegram.editMessageText).toHaveBeenCalledWith(
        'Configure AI sensitivity settings:',
        expect.any(Object)
    );
  });

  it('TC-04: should handle concurrent sessions from different users for different groups', async () => {
    const USER_1_ID = 111;
    const GROUP_A_ID = '-100A';
    const USER_2_ID = 222;
    const GROUP_B_ID = '-100B';

    // Mock specific group settings
    config.getGroupSettings
      .mockResolvedValueOnce({ ...mockGroupSettings, spamThreshold: 0.8 }) // For Group A
      .mockResolvedValueOnce({ ...mockGroupSettings, spamThreshold: 0.6 }); // For Group B

    // 1. User 1 requests settings for Group A
    const queryUser1 = mockCallbackQuery(`settings_ai_sensitivity:${GROUP_A_ID}`);
    queryUser1.from.id = USER_1_ID;
    await handleCallback(queryUser1);

    // 2. User 2 requests settings for Group B
    const queryUser2 = mockCallbackQuery(`settings_penalty_levels:${GROUP_B_ID}`);
    queryUser2.from.id = USER_2_ID;
    await handleCallback(queryUser2);

    // Verify User 1's action
    expect(telegram.editMessageText).toHaveBeenCalledWith(
      'Configure AI sensitivity settings:',
      expect.any(Object)
    );
    expect(config.getGroupSettings).toHaveBeenCalledWith(GROUP_A_ID);
    
    // Verify User 2's action
    expect(telegram.editMessageText).toHaveBeenCalledWith(
      'Configure penalty level settings:',
      expect.any(Object)
    );
    expect(config.getGroupSettings).toHaveBeenCalledWith(GROUP_B_ID);
    
    // Ensure no cross-contamination of state
    expect(telegram.editMessageText).toHaveBeenCalledTimes(2);
  });

  it('TC-05: should fail gracefully if callback data is missing targetChatId', async () => {
    const malformedQuery = mockCallbackQuery('settings_main'); // Missing :<chatId>
    await handleCallback(malformedQuery);

    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith(
      expect.any(String),
      { text: expect.stringContaining('session may have expired') }
    );
    expect(telegram.editMessageText).not.toHaveBeenCalled();
  });
});
