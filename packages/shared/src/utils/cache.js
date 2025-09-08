/**
 * High-performance cache layer with TTL, memory management, and graceful degradation
 *
 * Features:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Memory usage monitoring
 * - Circuit breaker integration for external cache
 * - Graceful degradation when cache fails
 * - Performance metrics
 */

import logger from '../services/logger.js';
import { CircuitBreaker } from './circuitBreaker.js';

class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 300000; // 5 minutes
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.maxMemoryMB = options.maxMemoryMB || 50;

    this.data = new Map();
    this.accessTimes = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryUsage: 0,
    };

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.data.get(key);

    if (!entry) {
      this.metrics.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      this.accessTimes.delete(key);
      this.metrics.misses++;
      return undefined;
    }

    // Update access time for LRU
    this.accessTimes.set(key, Date.now());
    this.metrics.hits++;

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, ttl = this.defaultTtl) {
    try {
      // Check memory usage before adding
      this.checkMemoryUsage();

      const now = Date.now();
      const entry = {
        value,
        expiry: ttl ? now + ttl : null,
        size: this.estimateSize(value),
      };

      // Remove old entry if exists
      if (this.data.has(key)) {
        this.data.delete(key);
      }

      // Add new entry
      this.data.set(key, entry);
      this.accessTimes.set(key, now);
      this.metrics.sets++;

      // Enforce size limits
      this.enforceSizeLimit();

      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  delete(key) {
    const deleted = this.data.delete(key);
    this.accessTimes.delete(key);

    if (deleted) {
      this.metrics.deletes++;
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.data.clear();
    this.accessTimes.clear();
    this.metrics = { ...this.metrics, hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    const entry = this.data.get(key);

    if (!entry) return false;

    // Check if expired
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      this.accessTimes.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate =
      this.metrics.hits + this.metrics.misses > 0
        ? ((this.metrics.hits / (this.metrics.hits + this.metrics.misses)) * 100).toFixed(2)
        : 0;

    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      size: this.data.size,
      maxSize: this.maxSize,
      memoryUsageMB: this.getMemoryUsage(),
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.data.entries()) {
      if (entry.expiry && now > entry.expiry) {
        this.data.delete(key);
        this.accessTimes.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }

    this.updateMemoryUsage();
  }

  /**
   * Enforce cache size limits using LRU eviction
   */
  enforceSizeLimit() {
    while (this.data.size > this.maxSize) {
      // Find least recently used entry
      let oldestKey = null;
      let oldestTime = Date.now();

      for (const [key, time] of this.accessTimes.entries()) {
        if (time < oldestTime) {
          oldestTime = time;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.data.delete(oldestKey);
        this.accessTimes.delete(oldestKey);
        this.metrics.evictions++;
      } else {
        break; // Safety break
      }
    }
  }

  /**
   * Check memory usage and trigger cleanup if needed
   */
  checkMemoryUsage() {
    const memoryUsage = this.getMemoryUsage();

    if (memoryUsage > this.maxMemoryMB) {
      logger.warn(`Cache memory usage (${memoryUsage}MB) exceeds limit (${this.maxMemoryMB}MB)`);
      this.emergencyCleanup();
    }
  }

  /**
   * Emergency cleanup when memory limit exceeded
   */
  emergencyCleanup() {
    // Remove 25% of cache entries (LRU)
    const targetSize = Math.floor(this.data.size * 0.75);

    while (this.data.size > targetSize) {
      this.enforceSizeLimit();
    }

    logger.info(`Emergency cleanup: cache size reduced to ${this.data.size} entries`);
  }

  /**
   * Estimate memory usage of cache
   */
  getMemoryUsage() {
    let totalSize = 0;

    for (const entry of this.data.values()) {
      totalSize += entry.size || 0;
    }

    return Math.round(totalSize / (1024 * 1024)); // Convert to MB
  }

  /**
   * Update memory usage metric
   */
  updateMemoryUsage() {
    this.metrics.memoryUsage = this.getMemoryUsage();
  }

  /**
   * Estimate size of a value in bytes
   */
  estimateSize(value) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      // Fallback estimation
      if (typeof value === 'string') return value.length * 2;
      if (typeof value === 'number') return 8;
      if (typeof value === 'boolean') return 4;
      if (typeof value === 'object') return JSON.stringify(value).length * 2;
      return 100; // Default estimate
    }
  }

  /**
   * Shutdown cache and cleanup resources
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.clear();
    logger.info('Memory cache shutdown complete');
  }
}

/**
 * Cache layer with distributed cache support (Redis) and fallback to memory cache
 */
class CacheLayer {
  constructor(options = {}) {
    this.memoryCache = new MemoryCache(options.memory || {});
    this.redisClient = options.redis || null;
    this.useRedis = !!this.redisClient;

    // Circuit breaker for Redis operations
    this.redisBreaker = new CircuitBreaker(async operation => operation(), {
      failureThreshold: 5,
      timeout: 2000,
      resetTimeout: 30000,
    });

    this.metrics = {
      redisHits: 0,
      redisMisses: 0,
      redisErrors: 0,
      memoryHits: 0,
      memoryMisses: 0,
    };
  }

  /**
   * Get value from cache (tries Redis first, then memory cache)
   */
  async get(key) {
    try {
      // Try Redis first if available
      if (this.useRedis) {
        try {
          const value = await this.redisBreaker.execute(async () => {
            const result = await this.redisClient.get(key);
            return result ? JSON.parse(result) : null;
          });

          if (value !== null) {
            this.metrics.redisHits++;
            // Store in memory cache for faster access
            this.memoryCache.set(key, value, 60000); // 1 minute
            return value;
          }

          this.metrics.redisMisses++;
        } catch (error) {
          this.metrics.redisErrors++;
          logger.warn('Redis get failed, falling back to memory cache:', error.message);
        }
      }

      // Fallback to memory cache
      const memoryValue = this.memoryCache.get(key);
      if (memoryValue !== undefined) {
        this.metrics.memoryHits++;
        return memoryValue;
      }

      this.metrics.memoryMisses++;
      return undefined;
    } catch (error) {
      logger.error('Cache get error:', error);
      return undefined;
    }
  }

  /**
   * Set value in cache (stores in both Redis and memory)
   */
  async set(key, value, ttl = 300000) {
    try {
      // Store in memory cache first (always succeeds)
      this.memoryCache.set(key, value, ttl);

      // Try to store in Redis if available
      if (this.useRedis) {
        try {
          await this.redisBreaker.execute(async () => {
            const ttlSeconds = Math.floor(ttl / 1000);
            await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value));
          });
        } catch (error) {
          this.metrics.redisErrors++;
          logger.warn('Redis set failed, data only in memory cache:', error.message);
        }
      }

      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key) {
    let deleted = false;

    try {
      // Delete from memory cache
      if (this.memoryCache.delete(key)) {
        deleted = true;
      }

      // Delete from Redis if available
      if (this.useRedis) {
        try {
          await this.redisBreaker.execute(async () => {
            await this.redisClient.del(key);
          });
        } catch (error) {
          this.metrics.redisErrors++;
          logger.warn('Redis delete failed:', error.message);
        }
      }

      return deleted;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear Redis if available
      if (this.useRedis) {
        try {
          await this.redisBreaker.execute(async () => {
            await this.redisClient.flushdb();
          });
        } catch (error) {
          this.metrics.redisErrors++;
          logger.warn('Redis clear failed:', error.message);
        }
      }
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memory: this.memoryCache.getStats(),
      redis: {
        hits: this.metrics.redisHits,
        misses: this.metrics.redisMisses,
        errors: this.metrics.redisErrors,
        circuitBreakerStatus: this.redisBreaker.getStatus(),
      },
      fallback: {
        hits: this.metrics.memoryHits,
        misses: this.metrics.memoryMisses,
      },
    };
  }

  /**
   * Shutdown cache and cleanup resources
   */
  async shutdown() {
    try {
      this.memoryCache.shutdown();

      if (this.redisClient) {
        await this.redisClient.quit();
      }

      logger.info('Cache layer shutdown complete');
    } catch (error) {
      logger.error('Cache shutdown error:', error);
    }
  }
}

// Create global cache instance
const cache = new CacheLayer({
  memory: {
    maxSize: 1000,
    defaultTtl: 300000, // 5 minutes
    maxMemoryMB: 50,
  },
});

// Cache key generators for consistent naming
export const CacheKeys = {
  groupSettings: chatId => `group:settings:${chatId}`,
  userStrikes: (chatId, userId) => `strikes:${chatId}:${userId}`,
  whitelistKeywords: chatId => `whitelist:${chatId}`,
  auditLog: (chatId, limit) => `audit:${chatId}:${limit}`,
  analytics: (chatId, period) => `analytics:${chatId}:${period}`,
  groupInfo: chatId => `group:info:${chatId}`,
};

export { MemoryCache, CacheLayer, cache };
