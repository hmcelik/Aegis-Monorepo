/**
 * AEG-302: Verdict cache by normalized content hash
 *
 * This module implements a content-based caching system that:
 * 1. Uses SHA-256 of normalized text as cache key
 * 2. Short-circuits AI calls on cache hits
 * 3. Provides configurable TTL for cache entries
 * 4. Exports hit/miss metrics for monitoring
 */

import { createHash } from 'crypto';
import { normalize } from '@telegram-moderator/normalizer';
import { PolicyVerdict } from '@telegram-moderator/types';
import logger from '../services/logger';

export interface CacheEntry {
  verdict: PolicyVerdict;
  timestamp: number;
  ttlMs: number;
  hitCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface CacheMetrics {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictedCount: number;
  totalMemoryUsageBytes: number;
  averageEntrySize: number;
}

export interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
  cleanupIntervalMs: number;
  enableMetrics: boolean;
}

export class VerdictCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ttlMs: config.ttlMs ?? 3600000, // Default: 1 hour
      maxEntries: config.maxEntries ?? 10000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 300000, // 5 minutes
      enableMetrics: config.enableMetrics ?? true,
    };

    this.metrics = {
      totalEntries: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      evictedCount: 0,
      totalMemoryUsageBytes: 0,
      averageEntrySize: 0,
    };

    this.startCleanupTimer();
  }

  /**
   * Generates a SHA-256 hash of normalized content
   */
  private generateCacheKey(text: string): string {
    const normalized = normalize(text);
    const content = JSON.stringify({
      text: normalized.normalizedText,
      urls: normalized.urls.sort(),
      mentions: normalized.mentions.sort(),
      hashtags: normalized.hashtags.sort(),
    });

    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Checks if a cache entry is still valid
   */
  private isEntryValid(entry: CacheEntry): boolean {
    const now = Date.now();
    return now - entry.timestamp < entry.ttlMs;
  }

  /**
   * Retrieves a verdict from cache if available and valid
   */
  get(text: string): PolicyVerdict | null {
    const key = this.generateCacheKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return null;
    }

    if (!this.isEntryValid(entry)) {
      this.cache.delete(key);
      this.recordMiss();
      this.metrics.evictedCount++;
      return null;
    }

    // Update access statistics
    entry.hitCount++;
    entry.lastAccessedAt = new Date();
    this.recordHit();

    logger.info('Cache hit for content', {
      key: key.substring(0, 8) + '...',
      verdict: entry.verdict.verdict,
      hitCount: entry.hitCount,
      age: Date.now() - entry.timestamp,
    });

    return entry.verdict;
  }

  /**
   * Stores a verdict in cache
   */
  set(text: string, verdict: PolicyVerdict, customTtlMs?: number): void {
    const key = this.generateCacheKey(text);
    const ttlMs = customTtlMs ?? this.config.ttlMs;
    const now = new Date();

    const entry: CacheEntry = {
      verdict,
      timestamp: Date.now(),
      ttlMs,
      hitCount: 0,
      createdAt: now,
      lastAccessedAt: now,
    };

    // Enforce max entries limit
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictOldestEntry();
    }

    this.cache.set(key, entry);
    this.updateMetrics();

    logger.info('Verdict cached', {
      key: key.substring(0, 8) + '...',
      verdict: verdict.verdict,
      ttlMs,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Evicts the oldest cache entry
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Number.MAX_SAFE_INTEGER;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.metrics.evictedCount++;
    }
  }

  /**
   * Records a cache hit
   */
  private recordHit(): void {
    if (this.config.enableMetrics) {
      this.metrics.hitCount++;
      this.updateHitRate();
    }
  }

  /**
   * Records a cache miss
   */
  private recordMiss(): void {
    if (this.config.enableMetrics) {
      this.metrics.missCount++;
      this.updateHitRate();
    }
  }

  /**
   * Updates the hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.metrics.hitCount + this.metrics.missCount;
    this.metrics.hitRate = total > 0 ? this.metrics.hitCount / total : 0;
  }

  /**
   * Updates memory usage metrics
   */
  private updateMetrics(): void {
    this.metrics.totalEntries = this.cache.size;

    // Estimate memory usage (rough calculation)
    let totalSize = 0;
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16 encoding
      totalSize += JSON.stringify(entry.verdict).length * 2;
      totalSize += 64; // Estimated overhead per entry
    }

    this.metrics.totalMemoryUsageBytes = totalSize;
    this.metrics.averageEntrySize = this.cache.size > 0 ? totalSize / this.cache.size : 0;
  }

  /**
   * Starts the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Removes expired entries from cache
   */
  cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isEntryValid(entry)) {
        this.cache.delete(key);
        removedCount++;
        this.metrics.evictedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateMetrics();
      logger.info('Cache cleanup completed', {
        removedCount,
        remainingEntries: this.cache.size,
      });
    }
  }

  /**
   * Returns current cache metrics
   */
  getMetrics(): CacheMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Clears all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.updateMetrics();
    logger.info('Cache cleared');
  }

  /**
   * Updates cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Cache configuration updated', this.config);
  }

  /**
   * Stops the cleanup timer and cleans up resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
    logger.info('Verdict cache destroyed');
  }

  /**
   * Gets cache statistics for monitoring
   */
  getStats(): Record<string, number> {
    const metrics = this.getMetrics();
    return {
      'cache.entries.total': metrics.totalEntries,
      'cache.hits.total': metrics.hitCount,
      'cache.misses.total': metrics.missCount,
      'cache.hit_rate': metrics.hitRate,
      'cache.evicted.total': metrics.evictedCount,
      'cache.memory.bytes': metrics.totalMemoryUsageBytes,
      'cache.entry.avg_size': metrics.averageEntrySize,
      'cache.config.ttl_ms': this.config.ttlMs,
      'cache.config.max_entries': this.config.maxEntries,
    };
  }
}

// Export a default instance with standard configuration
export const defaultVerdictCache = new VerdictCache({
  ttlMs: 3600000, // 1 hour
  maxEntries: 10000,
  cleanupIntervalMs: 300000, // 5 minutes
  enableMetrics: true,
});

export default VerdictCache;
