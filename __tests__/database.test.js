import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as db from '../src/common/services/database.js'; // Make sure this path is correct

// Mock the logger to prevent console noise during tests
vi.mock('../src/common/services/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Database Service', () => {
  // This hook runs BEFORE EACH test in this file
  beforeEach(async () => {
    // Creates a fresh in-memory database and all tables for every test
    await db.initializeDatabase(true);
  });

  // This hook runs AFTER EACH test in this file
  afterEach(async () => {
    const connection = db.getDb();
    if (connection) {
      await connection.close();
    }
    // This is crucial to allow the next test to re-initialize cleanly
    db.setDb(null);
  });

  describe('Original Tests', () => {
    it('should set and get a setting', async () => {
      await db.setSetting('chat1', 'testKey', 'testValue');
      const value = await db.getSetting('chat1', 'testKey', 'default');
      expect(value).toBe('testValue');
    });

    it('should return default value for a non-existent setting', async () => {
      const value = await db.getSetting('chat1', 'nonExistentKey', 'defaultValue');
      expect(value).toBe('defaultValue');
    });

    it('should add and retrieve a group', async () => {
      await db.addGroup('-1001', 'Test Group');
      const group = await db.getGroup('-1001');
      expect(group).not.toBeNull();
      expect(group.chatTitle).toBe('Test Group');
    });

    it('should record a strike and update the count', async () => {
      const logData = { timestamp: new Date().toISOString(), reason: 'Test' };
      const strikeCount = await db.recordStrike('chat1', 'user1', logData);
      expect(strikeCount).toBe(1);
      const secondStrikeCount = await db.recordStrike('chat1', 'user1', logData);
      expect(secondStrikeCount).toBe(2);
    });

    it('should reset strikes', async () => {
      const logData = { timestamp: new Date().toISOString(), reason: 'Test' };
      await db.recordStrike('chat1', 'user1', logData);
      await db.resetStrikes('chat1', 'user1');
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(0);
    });

    it('should manage keyword whitelist', async () => {
      await db.addWhitelistKeyword('chat1', 'keyword1');
      const keywords = await db.getWhitelistKeywords('chat1');
      expect(keywords).toContain('keyword1');
      await db.removeWhitelistKeyword('chat1', 'keyword1');
      const keywordsAfterRemove = await db.getWhitelistKeywords('chat1');
      expect(keywordsAfterRemove).not.toContain('keyword1');
    });
  });

  describe('Manual Strike Management', () => {
    it('addStrikes should add strikes to a user with none', async () => {
      await db.addStrikes('chat1', 'user1', 3);
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(3);
    });

    it('addStrikes should add strikes to an existing count', async () => {
      await db.addStrikes('chat1', 'user1', 2);
      await db.addStrikes('chat1', 'user1', 3);
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(5);
    });

    it('removeStrike should subtract strikes from an existing count', async () => {
      await db.addStrikes('chat1', 'user1', 5);
      await db.removeStrike('chat1', 'user1', 2);
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(3);
    });

    it('removeStrike should not go below zero', async () => {
      await db.addStrikes('chat1', 'user1', 2);
      await db.removeStrike('chat1', 'user1', 5);
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(0);
    });

    it('setStrikes should set the strike count to a specific value', async () => {
      await db.setStrikes('chat1', 'user1', 10);
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(10);
    });

    it('manual strike adjustments should not update the strike timestamp initially', async () => {
      // THE FIX: Disable strike expiration for this specific test
      await db.setSetting('chat1', 'strikeExpirationDays', 0);

      const initialTimestamp = new Date('2023-01-01T12:00:00.000Z').toISOString();
      await db
        .getDb()
        .run(
          'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, ?, ?)',
          'chat1',
          'user1',
          1,
          initialTimestamp
        );
      await db.addStrikes('chat1', 'user1', 1);
      const { timestamp } = await db.getStrikes('chat1', 'user1');
      expect(timestamp).toBe(initialTimestamp);
    });

    it('getStrikeHistory should retrieve only logs for the specified user', async () => {
      await db.recordStrike('chat1', 'user1', {
        timestamp: new Date().toISOString(),
        reason: 'user1 reason',
      });
      await db.recordStrike('chat1', 'user2', {
        timestamp: new Date().toISOString(),
        reason: 'user2 reason',
      });
      const history = await db.getStrikeHistory('chat1', 'user1', 5);
      expect(history.length).toBe(1);
      expect(history[0].logData).toContain('user1 reason');
    });
  });

  describe('Strike Expiration', () => {
    it('recalculateStrikes should remove expired strikes', async () => {
      // Set strike expiration to 30 days
      await db.setSetting('chat1', 'strikeExpirationDays', 30);

      // Record a strike that is 40 days old
      const oldTimestamp = new Date();
      oldTimestamp.setDate(oldTimestamp.getDate() - 40);
      await db
        .getDb()
        .run(
          'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, ?, ?)',
          'chat1',
          'user1',
          1,
          oldTimestamp.toISOString()
        );

      // Recalculate and check strikes
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(0);
    });

    it('recalculateStrikes should not remove recent strikes', async () => {
      // Set strike expiration to 30 days
      await db.setSetting('chat1', 'strikeExpirationDays', 30);

      // Record a strike that is 10 days old
      const recentTimestamp = new Date();
      recentTimestamp.setDate(recentTimestamp.getDate() - 10);
      await db
        .getDb()
        .run(
          'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, ?, ?)',
          'chat1',
          'user1',
          1,
          recentTimestamp.toISOString()
        );

      // Recalculate and check strikes
      const { count } = await db.getStrikes('chat1', 'user1');
      expect(count).toBe(1);
    });
  });
});
