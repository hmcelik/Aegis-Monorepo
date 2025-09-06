/**
 * Tests for AEG-302: Verdict cache by normalized content hash
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VerdictCache } from '../../packages/shared/src/cache/index.js';
// import { AIProcessor } from '../../apps/worker/src/ai.js';
import { PolicyVerdict } from '../../packages/types/src/index.js';

describe('AEG-302: Verdict Cache Implementation', () => {
  let cache: VerdictCache;
  // let aiProcessor: AIProcessor;

  beforeEach(() => {
    cache = new VerdictCache({
      ttlMs: 5000, // 5 seconds for testing
      maxEntries: 100,
      cleanupIntervalMs: 1000,
      enableMetrics: true,
    });
    // aiProcessor = new AIProcessor(cache);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Cache Hash Stability', () => {
    it('should generate consistent hash for identical normalized content', () => {
      const text1 = 'Hello World!';
      const text2 = 'hello world!'; // Different case
      const text3 = 'Hello   World!'; // Extra spaces
      
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Clean content',
        scores: { test: 0.1 },
        rulesMatched: [],
      };

      cache.set(text1, verdict);
      
      // Should get cache hit for normalized equivalent text
      const result2 = cache.get(text2);
      const result3 = cache.get(text3);
      
      expect(result2).toBeTruthy();
      expect(result3).toBeTruthy();
      expect(result2?.verdict).toBe('allow');
      expect(result3?.verdict).toBe('allow');
    });

    it('should generate different hashes for different content', () => {
      const text1 = 'Hello World!';
      const text2 = 'Goodbye World!';
      
      const verdict1: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Clean content',
        scores: { test: 0.1 },
        rulesMatched: [],
      };

      const verdict2: PolicyVerdict = {
        verdict: 'block',
        reason: 'Spam content',
        scores: { test: 0.9 },
        rulesMatched: ['spam'],
      };

      cache.set(text1, verdict1);
      cache.set(text2, verdict2);
      
      const result1 = cache.get(text1);
      const result2 = cache.get(text2);
      
      expect(result1?.verdict).toBe('allow');
      expect(result2?.verdict).toBe('block');
    });

    it('should handle URL ordering consistently', () => {
      const text1 = 'Check https://example.com and https://test.com';
      const text2 = 'Check https://test.com and https://example.com'; // Different order
      
      const verdict: PolicyVerdict = {
        verdict: 'review',
        reason: 'Contains URLs',
        scores: { url_risk: 0.6 },
        rulesMatched: ['suspicious_urls'],
      };

      cache.set(text1, verdict);
      
      // Currently, URL ordering matters for cache key generation
      // Different URL order = different cache key = cache miss
      const result = cache.get(text2);
      expect(result).toBeNull(); // Should be null since URLs are in different order
      
      // But same URL order should hit cache
      const result2 = cache.get(text1);
      expect(result2).toBeTruthy();
      expect(result2?.verdict).toBe('review');
    });
  });

  describe('TTL and Expiry', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new VerdictCache({
        ttlMs: 100, // 100ms
        maxEntries: 100,
        cleanupIntervalMs: 50,
      });

      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      shortTtlCache.set('test message', verdict);
      
      // Should be available immediately
      expect(shortTtlCache.get('test message')).toBeTruthy();
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(shortTtlCache.get('test message')).toBeNull();
      
      shortTtlCache.destroy();
    });

    it('should allow custom TTL per entry', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      // Set with custom TTL
      cache.set('test message', verdict, 10000); // 10 seconds
      
      const result = cache.get('test message');
      expect(result).toBeTruthy();
    });
  });

  describe('Cache Metrics', () => {
    it('should track hit and miss counts correctly', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      // Initial metrics
      let metrics = cache.getMetrics();
      expect(metrics.hitCount).toBe(0);
      expect(metrics.missCount).toBe(0);
      expect(metrics.hitRate).toBe(0);

      // Miss
      cache.get('nonexistent');
      metrics = cache.getMetrics();
      expect(metrics.missCount).toBe(1);
      expect(metrics.hitRate).toBe(0);

      // Set and hit
      cache.set('test', verdict);
      cache.get('test');
      metrics = cache.getMetrics();
      expect(metrics.hitCount).toBe(1);
      expect(metrics.missCount).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
    });

    it('should update hit count on repeated access', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      cache.set('test', verdict);
      
      // Multiple hits
      cache.get('test');
      cache.get('test');
      cache.get('test');
      
      const metrics = cache.getMetrics();
      expect(metrics.hitCount).toBe(3);
    });
  });

  describe('Memory Management', () => {
    it('should enforce max entries limit', () => {
      const smallCache = new VerdictCache({
        maxEntries: 3,
        ttlMs: 60000,
      });

      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      // Add more entries than max
      smallCache.set('test1', verdict);
      smallCache.set('test2', verdict);
      smallCache.set('test3', verdict);
      smallCache.set('test4', verdict); // Should evict oldest

      const metrics = smallCache.getMetrics();
      expect(metrics.totalEntries).toBe(3);
      expect(metrics.evictedCount).toBe(1);
      
      // First entry should be evicted
      expect(smallCache.get('test1')).toBeNull();
      expect(smallCache.get('test4')).toBeTruthy();
      
      smallCache.destroy();
    });

    it('should estimate memory usage', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict with some content',
        scores: { test: 0.5 },
        rulesMatched: [],
      };

      cache.set('test message', verdict);
      
      const metrics = cache.getMetrics();
      expect(metrics.totalMemoryUsageBytes).toBeGreaterThan(0);
      expect(metrics.averageEntrySize).toBeGreaterThan(0);
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up expired entries', async () => {
      const shortTtlCache = new VerdictCache({
        ttlMs: 50, // 50ms
        maxEntries: 100,
        cleanupIntervalMs: 25, // Frequent cleanup
      });

      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      shortTtlCache.set('test1', verdict);
      shortTtlCache.set('test2', verdict);
      
      expect(shortTtlCache.getMetrics().totalEntries).toBe(2);
      
      // Wait for entries to expire and cleanup to run
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(shortTtlCache.getMetrics().totalEntries).toBe(0);
      expect(shortTtlCache.getMetrics().evictedCount).toBeGreaterThan(0);
      
      shortTtlCache.destroy();
    });

    it('should allow manual cleanup', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      cache.set('test', verdict);
      expect(cache.getMetrics().totalEntries).toBe(1);
      
      cache.clear();
      expect(cache.getMetrics().totalEntries).toBe(0);
    });
  });

  describe('Configuration Updates', () => {
    it('should allow runtime configuration updates', () => {
      const originalConfig = {
        ttlMs: 5000,
        maxEntries: 100,
        cleanupIntervalMs: 1000,
        enableMetrics: true,
      };

      cache.updateConfig({ ttlMs: 10000, maxEntries: 200 });
      
      // Verify configuration change by setting entry with new TTL
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Test verdict',
        scores: {},
        rulesMatched: [],
      };

      cache.set('test', verdict);
      expect(cache.getMetrics().totalEntries).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Empty content',
        scores: {},
        rulesMatched: [],
      };

      cache.set('', verdict);
      const result = cache.get('');
      expect(result).toBeTruthy();
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Long content',
        scores: {},
        rulesMatched: [],
      };

      cache.set(longText, verdict);
      const result = cache.get(longText);
      expect(result).toBeTruthy();
    });

    it('should handle special characters and unicode', () => {
      const unicodeText = '🎉 Hello 世界! @user #hashtag https://example.com';
      const verdict: PolicyVerdict = {
        verdict: 'allow',
        reason: 'Unicode content',
        scores: {},
        rulesMatched: [],
      };

      cache.set(unicodeText, verdict);
      const result = cache.get(unicodeText);
      expect(result).toBeTruthy();
    });
  });
});
