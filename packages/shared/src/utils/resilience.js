/**
 * @fileoverview Enhanced error recovery and resilience utilities
 * Provides retry mechanisms, graceful degradation, and fallback strategies
 */

import logger from '../services/logger.js';

/**
 * Retry mechanism with exponential backoff
 */
export class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.exponentialBase = options.exponentialBase || 2;
    this.jitter = options.jitter !== false; // Enable jitter by default
  }

  /**
   * Execute function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise} - Result of function execution
   */
  async execute(fn, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const context = options.context || 'unknown';

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();

        if (attempt > 0) {
          logger.info(`Retry succeeded after ${attempt} attempts`, { context });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Don't retry on certain types of errors
        if (this.shouldNotRetry(error)) {
          logger.debug(`Not retrying due to error type: ${error.constructor.name}`, { context });
          throw error;
        }

        if (attempt === maxRetries) {
          logger.error(`All retry attempts exhausted`, {
            context,
            attempts: attempt + 1,
            finalError: error.message,
          });
          break;
        }

        const delay = this.calculateDelay(attempt);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          context,
          error: error.message,
          nextAttempt: attempt + 2,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate delay for next retry with exponential backoff and jitter
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} - Delay in milliseconds
   */
  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.exponentialBase, attempt);
    delay = Math.min(delay, this.maxDelay);

    if (this.jitter) {
      // Add up to 20% jitter to prevent thundering herd
      const jitterAmount = delay * 0.2;
      delay += Math.random() * jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Check if error should not be retried
   * @param {Error} error - Error to check
   * @returns {boolean} - True if should not retry
   */
  shouldNotRetry(error) {
    // Don't retry validation errors, authentication errors, etc.
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      'BadRequestError',
    ];

    if (nonRetryableErrors.includes(error.constructor.name)) {
      return true;
    }

    // Check for specific error codes
    if (error.code) {
      const nonRetryableCodes = [
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'BAD_REQUEST',
      ];

      if (nonRetryableCodes.includes(error.code)) {
        return true;
      }
    }

    // Check HTTP status codes
    if (error.statusCode) {
      // Don't retry 4xx errors (except 429 - rate limit)
      if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradation {
  constructor() {
    this.fallbacks = new Map();
    this.degradedServices = new Set();
  }

  /**
   * Register a fallback for a service
   * @param {string} serviceName - Name of the service
   * @param {Function} fallbackFn - Fallback function
   * @param {Object} options - Fallback options
   */
  registerFallback(serviceName, fallbackFn, options = {}) {
    this.fallbacks.set(serviceName, {
      fn: fallbackFn,
      enabled: options.enabled !== false,
      priority: options.priority || 0,
      description: options.description || 'Default fallback',
    });

    logger.info(`Registered fallback for service '${serviceName}'`, {
      description: options.description,
    });
  }

  /**
   * Execute with fallback support
   * @param {string} serviceName - Name of the service
   * @param {Function} primaryFn - Primary function to execute
   * @param {*} fallbackData - Data to pass to fallback
   * @returns {Promise} - Result of execution
   */
  async executeWithFallback(serviceName, primaryFn, fallbackData = null) {
    try {
      const result = await primaryFn();

      // If service was previously degraded, mark as recovered
      if (this.degradedServices.has(serviceName)) {
        this.degradedServices.delete(serviceName);
        logger.info(`Service '${serviceName}' recovered from degraded state`);
      }

      return result;
    } catch (error) {
      logger.warn(`Primary service '${serviceName}' failed, attempting fallback`, {
        error: error.message,
      });

      const fallback = this.fallbacks.get(serviceName);

      if (!fallback || !fallback.enabled) {
        logger.error(`No fallback available for service '${serviceName}'`);
        throw error;
      }

      try {
        this.degradedServices.add(serviceName);
        const fallbackResult = await fallback.fn(fallbackData, error);

        logger.info(`Fallback executed successfully for service '${serviceName}'`, {
          fallbackDescription: fallback.description,
        });

        return fallbackResult;
      } catch (fallbackError) {
        logger.error(`Fallback failed for service '${serviceName}'`, {
          primaryError: error.message,
          fallbackError: fallbackError.message,
        });

        // Throw original error, not fallback error
        throw error;
      }
    }
  }

  /**
   * Check if service is currently degraded
   * @param {string} serviceName - Name of the service
   * @returns {boolean} - True if service is degraded
   */
  isServiceDegraded(serviceName) {
    return this.degradedServices.has(serviceName);
  }

  /**
   * Get status of all services
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      registeredFallbacks: Array.from(this.fallbacks.keys()),
      degradedServices: Array.from(this.degradedServices),
      fallbackDetails: Object.fromEntries(
        Array.from(this.fallbacks.entries()).map(([name, fallback]) => [
          name,
          {
            enabled: fallback.enabled,
            priority: fallback.priority,
            description: fallback.description,
            isDegraded: this.degradedServices.has(name),
          },
        ])
      ),
    };
  }

  /**
   * Manually mark service as degraded or recovered
   * @param {string} serviceName - Name of the service
   * @param {boolean} degraded - True to mark as degraded, false to mark as recovered
   */
  setServiceState(serviceName, degraded) {
    if (degraded) {
      this.degradedServices.add(serviceName);
      logger.warn(`Service '${serviceName}' manually marked as degraded`);
    } else {
      this.degradedServices.delete(serviceName);
      logger.info(`Service '${serviceName}' manually marked as recovered`);
    }
  }
}

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise} - Promise that rejects if timeout is reached
 */
export function withTimeout(promise, timeoutMs, operationName = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout: ${operationName} took longer than ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Bulkhead pattern implementation for resource isolation
 */
export class Bulkhead {
  constructor(options = {}) {
    this.name = options.name || 'Bulkhead';
    this.maxConcurrent = options.maxConcurrent || 10;
    this.queueSize = options.queueSize || 100;
    this.timeout = options.timeout || 30000; // 30 seconds

    this.running = 0;
    this.queue = [];
  }

  /**
   * Execute function within bulkhead constraints
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} - Result of function execution
   */
  async execute(fn, options = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        fn,
        resolve,
        reject,
        timeout: options.timeout || this.timeout,
        enqueuedAt: Date.now(),
      };

      if (this.running < this.maxConcurrent) {
        this.runTask(task);
      } else if (this.queue.length < this.queueSize) {
        this.queue.push(task);
      } else {
        reject(new Error(`Bulkhead '${this.name}' queue is full`));
      }
    });
  }

  /**
   * Run a task within bulkhead constraints
   * @param {Object} task - Task to run
   */
  async runTask(task) {
    this.running++;

    const timeoutId = setTimeout(() => {
      task.reject(new Error(`Bulkhead '${this.name}' task timeout after ${task.timeout}ms`));
    }, task.timeout);

    try {
      const result = await task.fn();
      clearTimeout(timeoutId);
      task.resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      task.reject(error);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  /**
   * Process queued tasks
   */
  processQueue() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const task = this.queue.shift();
      this.runTask(task);
    }
  }

  /**
   * Get bulkhead status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      name: this.name,
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      queueSize: this.queueSize,
      utilization: ((this.running / this.maxConcurrent) * 100).toFixed(2) + '%',
    };
  }
}

// Global instances
export const globalRetryManager = new RetryManager({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
});

export const globalDegradation = new GracefulDegradation();

export const messageBulkhead = new Bulkhead({
  name: 'MessageProcessing',
  maxConcurrent: 5,
  queueSize: 50,
  timeout: 30000,
});

export const databaseBulkhead = new Bulkhead({
  name: 'Database',
  maxConcurrent: 10,
  queueSize: 100,
  timeout: 10000,
});
