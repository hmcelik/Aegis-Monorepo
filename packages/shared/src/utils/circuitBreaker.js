/**
 * @fileoverview Circuit Breaker pattern implementation for preventing cascade failures
 * Provides automatic failure detection and recovery mechanisms
 */

import logger from '../services/logger.js';

export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'CircuitBreaker';
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitoringWindow = options.monitoringWindow || 120000; // 2 minutes
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;

    // Sliding window for failure tracking
    this.recentCalls = [];

    logger.info(`Circuit breaker '${this.name}' initialized`, {
      failureThreshold: this.failureThreshold,
      recoveryTimeout: this.recoveryTimeout,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to the function
   * @returns {Promise} - Result of function execution
   */
  async execute(fn, ...args) {
    if (!this.canExecute()) {
      const error = new Error(`Circuit breaker '${this.name}' is OPEN - preventing execution`);
      error.circuitBreakerOpen = true;
      throw error;
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if execution is allowed based on current state
   * @returns {boolean}
   */
  canExecute() {
    const now = Date.now();

    // Clean up old entries from sliding window
    this.recentCalls = this.recentCalls.filter(
      call => now - call.timestamp < this.monitoringWindow
    );

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (this.nextAttemptTime && now >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
          this.halfOpenAttempts = 0;
          logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN`);
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return this.halfOpenAttempts < this.halfOpenMaxCalls;

      default:
        return false;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    const now = Date.now();
    this.recentCalls.push({ timestamp: now, success: true });
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenMaxCalls) {
        this.reset();
        logger.info(`Circuit breaker '${this.name}' recovered - transitioning to CLOSED`);
      }
    }
  }

  /**
   * Handle failed execution
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    const now = Date.now();
    this.recentCalls.push({ timestamp: now, success: false, error: error.message });
    this.failures++;
    this.lastFailureTime = now;

    // Calculate failure rate in recent window
    const recentFailures = this.recentCalls.filter(call => !call.success).length;
    const failureRate = this.recentCalls.length > 0 ? recentFailures / this.recentCalls.length : 0;

    logger.warn(`Circuit breaker '${this.name}' recorded failure`, {
      totalFailures: this.failures,
      recentFailures,
      failureRate: (failureRate * 100).toFixed(2) + '%',
      error: error.message,
    });

    if (this.state === 'HALF_OPEN' || recentFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Trip the circuit breaker to OPEN state
   */
  trip() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;

    logger.error(`Circuit breaker '${this.name}' TRIPPED - entering OPEN state`, {
      failures: this.failures,
      recoveryTime: new Date(this.nextAttemptTime).toISOString(),
    });
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
    this.recentCalls = [];

    logger.info(`Circuit breaker '${this.name}' reset to CLOSED state`);
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Status information
   */
  getStatus() {
    const now = Date.now();
    const recentFailures = this.recentCalls.filter(call => !call.success).length;
    const failureRate = this.recentCalls.length > 0 ? recentFailures / this.recentCalls.length : 0;

    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      recentCalls: this.recentCalls.length,
      recentFailures,
      failureRate: parseFloat((failureRate * 100).toFixed(2)),
      canExecute: this.canExecute(),
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }

  /**
   * Force circuit breaker to specific state (for testing/admin purposes)
   * @param {string} state - Target state (CLOSED, OPEN, HALF_OPEN)
   */
  forceState(state) {
    const validStates = ['CLOSED', 'OPEN', 'HALF_OPEN'];
    if (!validStates.includes(state)) {
      throw new Error(`Invalid state: ${state}. Valid states: ${validStates.join(', ')}`);
    }

    this.state = state;
    if (state === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    }

    logger.warn(`Circuit breaker '${this.name}' manually forced to ${state} state`);
  }
}

// Global circuit breaker instances for common operations
export const messageProcessingBreaker = new CircuitBreaker({
  name: 'MessageProcessing',
  failureThreshold: 10,
  recoveryTimeout: 30000, // 30 seconds
  monitoringWindow: 60000, // 1 minute
});

export const databaseBreaker = new CircuitBreaker({
  name: 'Database',
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  monitoringWindow: 120000, // 2 minutes
});

export const telegramApiBreaker = new CircuitBreaker({
  name: 'TelegramAPI',
  failureThreshold: 8,
  recoveryTimeout: 45000, // 45 seconds
  monitoringWindow: 90000, // 1.5 minutes
});

export const nlpServiceBreaker = new CircuitBreaker({
  name: 'NLPService',
  failureThreshold: 3,
  recoveryTimeout: 120000, // 2 minutes
  monitoringWindow: 180000, // 3 minutes
});

/**
 * Reset all circuit breakers - useful for testing
 */
export const resetAllCircuitBreakers = () => {
  messageProcessingBreaker.reset();
  databaseBreaker.reset();
  telegramApiBreaker.reset();
  nlpServiceBreaker.reset();
};

/**
 * Get status of all circuit breakers
 */
export const getAllCircuitBreakerStatus = () => {
  return {
    messageProcessing: messageProcessingBreaker.getStatus(),
    database: databaseBreaker.getStatus(),
    telegramApi: telegramApiBreaker.getStatus(),
    nlpService: nlpServiceBreaker.getStatus(),
  };
};
