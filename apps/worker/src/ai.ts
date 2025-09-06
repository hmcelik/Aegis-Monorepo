/**
 * AEG-302: AI verdict processing with content-based caching
 * AEG-303: Rate limiting & throttling for AI services
 * 
 * This module integrates:
 * 1. Verdict cache to check before making AI calls
 * 2. Rate limiting and circuit breaker for AI service protection
 * 3. Graceful degradation when AI services are unavailable
 * 4. Comprehensive metrics and monitoring
 */

import { defaultVerdictCache, VerdictCache } from '@telegram-moderator/shared/src/cache';
import { aiRateLimiter, RateLimiter } from '@telegram-moderator/shared/src/rate-limiter';
import { PolicyEngine } from '@telegram-moderator/policy';
import { PolicyVerdict } from '@telegram-moderator/types';
import logger from '@telegram-moderator/shared/src/services/logger';

export interface AIProcessingResult {
  verdict: PolicyVerdict;
  source: 'cache' | 'ai' | 'policy' | 'rate-limited';
  cacheKey?: string;
  processingTimeMs: number;
  aiCallsAvoided?: number;
  rateLimited?: boolean;
  circuitOpen?: boolean;
}

export interface AIProcessingConfig {
  enableCache: boolean;
  cacheTtlMs: number;
  fallbackToPolicy: boolean;
  maxAIProcessingTimeMs: number;
  enableRateLimiting: boolean;
  degradeOnRateLimit: boolean;
}

export class AIProcessor {
  private cache: VerdictCache;
  private rateLimiter: RateLimiter;
  private policyEngine: PolicyEngine;
  private config: AIProcessingConfig;
  private aiCallCount: number = 0;
  private cacheHitCount: number = 0;
  private rateLimitedCount: number = 0;
  private circuitOpenCount: number = 0;

  constructor(
    cache: VerdictCache = defaultVerdictCache,
    rateLimiter: RateLimiter = aiRateLimiter,
    policyEngine?: PolicyEngine,
    config: Partial<AIProcessingConfig> = {}
  ) {
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.policyEngine = policyEngine || new PolicyEngine();
    this.config = {
      enableCache: config.enableCache ?? true,
      cacheTtlMs: config.cacheTtlMs ?? 3600000, // 1 hour
      fallbackToPolicy: config.fallbackToPolicy ?? true,
      maxAIProcessingTimeMs: config.maxAIProcessingTimeMs ?? 5000,
      enableRateLimiting: config.enableRateLimiting ?? true,
      degradeOnRateLimit: config.degradeOnRateLimit ?? true,
    };

    this.setupDefaultPolicyRules();
  }

  /**
   * Sets up default policy rules for fallback processing
   */
  private setupDefaultPolicyRules(): void {
    // Add some basic rules for fallback
    this.policyEngine.addRule({
      id: 'profanity',
      name: 'Profanity Detection',
      description: 'Detects obvious profane language',
      weight: 60,
      matcher: (content) => {
        const profanityWords = ['spam', 'scam', 'fuck', 'shit', 'damn'];
        return profanityWords.some(word => 
          content.normalizedText.toLowerCase().includes(word)
        );
      }
    });

    this.policyEngine.addRule({
      id: 'excessive_caps',
      name: 'Excessive Capitals',
      description: 'Detects messages with excessive capital letters',
      weight: 30,
      matcher: (content) => {
        const capsCount = (content.originalText.match(/[A-Z]/g) || []).length;
        const totalChars = content.originalText.length;
        return totalChars > 10 && (capsCount / totalChars) > 0.6;
      }
    });

    this.policyEngine.addRule({
      id: 'suspicious_urls',
      name: 'Suspicious URLs',
      description: 'Detects potentially malicious URLs',
      weight: 70,
      matcher: (content) => {
        return content.urls.some(url => 
          url.includes('bit.ly') || 
          url.includes('tinyurl') ||
          url.includes('t.co') ||
          url.match(/\d+\.\d+\.\d+\.\d+/) // IP addresses
        );
      }
    });
  }

