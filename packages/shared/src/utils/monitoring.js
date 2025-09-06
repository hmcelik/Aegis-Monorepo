/**
 * Health monitoring and metrics collection system
 * 
 * Features:
 * - System health checks
 * - Performance metrics collection
 * - Alert system for critical issues
 * - Resource usage monitoring
 * - Circuit breaker status monitoring
 * - Database performance tracking
 */

import logger from '../services/logger.js';
import { checkDatabaseHealth } from '../services/database.js';
import { cache } from './cache.js';
import { messageProcessingBreaker, databaseBreaker, telegramApiBreaker, nlpServiceBreaker } from './circuitBreaker.js';

class HealthMonitor {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 30000; // 30 seconds
        this.alertThresholds = {
            memoryUsage: options.memoryThreshold || 80, // 80% of available memory
            responseTime: options.responseTimeThreshold || 5000, // 5 seconds
            errorRate: options.errorRateThreshold || 10, // 10% error rate
            diskUsage: options.diskThreshold || 90, // 90% disk usage
            ...options.thresholds
        };
        
        this.metrics = {
            system: {
                uptime: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                diskUsage: 0
            },
            database: {
                connectionStatus: 'unknown',
                responseTime: 0,
                activeConnections: 0,
                errorCount: 0
            },
            circuitBreakers: {},
            cache: {},
            telegram: {
                messagesSent: 0,
                messagesReceived: 0,
                apiErrors: 0,
                responseTime: 0
            },
            errors: {
                total: 0,
                rate: 0,
                lastError: null
            }
        };
        
