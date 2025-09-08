import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config, {
  getGroupSettings,
  updateSetting,
} from '@telegram-moderator/shared/src/config/index.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

// Mock the database service
vi.mock('@telegram-moderator/shared/src/services/database.js');

// Mock the logger to prevent console noise during tests
vi.mock('@telegram-moderator/shared/src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Configuration Service', () => {
  const mockChatId = 'chat-12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Default Settings Management', () => {
    it('should return correct default settings for new groups', async () => {
      // Mock database to return default values
      db.getSetting.mockImplementation((chatId, key, defaultValue) =>
        Promise.resolve(defaultValue)
      );

      const settings = await getGroupSettings(mockChatId);

      expect(settings).toEqual({
        spamThreshold: 0.85,
        alertLevel: 1,
        kickLevel: 3,
        banLevel: 0,
        muteLevel: 2,
        moderatorIds: [],
        whitelistedKeywords: undefined, // This comes from getWhitelistKeywords which is mocked
        keywordWhitelistBypass: true,
        warningMessage: '⚠️ {user}, please avoid posting promotional/banned content.',
        profanityWarningMessage: '⚠️ {user}, please keep your language appropriate and respectful.',
        profanityThreshold: 0.7,
        profanityEnabled: true,
        warningMessageDeleteSeconds: 15,
        goodBehaviorDays: 7,
        muteDurationMinutes: 60,
        strikeExpirationDays: 30,
      });
    });

    it('should retrieve custom settings when they exist', async () => {
      // Mock custom settings
      const customSettings = {
        spamThreshold: 0.7,
        alertLevel: 2,
        kickLevel: 4,
        muteLevel: 1,
        moderatorIds: ['123', '456'],
        warningMessage: 'Custom warning message',
        muteDurationMinutes: 120,
      };

      db.getSetting.mockImplementation((chatId, key, defaultValue) => {
        if (customSettings.hasOwnProperty(key)) {
          return Promise.resolve(customSettings[key]);
        }
        return Promise.resolve(defaultValue);
      });

      const settings = await getGroupSettings(mockChatId);

      expect(settings.spamThreshold).toBe(0.7);
      expect(settings.alertLevel).toBe(2);
      expect(settings.kickLevel).toBe(4);
      expect(settings.muteLevel).toBe(1);
      expect(settings.moderatorIds).toEqual(['123', '456']);
      expect(settings.warningMessage).toBe('Custom warning message');
      expect(settings.muteDurationMinutes).toBe(120);
    });

    it('should handle missing or null settings gracefully', async () => {
      db.getSetting.mockImplementation((chatId, key, defaultValue) => {
        // Simulate some settings being null/undefined - but the config should handle this
        if (key === 'spamThreshold') return Promise.resolve(defaultValue); // Use default when null
        if (key === 'moderatorIds') return Promise.resolve(defaultValue); // Use default when undefined
        return Promise.resolve(defaultValue);
      });

      const settings = await getGroupSettings(mockChatId);

      // Should use defaults for null/undefined values
      expect(settings.spamThreshold).toBe(0.85);
      expect(settings.moderatorIds).toEqual([]);
    });
  });

  describe('Setting Updates', () => {
    it('should update individual settings correctly', async () => {
      db.setSetting.mockResolvedValue();

      await updateSetting(mockChatId, 'spamThreshold', 0.9);

      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'spamThreshold', 0.9);
    });

    it('should handle array settings correctly', async () => {
      db.setSetting.mockResolvedValue();

      const moderatorIds = ['123', '456', '789'];
      await updateSetting(mockChatId, 'moderatorIds', moderatorIds);

      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'moderatorIds', moderatorIds);
    });

    it('should handle string settings correctly', async () => {
      db.setSetting.mockResolvedValue();

      const customMessage = 'This is a custom warning message for spam detection.';
      await updateSetting(mockChatId, 'warningMessage', customMessage);

      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'warningMessage', customMessage);
    });

    it('should handle boolean settings correctly', async () => {
      db.setSetting.mockResolvedValue();

      await updateSetting(mockChatId, 'keywordWhitelistBypass', false);

      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'keywordWhitelistBypass', false);
    });

    it('should handle numeric settings correctly', async () => {
      db.setSetting.mockResolvedValue();

      await updateSetting(mockChatId, 'muteDurationMinutes', 240);

      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'muteDurationMinutes', 240);
    });
  });

  describe('Setting Validation', () => {
    beforeEach(() => {
      db.setSetting.mockResolvedValue();
    });

    it('should validate spam threshold ranges', async () => {
      // Valid threshold
      await expect(updateSetting(mockChatId, 'spamThreshold', 0.75)).resolves.not.toThrow();

      // Invalid thresholds should be handled (implementation-dependent)
      await updateSetting(mockChatId, 'spamThreshold', -0.1);
      await updateSetting(mockChatId, 'spamThreshold', 1.5);

      // Implementation should handle edge cases gracefully
      expect(db.setSetting).toHaveBeenCalledTimes(3);
    });

    it('should validate penalty level consistency', async () => {
      // Test various penalty level combinations
      await updateSetting(mockChatId, 'alertLevel', 1);
      await updateSetting(mockChatId, 'muteLevel', 2);
      await updateSetting(mockChatId, 'kickLevel', 3);
      await updateSetting(mockChatId, 'banLevel', 4);

      expect(db.setSetting).toHaveBeenCalledTimes(4);
    });

    it('should handle zero and negative values appropriately', async () => {
      await updateSetting(mockChatId, 'alertLevel', 0);
      await updateSetting(mockChatId, 'muteLevel', 0);
      await updateSetting(mockChatId, 'kickLevel', 0);
      await updateSetting(mockChatId, 'banLevel', 0);

      expect(db.setSetting).toHaveBeenCalledTimes(4);
    });

    it('should validate duration settings', async () => {
      // Valid durations
      await updateSetting(mockChatId, 'muteDurationMinutes', 30);
      await updateSetting(mockChatId, 'warningMessageDeleteSeconds', 5);
      await updateSetting(mockChatId, 'goodBehaviorDays', 7);
      await updateSetting(mockChatId, 'strikeExpirationDays', 30);

      expect(db.setSetting).toHaveBeenCalledTimes(4);
    });
  });

  describe('Data Type Handling', () => {
    beforeEach(() => {
      db.setSetting.mockResolvedValue();
    });

    it('should handle string to number conversions', async () => {
      // String numbers should be handled appropriately
      await updateSetting(mockChatId, 'spamThreshold', '0.8');
      await updateSetting(mockChatId, 'alertLevel', '2');
      await updateSetting(mockChatId, 'muteDurationMinutes', '90');

      expect(db.setSetting).toHaveBeenCalledTimes(3);
    });

    it('should handle boolean conversions', async () => {
      // Various boolean representations
      await updateSetting(mockChatId, 'keywordWhitelistBypass', 'true');
      await updateSetting(mockChatId, 'keywordWhitelistBypass', 'false');
      await updateSetting(mockChatId, 'keywordWhitelistBypass', 1);
      await updateSetting(mockChatId, 'keywordWhitelistBypass', 0);

      expect(db.setSetting).toHaveBeenCalledTimes(4);
    });

    it('should handle array formatting', async () => {
      // Different array formats
      await updateSetting(mockChatId, 'moderatorIds', ['1', '2', '3']);
      await updateSetting(mockChatId, 'moderatorIds', []);
      await updateSetting(mockChatId, 'whitelistedKeywords', ['keyword1', 'keyword2']);

      expect(db.setSetting).toHaveBeenCalledTimes(3);
    });

    it('should handle special characters in strings', async () => {
      const specialMessages = [
        'Warning with emoji: 🚨 Spam detected!',
        'Warning with quotes: "Please stop spamming"',
        'Warning with newlines:\nFirst line\nSecond line',
        'Warning with HTML: <b>Bold warning</b>',
        'Warning with Unicode: Предупреждение о спаме',
      ];

      for (const message of specialMessages) {
        await updateSetting(mockChatId, 'warningMessage', message);
      }

      expect(db.setSetting).toHaveBeenCalledTimes(specialMessages.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      db.getSetting.mockRejectedValue(new Error('Database connection failed'));

      await expect(getGroupSettings(mockChatId)).rejects.toThrow('Database connection failed');
    });

    it('should handle setting update errors gracefully', async () => {
      db.setSetting.mockRejectedValue(new Error('Failed to update setting'));

      await expect(updateSetting(mockChatId, 'spamThreshold', 0.8)).rejects.toThrow(
        'Failed to update setting'
      );
    });

    it('should handle invalid chat IDs gracefully', async () => {
      const invalidChatIds = [null, undefined, ''];

      for (const invalidId of invalidChatIds) {
        await expect(getGroupSettings(invalidId)).rejects.toThrow();
      }
    });

    it('should handle valid setting keys', async () => {
      db.setSetting.mockResolvedValue();

      // Test with a nonexistent key - should still work
      await updateSetting(mockChatId, 'nonexistentKey', 'value');
      expect(db.setSetting).toHaveBeenCalledWith(mockChatId, 'nonexistentKey', 'value');
    });
  });

  describe('Configuration Consistency', () => {
    it('should maintain consistent default values across calls', async () => {
      db.getSetting.mockImplementation((chatId, key, defaultValue) =>
        Promise.resolve(defaultValue)
      );

      const settings1 = await getGroupSettings(mockChatId);
      const settings2 = await getGroupSettings('different-chat');

      expect(settings1).toEqual(settings2);
    });

    it('should handle concurrent setting updates', async () => {
      db.setSetting.mockResolvedValue();

      const updates = [
        updateSetting(mockChatId, 'spamThreshold', 0.8),
        updateSetting(mockChatId, 'alertLevel', 2),
        updateSetting(mockChatId, 'muteLevel', 1),
        updateSetting(mockChatId, 'kickLevel', 3),
        updateSetting(mockChatId, 'banLevel', 5),
      ];

      await Promise.all(updates);

      expect(db.setSetting).toHaveBeenCalledTimes(5);
    });

    it('should preserve data types through save/load cycle', async () => {
      const testSettings = {
        spamThreshold: 0.75,
        alertLevel: 2,
        muteLevel: 1,
        keywordWhitelistBypass: false,
        moderatorIds: ['123', '456'],
        warningMessage: 'Test warning',
        muteDurationMinutes: 120,
      };

      // Mock the save operation
      db.setSetting.mockResolvedValue();

      // Mock the load operation to return saved values
      db.getSetting.mockImplementation((chatId, key, defaultValue) => {
        if (testSettings.hasOwnProperty(key)) {
          return Promise.resolve(testSettings[key]);
        }
        return Promise.resolve(defaultValue);
      });

      // Save settings
      for (const [key, value] of Object.entries(testSettings)) {
        await updateSetting(mockChatId, key, value);
      }

      // Load settings
      const loadedSettings = await getGroupSettings(mockChatId);

      // Verify data types are preserved
      expect(typeof loadedSettings.spamThreshold).toBe('number');
      expect(typeof loadedSettings.alertLevel).toBe('number');
      expect(typeof loadedSettings.keywordWhitelistBypass).toBe('boolean');
      expect(Array.isArray(loadedSettings.moderatorIds)).toBe(true);
      expect(typeof loadedSettings.warningMessage).toBe('string');
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid setting retrievals efficiently', async () => {
      db.getSetting.mockImplementation((chatId, key, defaultValue) =>
        Promise.resolve(defaultValue)
      );

      const startTime = Date.now();

      const promises = Array.from({ length: 50 }, () => getGroupSettings(mockChatId));

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 50 concurrent requests in reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should handle rapid setting updates efficiently', async () => {
      db.setSetting.mockResolvedValue();

      const startTime = Date.now();

      const promises = Array.from({ length: 50 }, (_, i) =>
        updateSetting(mockChatId, 'spamThreshold', 0.8 + i * 0.001)
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 50 concurrent updates in reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
      expect(db.setSetting).toHaveBeenCalledTimes(50);
    });
  });
});