  /**
   * Processes content through cache, rate limiting, AI, or policy engine
   */
  async processContent(text: string, tenantId?: string): Promise<AIProcessingResult> {
    const startTime = Date.now();

    // Step 1: Check cache first if enabled
    if (this.config.enableCache) {
      const cachedVerdict = this.cache.get(text);
      if (cachedVerdict) {
        this.cacheHitCount++;
        
        logger.info('Cache hit - AI call avoided', {
          tenantId,
          cacheHitRate: this.getCacheHitRate(),
          processingTime: Date.now() - startTime,
        });

        return {
          verdict: cachedVerdict,
          source: 'cache',
          processingTimeMs: Date.now() - startTime,
          aiCallsAvoided: 1,
        };
      }
    }

    // Step 2: Check rate limiting if enabled
    let rateLimited = false;
    let circuitOpen = false;
    
    if (this.config.enableRateLimiting) {
      const rateLimitMetrics = this.rateLimiter.getMetrics();
      circuitOpen = rateLimitMetrics.circuitState === 'open';
      
      if (circuitOpen) {
        this.circuitOpenCount++;
        logger.warn('Circuit breaker open - AI service unavailable', {
          tenantId,
          failureCount: rateLimitMetrics.failureCount,
          lastFailureTime: rateLimitMetrics.lastFailureTime
        });
        
        if (this.config.degradeOnRateLimit && this.config.fallbackToPolicy) {
          const verdict = this.policyEngine.evaluate(text);
          return {
            verdict,
            source: 'policy',
            processingTimeMs: Date.now() - startTime,
            circuitOpen: true,
          };
        }
      } else {
        // Try to acquire rate limit permission
        const permitted = await this.rateLimiter.acquire();
        
        if (!permitted) {
          this.rateLimitedCount++;
          rateLimited = true;
          
          logger.warn('Request rate limited', {
            tenantId,
            queueLength: rateLimitMetrics.queueLength,
            currentTokens: rateLimitMetrics.currentTokens
          });
          
          if (this.config.degradeOnRateLimit && this.config.fallbackToPolicy) {
            const verdict = this.policyEngine.evaluate(text);
            return {
              verdict,
              source: 'rate-limited',
              processingTimeMs: Date.now() - startTime,
              rateLimited: true,
            };
          }
        }
      }
    }

    // Step 3: Try AI processing if not rate limited
    let verdict: PolicyVerdict;
    let source: 'ai' | 'policy' = 'ai';
    let aiSuccess = false;

    if (!rateLimited && !circuitOpen) {
      try {
        verdict = await this.callAI(text, tenantId);
        this.aiCallCount++;
        source = 'ai';
        aiSuccess = true;
        
        // Report success to rate limiter for circuit breaker
        if (this.config.enableRateLimiting) {
          this.rateLimiter.reportResult(true);
        }
      } catch (error) {
        // Report failure to rate limiter for circuit breaker
        if (this.config.enableRateLimiting) {
          this.rateLimiter.reportResult(false);
        }
        
        logger.warn('AI call failed, falling back to policy engine', {
          error: error instanceof Error ? error.message : 'Unknown error',
          tenantId,
        });

        if (this.config.fallbackToPolicy) {
          verdict = this.policyEngine.evaluate(text);
          source = 'policy';
        } else {
          throw error;
        }
      }
    } else {
      // Rate limited or circuit open - use policy engine if fallback enabled
      if (this.config.fallbackToPolicy) {
        verdict = this.policyEngine.evaluate(text);
        source = 'policy';
      } else {
        throw new Error('AI service unavailable and no fallback configured');
      }
    }

    // Step 4: Cache the result if enabled and came from AI
    if (this.config.enableCache && verdict && aiSuccess) {
      this.cache.set(text, verdict, this.config.cacheTtlMs);
    }

    const processingTime = Date.now() - startTime;

    logger.info('Content processed', {
      source,
      verdict: verdict!.verdict,
      confidence: verdict!.confidence,
      processingTime,
      rateLimited,
      circuitOpen,
      tenantId,
    });

    return {
      verdict: verdict!,
      source,
      processingTimeMs: processingTime,
      rateLimited,
      circuitOpen,
    };
  }

  /**
   * Simulated AI call (replace with actual AI service integration)
   */
  private async callAI(text: string, tenantId?: string): Promise<PolicyVerdict> {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional AI failures for testing
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('AI service temporarily unavailable');
    }

    // Simple AI simulation based on content analysis
    const hasUrls = text.includes('http') || text.includes('www.');
    const hasExcessiveCaps = (text.match(/[A-Z]/g) || []).length / text.length > 0.5;
    const hasSpamWords = /\b(buy|sale|discount|offer|deal|money|cash|prize)\b/i.test(text);