        this.alerts = [];
        this.isRunning = false;
        this.startTime = Date.now();
    }

    /**
     * Start health monitoring
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.monitoringInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.checkInterval);
        
        logger.info('Health monitoring started');
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        logger.info('Health monitoring stopped');
    }

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck() {
        try {
            await Promise.allSettled([
                this.checkSystemHealth(),
                this.checkDatabaseHealth(),
                this.checkCircuitBreakers(),
                this.checkCacheHealth(),
                this.updateMetrics()
            ]);
            
            // Check for alerts
            this.checkAlerts();
            
        } catch (error) {
            logger.error('Health check failed:', error);
        }
    }

    /**
     * Check system resource usage
     */
    async checkSystemHealth() {
        try {
            const memoryUsage = process.memoryUsage();
            const uptime = Date.now() - this.startTime;
            
            this.metrics.system = {
                uptime: uptime,
                memoryUsage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
                memoryHeapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                memoryHeapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                memoryRSS: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                memoryExternal: Math.round(memoryUsage.external / 1024 / 1024) // MB
            };
            
        } catch (error) {
            logger.error('System health check failed:', error);
        }
    }

    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        try {
            const startTime = Date.now();
            const dbHealth = await checkDatabaseHealth();
            const responseTime = Date.now() - startTime;
            
            this.metrics.database = {
                connectionStatus: dbHealth.status,
                responseTime: responseTime,
                lastCheck: new Date().toISOString(),
                error: dbHealth.error || null
            };
            
        } catch (error) {
            this.metrics.database = {
                connectionStatus: 'error',
                responseTime: -1,
                lastCheck: new Date().toISOString(),
                error: error.message
            };
            
            logger.error('Database health check failed:', error);
        }
    }

    /**
     * Check circuit breaker status
     */
    checkCircuitBreakers() {
        try {
            this.metrics.circuitBreakers = {
                messageProcessing: messageProcessingBreaker.getStatus(),
                database: databaseBreaker.getStatus(),
                telegramApi: telegramApiBreaker.getStatus(),
                nlpService: nlpServiceBreaker.getStatus()
            };
        } catch (error) {
            logger.error('Circuit breaker check failed:', error);
        }
    }

    /**
     * Check cache health and performance
     */
    checkCacheHealth() {
        try {
            this.metrics.cache = cache.getStats();
        } catch (error) {
            logger.error('Cache health check failed:', error);
        }
    }

    /**
     * Update performance metrics
     */
    updateMetrics() {
        // Update uptime
        this.metrics.system.uptime = Date.now() - this.startTime;
    }

    /**
     * Check for alert conditions
     */
    checkAlerts() {
        const currentTime = Date.now();
        
        // Memory usage alert
        if (this.metrics.system.memoryUsage > this.alertThresholds.memoryUsage) {
            this.addAlert({
                type: 'HIGH_MEMORY_USAGE',
                severity: 'warning',
                message: `Memory usage is ${this.metrics.system.memoryUsage}% (threshold: ${this.alertThresholds.memoryUsage}%)`,
                timestamp: currentTime,
                value: this.metrics.system.memoryUsage
            });
        }
        
        // Database response time alert
        if (this.metrics.database.responseTime > this.alertThresholds.responseTime) {
            this.addAlert({
                type: 'SLOW_DATABASE_RESPONSE',
                severity: 'warning',
                message: `Database response time is ${this.metrics.database.responseTime}ms (threshold: ${this.alertThresholds.responseTime}ms)`,
                timestamp: currentTime,
                value: this.metrics.database.responseTime
            });
        }
        
        // Database connection alert
        if (this.metrics.database.connectionStatus !== 'healthy') {
            this.addAlert({
                type: 'DATABASE_CONNECTION_ISSUE',
                severity: 'critical',
                message: `Database status: ${this.metrics.database.connectionStatus}`,
                timestamp: currentTime,
                error: this.metrics.database.error
            });
        }
        
        // Circuit breaker alerts
        Object.entries(this.metrics.circuitBreakers).forEach(([name, status]) => {
            if (status.state === 'OPEN') {
                this.addAlert({
                    type: 'CIRCUIT_BREAKER_OPEN',
                    severity: 'critical',
                    message: `Circuit breaker '${name}' is OPEN`,
                    timestamp: currentTime,
                    service: name,
                    failureCount: status.failureCount
                });
            }
        });
    }

    /**
     * Add alert to the system
     */
    addAlert(alert) {
        // Deduplicate alerts (don't add same alert within 5 minutes)
        const fiveMinutesAgo = Date.now() - 300000;
        const existingAlert = this.alerts.find(a => 
            a.type === alert.type && 
            a.timestamp > fiveMinutesAgo
        );
        
        if (existingAlert) return;
        
        this.alerts.push(alert);
        
        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }
        
        // Log alert
        const logLevel = alert.severity === 'critical' ? 'error' : 'warn';
        logger[logLevel](`Health Alert [${alert.type}]: ${alert.message}`, alert);
    }

    /**
     * Get current health status
     */
    getHealthStatus() {
        const recentAlerts = this.alerts.filter(alert => 
            Date.now() - alert.timestamp < 300000 // Last 5 minutes
        );
        
        const criticalAlerts = recentAlerts.filter(alert => alert.severity === 'critical');
        const warningAlerts = recentAlerts.filter(alert => alert.severity === 'warning');
        
        let overallStatus = 'healthy';
        if (criticalAlerts.length > 0) {
            overallStatus = 'critical';
        } else if (warningAlerts.length > 0) {
            overallStatus = 'warning';
        }
        
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: this.metrics.system.uptime,
            metrics: this.metrics,
            alerts: {
                total: recentAlerts.length,
                critical: criticalAlerts.length,
                warnings: warningAlerts.length,
                recent: recentAlerts.slice(-10) // Last 10 alerts
            }
        };
    }

    /**
     * Get detailed metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            uptime: this.metrics.system.uptime
        };
    }

    /**
     * Record an error for tracking
     */
    recordError(error, context = {}) {
        this.metrics.errors.total++;
        this.metrics.errors.lastError = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };
        
        // Add critical error alert
        this.addAlert({
            type: 'APPLICATION_ERROR',
            severity: 'critical',
            message: `Application error: ${error.message}`,
            timestamp: Date.now(),
            error: error.message,
            context
        });
    }

    /**
     * Record performance metric
     */
    recordPerformanceMetric(operation, duration, success = true) {
        if (!this.metrics.performance) {
            this.metrics.performance = {};
        }
        
        if (!this.metrics.performance[operation]) {
            this.metrics.performance[operation] = {
                count: 0,
                totalDuration: 0,
                successCount: 0,
                errorCount: 0,
                avgDuration: 0,
                minDuration: Infinity,
                maxDuration: 0
            };
        }
        
        const metric = this.metrics.performance[operation];
        metric.count++;
        metric.totalDuration += duration;
        metric.avgDuration = metric.totalDuration / metric.count;
        metric.minDuration = Math.min(metric.minDuration, duration);
        metric.maxDuration = Math.max(metric.maxDuration, duration);
        
        if (success) {
            metric.successCount++;
        } else {
            metric.errorCount++;
        }
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        return this.metrics.performance || {};
    }

    /**
     * Clear old alerts and metrics
     */
    cleanup() {
        const oneDayAgo = Date.now() - 86400000; // 24 hours
        
        // Remove old alerts
        this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
        
        logger.debug('Health monitor cleanup completed');
    }
}

// Create global health monitor instance
const healthMonitor = new HealthMonitor({
    checkInterval: 30000, // 30 seconds
    thresholds: {
        memoryUsage: 80,
        responseTime: 5000,
        errorRate: 10
    }
});

// Performance monitoring middleware
export const performanceMiddleware = (operationName) => {
    return (target, propertyKey, descriptor) => {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const startTime = Date.now();
            let success = true;
            
            try {
                const result = await originalMethod.apply(this, args);
                return result;
            } catch (error) {
                success = false;
                healthMonitor.recordError(error, { operation: operationName, args });
                throw error;
            } finally {
                const duration = Date.now() - startTime;
                healthMonitor.recordPerformanceMetric(operationName, duration, success);
            }
        };
        
        return descriptor;
    };
};

// Health check endpoints for external monitoring
export const healthEndpoints = {
    // Basic health check
    health: () => healthMonitor.getHealthStatus(),
    
    // Detailed metrics
    metrics: () => healthMonitor.getMetrics(),
    
    // Performance summary
    performance: () => healthMonitor.getPerformanceSummary(),
    
    // Cache statistics
    cache: () => cache.getStats(),
    
    // Database health
    database: async () => {
        try {
            return await checkDatabaseHealth();
        } catch (error) {
            return { status: 'error', error: error.message };
        }
    }
};

export { HealthMonitor, healthMonitor };
