import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as db from '@telegram-moderator/shared/services/database.js';

// Mock the logger to prevent console noise during tests
vi.mock('packages/shared/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Database Performance and Edge Cases', () => {
  const testChatId = 'test-chat-performance';
  const testUserId = 'test-user-performance';

  beforeEach(async () => {
    // Initialize database for testing
    await db.initializeDatabase(true);

    // Clean up any existing test data
    try {
      await db.resetStrikes(testChatId, testUserId);
      // Clean up test users from concurrent test
      for (let i = 0; i < 5; i++) {
        await db.resetStrikes(testChatId, `user-${i}`);
      }
    } catch (error) {
      // Ignore errors if user doesn't exist
    }
  });

  describe('Basic Operations Performance', () => {
    it('should handle rapid strike operations efficiently', async () => {
      const startTime = Date.now();
      
      // Add multiple strikes rapidly
      for (let i = 0; i < 10; i++) {
        await db.addStrikes(testChatId, testUserId, 1);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      // Verify strikes were added
      const result = await db.getStrikes(testChatId, testUserId);
      expect(result.count).toBe(10);
    });

    it('should handle multiple setting updates efficiently', async () => {
      const startTime = Date.now();
      
      // Update multiple settings rapidly
      const updates = [
        ['spamThreshold', 0.8],
        ['alertLevel', 2],
        ['muteLevel', 1],
        ['kickLevel', 4],
        ['banLevel', 6]
      ];
      
      for (const [key, value] of updates) {
        await db.setSetting(testChatId, key, value);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // 2 seconds
      
      // Verify settings were updated
      const spamThreshold = await db.getSetting(testChatId, 'spamThreshold', 0.85);
      expect(spamThreshold).toBe(0.8);
    });

    it('should handle large numbers of audit log entries', async () => {
      const startTime = Date.now();
      
      // Add multiple audit log entries using recordStrike
      for (let i = 0; i < 20; i++) {
        await db.recordStrike(testChatId, `user-${i}`, {
          timestamp: new Date().toISOString(),
          action: 'STRIKE_ADDED',
          reason: `Automated test entry ${i}`
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds
      
      // Verify entries were added by checking audit log
      const auditEntries = await db.getAuditLog(testChatId, 25);
      expect(auditEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity and Edge Cases', () => {
    it('should handle null and undefined values correctly', async () => {
      // Test setting null values
      await expect(db.setSetting(testChatId, 'testKey', null)).resolves.not.toThrow();
      const nullValue = await db.getSetting(testChatId, 'testKey', 'default');
      expect(nullValue).toBe(null); // Should store null as is

      // Test undefined values - should use default
      const undefinedValue = await db.getSetting(testChatId, 'nonexistentKey', 'default');
      expect(undefinedValue).toBe('default');
    });

    it('should handle empty strings and special characters', async () => {
      const specialValues = [
        '',
        '   ',
        'test with spaces',
        'test@email.com',
        'https://example.com',
        '🚀🎉💎',
        'Text with "quotes" and \'apostrophes\'',
        'Line 1\nLine 2\nLine 3'
      ];

      for (const value of specialValues) {
        await db.setSetting(testChatId, 'specialTest', value);
        const retrieved = await db.getSetting(testChatId, 'specialTest', 'default');
        expect(retrieved).toBe(value);
      }
    });

    it('should handle very long strings', async () => {
      const longString = 'x'.repeat(10000);
      
      await db.setSetting(testChatId, 'longString', longString);
      const retrieved = await db.getSetting(testChatId, 'longString', 'default');
      
      expect(retrieved).toBe(longString);
      expect(retrieved.length).toBe(10000);
    });

    it('should handle invalid chat IDs gracefully', async () => {
      const invalidChatIds = ['', null, undefined, 0, false];

      for (const invalidId of invalidChatIds) {
        // Database should handle gracefully and return default values
        const result = await db.getStrikes(invalidId, testUserId);
        expect(typeof result.count).toBe('number');
        expect(result.count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle concurrent operations without corruption', async () => {
      // Use unique user IDs for this test to avoid conflicts
      const testUserPrefix = `concurrent-test-${Date.now()}`;
      
      // Test concurrent strike additions
      const promises = Array.from({ length: 5 }, (_, i) =>
        db.addStrikes(testChatId, `${testUserPrefix}-${i}`, 1)
      );

      await Promise.all(promises);

      // Verify all strikes were added correctly
      for (let i = 0; i < 5; i++) {
        const result = await db.getStrikes(testChatId, `${testUserPrefix}-${i}`);
        expect(result.count).toBe(1);
      }
    });
  });

  describe('Database Limits and Boundaries', () => {
    it('should handle maximum strike counts', async () => {
      // Use unique user ID for this test
      const maxTestUserId = `max-strikes-test-${Date.now()}`;
      const maxStrikes = 100;
      
      for (let i = 0; i < maxStrikes; i++) {
        await db.addStrikes(testChatId, maxTestUserId, 1);
      }
      
      const finalResult = await db.getStrikes(testChatId, maxTestUserId);
      expect(finalResult.count).toBe(maxStrikes);
    });

    it('should handle strike removal correctly', async () => {
      // Use unique user ID for this test
      const removalTestUserId = `removal-test-${Date.now()}`;
      
      // Add some strikes first
      await db.addStrikes(testChatId, removalTestUserId, 3);

      // Remove strikes
      await db.removeStrike(testChatId, removalTestUserId, 1);
      
      const result = await db.getStrikes(testChatId, removalTestUserId);
      expect(result.count).toBe(2);
    });

    it('should handle strike clearing', async () => {
      // Add some strikes
      await db.addStrikes(testChatId, testUserId, 2);

      // Clear all strikes
      await db.resetStrikes(testChatId, testUserId);
      
      const result = await db.getStrikes(testChatId, testUserId);
      expect(result.count).toBe(0);
    });
  });

  describe('Query Performance', () => {
    it('should retrieve settings efficiently', async () => {
      // Set multiple settings
      const settings = {
        spamThreshold: 0.75,
        alertLevel: 2,
        muteLevel: 1,
        kickLevel: 4,
        banLevel: 6,
        warningMessage: 'Custom warning message'
      };

      for (const [key, value] of Object.entries(settings)) {
        await db.setSetting(testChatId, key, value);
      }

      const startTime = Date.now();

      // Retrieve all settings
      const retrievedSettings = {};
      for (const key of Object.keys(settings)) {
        retrievedSettings[key] = await db.getSetting(testChatId, key, null);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should be fast
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify all settings were retrieved correctly
      expect(retrievedSettings).toEqual(settings);
    });

    it('should handle whitelist operations efficiently', async () => {
      const keywords = ['crypto', 'blockchain', 'defi', 'nft', 'trading'];

      const startTime = Date.now();

      // Add keywords
      for (const keyword of keywords) {
        await db.addWhitelistKeyword(testChatId, keyword);
      }

      // Retrieve keywords
      const retrievedKeywords = await db.getWhitelistKeywords(testChatId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should be efficient
      expect(duration).toBeLessThan(2000); // 2 seconds
      expect(retrievedKeywords).toEqual(expect.arrayContaining(keywords));
    });
  });
});