    let confidence = 0.5;
    let verdict: 'allow' | 'block' | 'review' = 'allow';

    if (hasUrls && hasSpamWords) {
      confidence = 0.9;
      verdict = 'block';
    } else if (hasExcessiveCaps || hasSpamWords) {
      confidence = 0.7;
      verdict = 'review';
    } else if (hasUrls) {
      confidence = 0.6;
      verdict = 'review';
    }

    return {
      verdict,
      confidence,
      reason: `AI analysis: URLs=${hasUrls}, Caps=${hasExcessiveCaps}, Spam=${hasSpamWords}`,
      scores: {
        'ai.spam_probability': hasSpamWords ? 0.8 : 0.2,
        'ai.url_risk': hasUrls ? 0.7 : 0.1,
        'ai.caps_ratio': hasExcessiveCaps ? 0.9 : 0.1,
      },
      rulesMatched: [] // AI doesn't match explicit rules
    };
  }

  /**
   * Gets the current cache hit rate
   */
  getCacheHitRate(): number {
    const totalRequests = this.aiCallCount + this.cacheHitCount;
    return totalRequests > 0 ? this.cacheHitCount / totalRequests : 0;
  }

  /**
   * Gets rate limiting statistics
   */
  getRateLimitStats(): Record<string, number> {
    const rateLimitMetrics = this.rateLimiter.getMetrics();
    
    return {
      'rate_limit.requests.accepted': rateLimitMetrics.requestsAccepted,
      'rate_limit.requests.rejected': rateLimitMetrics.requestsRejected,
      'rate_limit.requests.queued': rateLimitMetrics.requestsQueued,
      'rate_limit.requests.timed_out': rateLimitMetrics.requestsTimedOut,
      'rate_limit.tokens.current': rateLimitMetrics.currentTokens,
      'rate_limit.tokens.consumed': rateLimitMetrics.tokensConsumed,
      'rate_limit.circuit.failure_count': rateLimitMetrics.failureCount,
      'rate_limit.queue.length': rateLimitMetrics.queueLength,
      'rate_limit.wait_time.average': rateLimitMetrics.averageWaitTime,
      'rate_limit.throughput': rateLimitMetrics.throughput,
    };
  }

  /**
   * Gets processing statistics including rate limiting
   */
  getStats(): Record<string, number> {
    const cacheStats = this.cache.getStats();
    const rateLimitStats = this.getRateLimitStats();
    const hitRate = this.getCacheHitRate();
    
    return {
      ...cacheStats,
      ...rateLimitStats,
      'ai.calls.total': this.aiCallCount,
      'ai.cache_hits.total': this.cacheHitCount,
      'ai.rate_limited.total': this.rateLimitedCount,
      'ai.circuit_open.total': this.circuitOpenCount,
      'ai.hit_rate': hitRate,
      'ai.calls_avoided': this.cacheHitCount,
      'ai.efficiency_gain': hitRate * 100, // Percentage
    };
  }

  /**
   * Resets statistics counters
   */
  resetStats(): void {
    this.aiCallCount = 0;
    this.cacheHitCount = 0;
    this.cache.clear();
  }

  /**
   * Updates processing configuration
   */
  updateConfig(newConfig: Partial<AIProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.cacheTtlMs) {
      this.cache.updateConfig({ ttlMs: newConfig.cacheTtlMs });
    }
    
    logger.info('AI processor configuration updated', this.config);
  }

  /**
   * Performs a batch analysis to test cache effectiveness
   */
  async analyzeEffectiveness(messages: string[]): Promise<{
    totalMessages: number;
    cacheHits: number;
    aiCalls: number;
    averageProcessingTime: number;
    cacheEfficiency: number;
  }> {
    const results: AIProcessingResult[] = [];
    
    for (const message of messages) {
      const result = await this.processContent(message);
      results.push(result);
    }

    const cacheHits = results.filter(r => r.source === 'cache').length;
    const aiCalls = results.filter(r => r.source === 'ai').length;
    const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0) / results.length;
    const efficiency = cacheHits / results.length;

    return {
      totalMessages: messages.length,
      cacheHits,
      aiCalls,
      averageProcessingTime: avgProcessingTime,
      cacheEfficiency: efficiency,
    };
  }
}

// Export a default instance
export const defaultAIProcessor = new AIProcessor();

export default AIProcessor;
