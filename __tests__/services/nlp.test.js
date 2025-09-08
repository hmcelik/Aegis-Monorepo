import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPromotional,
  hasProfanity,
  analyzeMessage,
} from '@telegram-moderator/shared/src/services/nlp.js';

// Mock the logger to prevent console noise during tests
vi.mock('@telegram-moderator/shared/src/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock OpenAI to prevent actual API calls
vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('API not available in tests')),
        },
      };
    }
  },
}));

describe('NLP Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Note: These tests expect the service to return safe defaults when OpenAI API is unavailable
  // In production with a valid API key, the service would return actual classification results

  describe('Spam Detection (isPromotional)', () => {
    it('should return valid response structure for any input', async () => {
      const testMessages = [
        'Buy now! Limited time offer! 50% off!',
        'Hello everyone! How are you doing today?',
        '',
        '🚀🚀🚀',
      ];

      for (const message of testMessages) {
        const result = await isPromotional(message);
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(typeof result.isSpam).toBe('boolean');
        // Service should return valid results - either API results or safe defaults
        expect(result.score >= 0 && result.score <= 1).toBe(true);
      }
    }, 10000); // 10 second timeout

    it('should handle concurrent requests correctly', async () => {
      const message = 'Test message for concurrent processing';
      const promises = Array.from({ length: 5 }, () => isPromotional(message));

      const results = await Promise.all(promises);

      // All results should be valid and consistent
      results.forEach(result => {
        expect(typeof result.score).toBe('number');
        expect(typeof result.isSpam).toBe('boolean');
        expect(result.score >= 0 && result.score <= 1).toBe(true);
      });
    });

    it('should handle whitelist keywords parameter', async () => {
      const message = 'Check out this amazing crypto project!';
      const whitelistKeywords = ['crypto', 'project', 'amazing'];

      const result = await isPromotional(message, whitelistKeywords);

      expect(typeof result.score).toBe('number');
      expect(typeof result.isSpam).toBe('boolean');
      // Service accepts whitelist parameter without error
      expect(result.score >= 0 && result.score <= 1).toBe(true);
    });
  });

  describe('Profanity Detection (hasProfanity)', () => {
    it('should return valid response structure for profanity analysis', async () => {
      const testMessages = [
        'This is a clean message',
        'What the hell is going on?',
        'F*** this stupid thing',
        '',
      ];

      for (const message of testMessages) {
        const result = await hasProfanity(message);
        expect(typeof result.hasProfanity).toBe('boolean');
        expect(typeof result.severity).toBe('number');
        expect(result.severity).toBeGreaterThanOrEqual(0);
        expect(result.severity).toBeLessThanOrEqual(1);
        expect(typeof result.type).toBe('string');
      }
    });

    it('should detect obvious profanity patterns locally', async () => {
      const profaneMessage = 'This is fucking ridiculous';

      const result = await hasProfanity(profaneMessage);

      // Should detect profanity via local patterns
      expect(result.hasProfanity).toBe(true);
      expect(result.severity).toBeGreaterThan(0);
      expect(result.type).toBe('explicit');
    });

    it('should handle clean messages appropriately', async () => {
      const cleanMessage = 'Hello everyone, how are you today?';

      const result = await hasProfanity(cleanMessage);

      expect(typeof result.hasProfanity).toBe('boolean');
      expect(typeof result.severity).toBe('number');
      expect(result.severity >= 0 && result.severity <= 1).toBe(true);
    });
  });

  describe('Combined Analysis (analyzeMessage)', () => {
    it('should return results for both spam and profanity analysis', async () => {
      const message = 'Check out this fucking amazing crypto project!';
      const whitelistKeywords = ['crypto', 'project'];

      const result = await analyzeMessage(message, whitelistKeywords);

      // Check spam results
      expect(typeof result.spam.score).toBe('number');
      expect(typeof result.spam.isSpam).toBe('boolean');
      expect(result.spam.score >= 0 && result.spam.score <= 1).toBe(true);

      // Check profanity results
      expect(typeof result.profanity.hasProfanity).toBe('boolean');
      expect(typeof result.profanity.severity).toBe('number');
      expect(result.profanity.severity >= 0 && result.profanity.severity <= 1).toBe(true);
      expect(typeof result.profanity.type).toBe('string');
    });

    it('should handle concurrent combined analysis', async () => {
      const message = 'Test message for concurrent combined processing';
      const promises = Array.from({ length: 3 }, () => analyzeMessage(message));

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(typeof result.spam.score).toBe('number');
        expect(typeof result.spam.isSpam).toBe('boolean');
        expect(typeof result.profanity.hasProfanity).toBe('boolean');
        expect(typeof result.profanity.severity).toBe('number');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle null and undefined inputs gracefully', async () => {
      // Spam analysis
      const nullSpamResult = await isPromotional(null);
      expect(nullSpamResult.isSpam).toBe(false);
      expect(nullSpamResult.score).toBe(0);

      const undefinedSpamResult = await isPromotional(undefined);
      expect(undefinedSpamResult.isSpam).toBe(false);
      expect(undefinedSpamResult.score).toBe(0);

      // Profanity analysis
      const nullProfanityResult = await hasProfanity(null);
      expect(nullProfanityResult.hasProfanity).toBe(false);
      expect(nullProfanityResult.severity).toBe(0);

      const undefinedProfanityResult = await hasProfanity(undefined);
      expect(undefinedProfanityResult.hasProfanity).toBe(false);
      expect(undefinedProfanityResult.severity).toBe(0);
    });

    it('should handle non-string inputs appropriately', async () => {
      const nonStringInputs = [123, true, {}, [], new Date()];

      for (const input of nonStringInputs) {
        const spamResult = await isPromotional(input);
        expect(typeof spamResult.score).toBe('number');
        expect(typeof spamResult.isSpam).toBe('boolean');
        expect(spamResult.score >= 0 && spamResult.score <= 1).toBe(true);

        const profanityResult = await hasProfanity(input);
        expect(typeof profanityResult.severity).toBe('number');
        expect(typeof profanityResult.hasProfanity).toBe('boolean');
        expect(profanityResult.severity >= 0 && profanityResult.severity <= 1).toBe(true);
      }
    }, 15000); // 15 second timeout to account for API calls

    it('should handle extremely long messages', async () => {
      const longMessage = 'This is a very long message. '.repeat(200);

      const spamResult = await isPromotional(longMessage);
      expect(typeof spamResult.score).toBe('number');
      expect(spamResult.score).toBeGreaterThanOrEqual(0);
      expect(spamResult.score).toBeLessThanOrEqual(1);
      expect(typeof spamResult.isSpam).toBe('boolean');

      const profanityResult = await hasProfanity(longMessage);
      expect(typeof profanityResult.severity).toBe('number');
      expect(profanityResult.severity).toBeGreaterThanOrEqual(0);
      expect(profanityResult.severity).toBeLessThanOrEqual(1);
      expect(typeof profanityResult.hasProfanity).toBe('boolean');
    });

    it('should handle empty and whitespace-only messages', async () => {
      const emptyInputs = ['', '   ', '\n\t  ', '   \n   '];

      for (const input of emptyInputs) {
        const spamResult = await isPromotional(input);
        expect(spamResult.isSpam).toBe(false);
        expect(spamResult.score).toBe(0);

        const profanityResult = await hasProfanity(input);
        expect(profanityResult.hasProfanity).toBe(false);
        expect(profanityResult.severity).toBe(0);
      }
    });
  });
});
