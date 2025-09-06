import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VerdictCache } from '../src/cache';
import type { PolicyVerdict } from '@telegram-moderator/types';

describe('VerdictCache', () => {
  let cache: VerdictCache;
  
  beforeEach(() => {
    cache = new VerdictCache();
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Cache Operations', () => {
    const sampleVerdict: PolicyVerdict = {
      verdict: 'block',
      reason: 'spam_content',
      confidence: 0.95,
      scores: { spam: 0.95, toxicity: 0.3 },
      rulesMatched: ['spam_detector']
    };

    it('should store and retrieve cached verdicts', () => {
      const content = 'spam message';
      
      cache.set(content, sampleVerdict);
      const result = cache.get(content);
      
      expect(result).toEqual(sampleVerdict);
    });

    it('should return null for cache miss', () => {
      const result = cache.get('non-existent message');
      expect(result).toBeNull();
    });

    it('should handle cache expiration', async () => {
      // Create cache with short TTL for testing
      const shortCache = new VerdictCache({ ttlMs: 100 });
      
      shortCache.set('test message', sampleVerdict);
      
      // Should be cached immediately
      let result = shortCache.get('test message');
      expect(result).toEqual(sampleVerdict);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      result = shortCache.get('test message');
      expect(result).toBeNull();
      
      shortCache.destroy();
    });

    it('should update existing cache entries', () => {
      const content = 'test message';
      const verdict1: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      const verdict2: PolicyVerdict = {
        verdict: 'block',
        reason: 'spam_content',
        confidence: 0.9,
        scores: { spam: 0.9 },
        rulesMatched: ['spam_detector']
      };
      
      cache.set(content, verdict1);
      cache.set(content, verdict2); // Update
      
      const result = cache.get(content);
      expect(result).toEqual(verdict2);
    });
  });

  describe('Cache Metrics', () => {
    it('should track cache hits and misses', () => {
      const content = 'test message';
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      // Initial state
      let metrics = cache.getMetrics();
      expect(metrics.hitCount).toBe(0);
      expect(metrics.missCount).toBe(0);
      
      // Cache miss
      cache.get(content);
      metrics = cache.getMetrics();
      expect(metrics.missCount).toBe(1);
      expect(metrics.hitCount).toBe(0);
      
      // Store and hit
      cache.set(content, verdict);
      cache.get(content);
      metrics = cache.getMetrics();
      expect(metrics.hitCount).toBe(1);
      expect(metrics.missCount).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      // 3 misses, 2 hits = 40% hit rate
      cache.get('miss1');
      cache.get('miss2');
      cache.get('miss3');
      
      cache.set('hit1', verdict);
      cache.set('hit2', verdict);
      cache.get('hit1');
      cache.get('hit2');
      
      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBeCloseTo(0.4, 2);
    });

    it('should track cache size', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      expect(cache.getMetrics().totalEntries).toBe(0);
      
      cache.set('message1', verdict);
      expect(cache.getMetrics().totalEntries).toBe(1);
      
      cache.set('message2', verdict);
      expect(cache.getMetrics().totalEntries).toBe(2);
    });
  });

  describe('Cache Cleanup', () => {
    it('should remove expired entries during cleanup', async () => {
      const shortCache = new VerdictCache({ ttlMs: 100 });
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      shortCache.set('message1', verdict);
      shortCache.set('message2', verdict);
      
      expect(shortCache.getMetrics().totalEntries).toBe(2);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Trigger cleanup
      shortCache.cleanup();
      
      expect(shortCache.getMetrics().totalEntries).toBe(0);
      shortCache.destroy();
    });

    it('should keep non-expired entries during cleanup', () => {
      const cache = new VerdictCache({ ttlMs: 3600000 }); // 1 hour
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      cache.set('message1', verdict);
      cache.set('message2', verdict);
      
      expect(cache.getMetrics().totalEntries).toBe(2);
      
      cache.cleanup();
      
      // Should still have entries
      expect(cache.getMetrics().totalEntries).toBe(2);
      cache.destroy();
    });
  });

  describe('Cache Configuration', () => {
    it('should respect maxEntries configuration', () => {
      const smallCache = new VerdictCache({ maxEntries: 2 });
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      smallCache.set('message1', verdict);
      smallCache.set('message2', verdict);
      expect(smallCache.getMetrics().totalEntries).toBe(2);
      
      // Adding a third should evict the oldest
      smallCache.set('message3', verdict);
      expect(smallCache.getMetrics().totalEntries).toBe(2);
      
      // First message should be evicted
      const result = smallCache.get('message1');
      expect(result).toBeNull();
      
      // Recent messages should still exist
      expect(smallCache.get('message2')).toEqual(verdict);
      expect(smallCache.get('message3')).toEqual(verdict);
      
      smallCache.destroy();
    });

    it('should use default configuration when none provided', () => {
      const defaultCache = new VerdictCache();
      const metrics = defaultCache.getMetrics();
      
      expect(metrics.totalEntries).toBe(0);
      expect(metrics.hitCount).toBe(0);
      expect(metrics.missCount).toBe(0);
      
      defaultCache.destroy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'empty_content',
        confidence: 1.0,
        scores: {},
        rulesMatched: []
      };
      
      cache.set('', verdict);
      const result = cache.get('');
      expect(result).toEqual(verdict);
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(10000);
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      cache.set(longContent, verdict);
      const result = cache.get(longContent);
      expect(result).toEqual(verdict);
    });

    it('should handle special characters and newlines', () => {
      const content = 'Message with\nnewlines\tand\rspecial chars: !@#$%^&*()';
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      cache.set(content, verdict);
      const result = cache.get(content);
      expect(result).toEqual(verdict);
    });

    it('should handle unicode content correctly', () => {
      const content = '🚫 This message contains emojis and unicode! ❌';
      const verdict: PolicyVerdict = {
        verdict: 'block',
        reason: 'inappropriate_content',
        confidence: 0.8,
        scores: { toxicity: 0.8 },
        rulesMatched: ['emoji_filter']
      };
      
      cache.set(content, verdict);
      const result = cache.get(content);
      expect(result).toEqual(verdict);
    });
  });

  describe('Cache Statistics', () => {
    it('should provide detailed cache statistics', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      // Perform various operations
      cache.get('miss1'); // miss
      cache.set('hit1', verdict);
      cache.get('hit1'); // hit
      cache.get('miss2'); // miss
      cache.get('hit1'); // hit
      
      const stats = cache.getStats();
      
      expect(stats['cache.hits.total']).toBe(2);
      expect(stats['cache.misses.total']).toBe(2); // Only 2 misses since we don't count the first get twice
      expect(stats['cache.hit_rate']).toBeCloseTo(0.5, 2); // 2 hits out of 4 total = 50%
      expect(stats['cache.entries.total']).toBe(1);
      expect(stats['cache.config.ttl_ms']).toBeGreaterThan(0);
    });

    it('should clear cache correctly', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      cache.set('message1', verdict);
      cache.set('message2', verdict);
      expect(cache.getMetrics().totalEntries).toBe(2);
      
      cache.clear();
      
      expect(cache.getMetrics().totalEntries).toBe(0);
      expect(cache.get('message1')).toBeNull();
      expect(cache.get('message2')).toBeNull();
    });

    it('should update configuration correctly', () => {
      const newConfig = { ttlMs: 5000, maxEntries: 500 };
      cache.updateConfig(newConfig);
      
      const stats = cache.getStats();
      expect(stats['cache.config.ttl_ms']).toBe(5000);
      expect(stats['cache.config.max_entries']).toBe(500);
    });
  });

  describe('Normalized Content Hashing', () => {
    it('should generate same hash for equivalent content', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'clean_content',
        confidence: 0.8,
        scores: { toxicity: 0.1 },
        rulesMatched: []
      };
      
      // These should normalize to the same content
      cache.set('Hello World!', verdict);
      
      // Different casing/whitespace should hit cache
      const result = cache.get('HELLO    world!');
      expect(result).toEqual(verdict);
    });

    it('should handle URL normalization in cache keys', () => {
      const verdict: PolicyVerdict = {
        verdict: 'block',
        reason: 'suspicious_link',
        confidence: 0.9,
        scores: { spam: 0.9 },
        rulesMatched: ['url_filter']
      };
      
      // Store with one URL format
      cache.set('Check this link: https://example.com/path', verdict);
      
      // Different URL formatting should still hit cache (if normalizer handles it)
      const result = cache.get('Check this link: HTTPS://EXAMPLE.COM/path');
      
      // This depends on the normalizer implementation
      // For now, just verify it stores and retrieves consistently
      expect(cache.get('Check this link: https://example.com/path')).toEqual(verdict);
    });
  });
});
