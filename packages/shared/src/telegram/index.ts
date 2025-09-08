/**
 * AEG-103: Telegram API client with rate-limit handling and jittered backoff
 * Provides reliable Telegram API interaction with automatic retry logic
 */

import logger from '../services/logger';

export interface TelegramConfig {
  botToken: string;
  apiUrl?: string;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
}

export interface TelegramResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
    migrate_to_chat_id?: number;
  };
}

export interface ApiCallOptions {
  retries?: number;
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

export class TelegramClient {
  private config: Required<TelegramConfig>;
  private circuitBreaker: CircuitBreakerState;
  private callCount = 0;
  private errorCount = 0;
  private lastResetTime = Date.now();

  constructor(config: TelegramConfig) {
    this.config = {
      botToken: config.botToken,
      apiUrl: config.apiUrl || 'https://api.telegram.org',
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerResetTime: config.circuitBreakerResetTime || 60000,
    };

    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      nextRetryTime: 0,
    };
  }

  /**
   * Make a Telegram API call with automatic rate limiting and retries
   */
  async apiCall<T = any>(
    method: string,
    params: Record<string, any> = {},
    options: ApiCallOptions = {}
  ): Promise<TelegramResponse<T>> {
    const startTime = Date.now();
    const { retries = this.config.maxRetries, timeout = 30000 } = options;

    // Check circuit breaker
    if (!this.isCircuitBreakerClosed()) {
      logger.warn('Circuit breaker is open, rejecting API call', {
        method,
        circuitBreakerState: this.circuitBreaker.state,
        nextRetryTime: new Date(this.circuitBreaker.nextRetryTime).toISOString(),
      });
      throw new Error('Circuit breaker is open');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Add jitter to prevent thundering herd
        if (attempt > 0) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.debug('Retrying API call after delay', {
            method,
            attempt,
            delay,
          });
          await this.sleep(delay);
        }

        const response = await this.makeHttpRequest<T>(method, params, timeout);

        // Handle successful response
        this.recordSuccess();
        const duration = Date.now() - startTime;

        logger.debug('Telegram API call successful', {
          method,
          attempt,
          duration,
          ok: response.ok,
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a rate limit error
        if (this.isRateLimitError(lastError)) {
          const retryAfter = this.extractRetryAfter(lastError);
          if (retryAfter && attempt < retries) {
            logger.warn('Rate limited by Telegram API', {
              method,
              attempt,
              retryAfter,
              willRetry: true,
            });
            await this.sleep(retryAfter * 1000);
            continue;
          }
        }

        // Record failure for circuit breaker
        this.recordFailure();

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          logger.error('Non-retryable error from Telegram API', {
            method,
            error: lastError.message,
            attempt,
          });
          break;
        }

        logger.warn('Telegram API call failed', {
          method,
          attempt,
          error: lastError.message,
          willRetry: attempt < retries,
        });
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    logger.error('Telegram API call failed after all retries', {
      method,
      retries,
      duration,
      lastError: lastError?.message,
    });

    throw lastError || new Error('Unknown error occurred');
  }

  /**
   * Make the actual HTTP request to Telegram API
   */
  private async makeHttpRequest<T>(
    method: string,
    params: Record<string, any>,
    timeout: number
  ): Promise<TelegramResponse<T>> {
    const url = `${this.config.apiUrl}/bot${this.config.botToken}/${method}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as TelegramResponse<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.config.baseDelay * Math.pow(2, attempt - 1),
      this.config.maxDelay
    );

    // Add jitter (±25% of the delay)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    return Math.max(delay, 100); // Minimum 100ms delay
  }

  /**
   * Check if error is rate limiting related
   */
  private isRateLimitError(error: Error): boolean {
    return (
      error.message.includes('429') ||
      error.message.includes('Too Many Requests') ||
      error.message.includes('retry_after')
    );
  }

  /**
   * Extract retry_after value from rate limit error
   */
  private extractRetryAfter(error: Error): number | null {
    const match = error.message.match(/retry_after['":\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') || // Unauthorized
      message.includes('403') || // Forbidden
      message.includes('400') || // Bad Request
      message.includes('chat not found') ||
      message.includes('user not found') ||
      message.includes('message not found')
    );
  }

  /**
   * Check if circuit breaker allows requests
   */
  private isCircuitBreakerClosed(): boolean {
    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'closed':
        return true;

      case 'open':
        if (now >= this.circuitBreaker.nextRetryTime) {
          this.circuitBreaker.state = 'half-open';
          logger.info('Circuit breaker transitioning to half-open state');
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record successful API call
   */
  private recordSuccess(): void {
    this.callCount++;

    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
      logger.info('Circuit breaker reset to closed state after successful call');
    }
  }

  /**
   * Record failed API call
   */
  private recordFailure(): void {
    this.callCount++;
    this.errorCount++;
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.nextRetryTime = Date.now() + this.config.circuitBreakerResetTime;

      logger.warn('Circuit breaker opened due to high failure rate', {
        failures: this.circuitBreaker.failures,
        threshold: this.config.circuitBreakerThreshold,
        nextRetryTime: new Date(this.circuitBreaker.nextRetryTime).toISOString(),
      });
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    const now = Date.now();
    const uptimeMs = now - this.lastResetTime;

    return {
      totalCalls: this.callCount,
      errorCount: this.errorCount,
      successRate: this.callCount > 0 ? (this.callCount - this.errorCount) / this.callCount : 1,
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures,
        nextRetryTime:
          this.circuitBreaker.nextRetryTime > now
            ? new Date(this.circuitBreaker.nextRetryTime).toISOString()
            : null,
      },
      uptimeMs,
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.callCount = 0;
    this.errorCount = 0;
    this.lastResetTime = Date.now();
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      nextRetryTime: 0,
    };
  }

  // Convenience methods for common Telegram API calls

  async sendMessage(
    chatId: number | string,
    text: string,
    options: any = {}
  ): Promise<TelegramResponse> {
    return this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<TelegramResponse> {
    return this.apiCall('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async banChatMember(
    chatId: number | string,
    userId: number,
    options: any = {}
  ): Promise<TelegramResponse> {
    return this.apiCall('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...options,
    });
  }

  async restrictChatMember(
    chatId: number | string,
    userId: number,
    permissions: any,
    options: any = {}
  ): Promise<TelegramResponse> {
    return this.apiCall('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      ...options,
    });
  }

  async unbanChatMember(chatId: number | string, userId: number): Promise<TelegramResponse> {
    return this.apiCall('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
  }
}

export default TelegramClient;
