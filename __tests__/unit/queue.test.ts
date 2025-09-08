import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getShardForChat } from '../../packages/shared/src/queue/messageQueue.js';

// Mock the external dependencies
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    on: vi.fn(),
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn(),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('Queue Utilities (AEG-101)', () => {
  describe('getShardForChat', () => {
    it('should consistently map chat IDs to the same shard', () => {
      const chatId = '123456789';
      const shardCount = 4;

      const shard1 = getShardForChat(chatId, shardCount);
      const shard2 = getShardForChat(chatId, shardCount);

      expect(shard1).toBe(shard2);
      expect(shard1).toBeGreaterThanOrEqual(0);
      expect(shard1).toBeLessThan(shardCount);
    });

    it('should distribute different chat IDs across shards', () => {
      const shardCount = 4;
      const chatIds = ['123', '456', '789', '101112', '131415'];
      const shards = chatIds.map(id => getShardForChat(id, shardCount));

      // Should have some distribution (not all the same shard)
      const uniqueShards = new Set(shards);
      expect(uniqueShards.size).toBeGreaterThan(1);

      // All shards should be valid
      shards.forEach(shard => {
        expect(shard).toBeGreaterThanOrEqual(0);
        expect(shard).toBeLessThan(shardCount);
      });
    });

    it('should handle edge cases', () => {
      expect(getShardForChat('', 4)).toBeGreaterThanOrEqual(0);
      expect(getShardForChat('a', 1)).toBe(0);
      expect(getShardForChat('very-long-chat-id-with-special-chars-!@#$%', 8)).toBeLessThan(8);
    });
  });
});
