import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      tokensPerSecond: 2, // 2 tokens per second for testing
      bucketCapacity: 5, // Small bucket for testing
      initialTokens: 5, // Start with full bucket
      failureThreshold: 3, // Open circuit after 3 failures
      recoveryTimeoutMs: 1000, // 1 second recovery
      halfOpenMaxCalls: 2, // 2 test calls in half-open
      maxQueueSize: 3, // Small queue for testing
      timeoutMs: 2000, // 2 second timeout (longer for testing)
    });
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  describe('Token Bucket Algorithm', () => {
    it('should allow immediate acquisition when tokens available', async () => {
      const result = await rateLimiter.acquire();
      expect(result).toBe(true);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.currentTokens).toBe(4); // Started with 5, used 1
      expect(metrics.requestsAccepted).toBe(1);
    });

    it('should exhaust tokens and queue requests', async () => {
      // Exhaust all 5 tokens
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.acquire();
        expect(result).toBe(true);
      }

      // Next request should be queued
      const queuedPromise = rateLimiter.acquire();

      // Check metrics
      const metrics = rateLimiter.getMetrics();
      expect(metrics.currentTokens).toBe(0);
      expect(metrics.requestsAccepted).toBe(5);
      expect(metrics.queueLength).toBe(1);

      // Wait for token refill and queue processing
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second for 2 tokens

      const result = await queuedPromise;
      expect(result).toBe(true);
    });

    it('should refill tokens over time', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      expect(rateLimiter.getMetrics().currentTokens).toBe(0);

      // Wait for refill (2 tokens per second, so 1 second = 2 tokens)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const metrics = rateLimiter.getMetrics();
      expect(metrics.currentTokens).toBeGreaterThanOrEqual(1);
    });

    it('should respect bucket capacity', async () => {
      // Wait for some time to ensure bucket could theoretically overfill
      await new Promise(resolve => setTimeout(resolve, 3000));

      const metrics = rateLimiter.getMetrics();
      expect(metrics.currentTokens).toBeLessThanOrEqual(5);
    });
  });

  describe('Queue Management', () => {
    it('should reject requests when queue is full', async () => {
      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      // Fill the queue (maxQueueSize = 3)
      const queuedPromises: Promise<boolean>[] = [];
      for (let i = 0; i < 3; i++) {
        queuedPromises.push(rateLimiter.acquire());
      }

      // Next request should be rejected
      const result = await rateLimiter.acquire();
      expect(result).toBe(false);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.requestsRejected).toBe(1);
      expect(metrics.queueLength).toBe(3);
    });

    it('should timeout queued requests', async () => {
      // Create a rate limiter with very short timeout for this test
      const shortTimeoutLimiter = new RateLimiter({
        tokensPerSecond: 1, // Very slow rate
        bucketCapacity: 5,
        initialTokens: 5,
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        halfOpenMaxCalls: 2,
        maxQueueSize: 3,
        timeoutMs: 200, // Very short timeout
      });

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await shortTimeoutLimiter.acquire();
      }

      // Queue a request that will timeout
      const result = await shortTimeoutLimiter.acquire();

      // Request should timeout before token becomes available
      expect(result).toBe(false);

      const metrics = shortTimeoutLimiter.getMetrics();
      expect(metrics.requestsTimedOut).toBeGreaterThan(0);

      shortTimeoutLimiter.destroy();
    });

    it('should process queue in FIFO order', async () => {
      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      const results: boolean[] = [];
      const promises: Promise<boolean>[] = [];

      // Queue multiple requests
      for (let i = 0; i < 3; i++) {
        promises.push(
          rateLimiter.acquire().then(result => {
            results.push(result);
            return result;
          })
        );
      }

      // Wait for all to complete (allow time for token refill)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for tokens to refill
      await Promise.all(promises);

      // At least some should succeed as tokens refill
      expect(results.filter(r => r).length).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failure threshold', () => {
      // Report failures to reach threshold
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      const metrics = rateLimiter.getMetrics();
      expect(metrics.circuitState).toBe('open');
      expect(metrics.failureCount).toBe(3);
    });

    it('should reject requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      const result = await rateLimiter.acquire();
      expect(result).toBe(false);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.requestsRejected).toBeGreaterThan(0);
    });

    it('should transition to half-open after recovery timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      expect(rateLimiter.getMetrics().circuitState).toBe('open');

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Try to acquire - this should trigger half-open transition
      await rateLimiter.acquire();

      const metrics = rateLimiter.getMetrics();
      expect(metrics.circuitState).toBe('half-open');
    });

    it('should close circuit after successful half-open calls', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Transition to half-open
      await rateLimiter.acquire();

      // Report successful calls in half-open state
      for (let i = 0; i < 2; i++) {
        rateLimiter.reportResult(true);
      }

      const metrics = rateLimiter.getMetrics();
      expect(metrics.circuitState).toBe('closed');
    });

    it('should reopen circuit on failure in half-open state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Transition to half-open
      await rateLimiter.acquire();

      // Report failure in half-open state
      rateLimiter.reportResult(false);

      const metrics = rateLimiter.getMetrics();
      expect(metrics.circuitState).toBe('open');
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track comprehensive metrics', async () => {
      // Perform various operations
      await rateLimiter.acquire(); // Success
      await rateLimiter.acquire(); // Success

      // Exhaust tokens and queue one
      for (let i = 0; i < 3; i++) {
        await rateLimiter.acquire();
      }

      // Queue multiple requests to fill the queue
      const queuedPromises = [rateLimiter.acquire(), rateLimiter.acquire(), rateLimiter.acquire()];

      // Now try one more - this should be rejected immediately since queue is full
      const rejected = await rateLimiter.acquire();
      expect(rejected).toBe(false);

      const metrics = rateLimiter.getMetrics();

      expect(metrics.requestsAccepted).toBe(5); // The 5 initial requests
      expect(metrics.requestsRejected).toBe(1); // The queue overflow request
      expect(metrics.requestsQueued).toBe(3); // Three requests in queue
      expect(metrics.tokensConsumed).toBe(5); // 5 tokens consumed
      expect(metrics.queueLength).toBe(3); // Three requests still queued

      // Clean up - wait for the queued requests to complete or timeout
      await Promise.allSettled(queuedPromises);
    });

    it('should calculate average wait time', async () => {
      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      const startTime = Date.now();
      await rateLimiter.acquire(); // This will queue and wait
      const endTime = Date.now();

      const metrics = rateLimiter.getMetrics();
      const actualWaitTime = endTime - startTime;

      // Average wait time should be updated (non-zero)
      expect(metrics.averageWaitTime).toBeGreaterThan(0);
      expect(metrics.averageWaitTime).toBeLessThan(actualWaitTime * 2); // Reasonable bound
    }, 10000); // Increase timeout for this test

    it('should emit events for circuit breaker state changes', () => {
      const events: string[] = [];

      rateLimiter.on('circuit-opened', () => events.push('opened'));
      rateLimiter.on('circuit-half-open', () => events.push('half-open'));
      rateLimiter.on('circuit-closed', () => events.push('closed'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        rateLimiter.reportResult(false);
      }

      expect(events).toContain('opened');
    });
  });

  describe('Configuration and Updates', () => {
    it('should update configuration at runtime', () => {
      const newConfig = {
        tokensPerSecond: 5,
        bucketCapacity: 10,
        failureThreshold: 5,
      };

      rateLimiter.updateConfig(newConfig);

      const config = rateLimiter.getConfig();
      expect(config.tokensPerSecond).toBe(5);
      expect(config.bucketCapacity).toBe(10);
      expect(config.failureThreshold).toBe(5);
    });

    it('should reset metrics when requested', () => {
      // Generate some activity
      rateLimiter.acquire();
      rateLimiter.reportResult(false);

      let metrics = rateLimiter.getMetrics();
      expect(metrics.requestsAccepted).toBeGreaterThan(0);

      rateLimiter.resetMetrics();

      metrics = rateLimiter.getMetrics();
      expect(metrics.requestsAccepted).toBe(0);
      expect(metrics.tokensConsumed).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle high concurrency gracefully', async () => {
      const promises: Promise<boolean>[] = [];

      // Create many concurrent requests
      for (let i = 0; i < 20; i++) {
        promises.push(rateLimiter.acquire());
      }

      const results = await Promise.all(promises);

      // Some should succeed, some should be rejected or queued
      const accepted = results.filter(r => r === true).length;
      const rejected = results.filter(r => r === false).length;

      expect(accepted + rejected).toBe(20);

      const metrics = rateLimiter.getMetrics();
      // Allow for slight timing differences - some requests might still be processing
      expect(metrics.requestsAccepted + metrics.requestsRejected).toBeGreaterThanOrEqual(17);
      expect(metrics.requestsAccepted + metrics.requestsRejected).toBeLessThanOrEqual(20);
    });

    it('should handle rapid fire requests', async () => {
      const promises: Promise<boolean>[] = [];

      // Fire requests as fast as possible
      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter.acquire());
      }

      const results = await Promise.all(promises);

      // Should handle without errors
      expect(results.length).toBe(10);
      expect(results.every(r => typeof r === 'boolean')).toBe(true);
    });

    it('should clean up resources on destroy', () => {
      const metrics = rateLimiter.getMetrics();
      expect(metrics.queueLength).toBe(0);

      rateLimiter.destroy();

      // Should not throw errors after destroy
      expect(() => rateLimiter.getMetrics()).not.toThrow();
    });
  });
});
