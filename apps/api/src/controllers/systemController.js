import { asyncHandler, successResponse } from '../utils/errorHelpers.js';
import * as db from '@telegram-moderator/shared/services/database.js';
import logger from '@telegram-moderator/shared/services/logger.js';

/**
 * System health check endpoint
 */
export const healthCheck = asyncHandler(async (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'telegram-moderator-bot-api',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external
        },
        environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json(successResponse(healthData, 'Service is healthy'));
});

/**
 * Detailed system status endpoint
 */
export const getStatus = asyncHandler(async (req, res) => {
    try {
        // Check database connectivity
        let dbStatus = 'unknown';
        let dbInfo = {};
        try {
            const dbInstance = db.getDb();
            if (dbInstance) {
                // Test basic query
                await dbInstance.get('SELECT 1 as test');
                dbStatus = 'connected';
                
                // Get basic stats
                const tables = await dbInstance.all("SELECT name FROM sqlite_master WHERE type='table';");
                const auditCount = await dbInstance.get('SELECT COUNT(*) as count FROM audit_log;');
                const groupCount = await dbInstance.get('SELECT COUNT(*) as count FROM groups;');
                const userCount = await dbInstance.get('SELECT COUNT(*) as count FROM users;');
                
                dbInfo = {
                    tables: tables.length,
                    auditLogs: auditCount?.count || 0,
                    groups: groupCount?.count || 0,
                    users: userCount?.count || 0
                };
            }
        } catch (error) {
            dbStatus = 'error';
            dbInfo.error = error.message;
        }

        const statusData = {
            service: {
                name: 'Telegram Moderator Bot API',
                version: '1.0.0',
                status: 'running',
                uptime: process.uptime(),
                startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
            },
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                memory: {
                    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    external: Math.round(process.memoryUsage().external / 1024 / 1024),
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
                },
                cpu: {
                    usage: process.cpuUsage()
                }
            },
            database: {
                status: dbStatus,
                ...dbInfo
            },
            features: {
                authentication: true,
                rateLimit: true,
                cors: true,
                swagger: true,
                webAppSupport: true,
                nlpProcessing: true,
                auditLogging: true
            },
            environment: {
                nodeEnv: process.env.NODE_ENV || 'development',
                port: process.env.API_PORT || 3000,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
        };

        res.status(200).json(successResponse(statusData, 'System status retrieved successfully'));
    } catch (error) {
        logger.error('Failed to retrieve system status:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SYSTEM_STATUS_ERROR',
                message: 'Failed to retrieve system status',
                statusCode: 500
            }
        });
    }
});

/**
 * API information endpoint
 */
export const getApiInfo = asyncHandler(async (req, res) => {
    const apiInfo = {
        name: 'Telegram Moderator Bot API',
        version: '1.0.0',
        description: 'REST API for Telegram Moderator Bot - supports Mini Apps and external integrations',
        status: 'running',
        timestamp: new Date().toISOString(),
        documentation: `${req.protocol}://${req.get('host')}/api/docs`,
        endpoints: {
            system: {
                health: '/api/v1/health',
                status: '/api/v1/status',
                info: '/api/v1/info'
            },
            authentication: {
                loginWidget: '/api/v1/auth/login-widget',
                refresh: '/api/v1/auth/refresh',
                verifyToken: '/api/v1/auth/verify-token'
            },
            webapp: {
                auth: '/api/v1/webapp/auth',
                profile: '/api/v1/webapp/user/profile',
                userGroups: '/api/v1/webapp/user/groups',
                groupInfo: '/api/v1/webapp/group/{groupId}',
                groupStats: '/api/v1/webapp/group/{groupId}/stats',
                groupStrikes: '/api/v1/webapp/group/{groupId}/strikes'
            },
            groups: {
                list: '/api/v1/groups',
                settings: '/api/v1/groups/{groupId}/settings',
                stats: '/api/v1/groups/{groupId}/stats',
                audit: '/api/v1/groups/{groupId}/audit',
                auditExport: '/api/v1/groups/{groupId}/audit/export'
            },
            strikes: {
                get: '/api/v1/groups/{groupId}/users/{userId}/strikes',
                add: '/api/v1/groups/{groupId}/users/{userId}/strikes/add',
                remove: '/api/v1/groups/{groupId}/users/{userId}/strikes/remove',
                set: '/api/v1/groups/{groupId}/users/{userId}/strikes/set'
            },
            nlp: {
                status: '/api/v1/nlp/status',
                testSpam: '/api/v1/nlp/test/spam',
                testProfanity: '/api/v1/nlp/test/profanity',
                analyze: '/api/v1/nlp/analyze'
            },
            logs: {
                browse: '/api/v1/logs',
                download: '/api/v1/logs/download',
                stats: '/api/v1/logs/stats'
            },
            metrics: {
                system: '/api/v1/metrics'
            }
        },
        supportedFeatures: [
            'Telegram Mini App Authentication',
            'Telegram Login Widget Authentication',
            'JWT Token Authentication',
            'Group Moderation Management',
            'Strike System',
            'Audit Log with Export',
            'NLP Content Analysis',
            'Rate Limiting',
            'CORS Support',
            'OpenAPI Documentation'
        ]
    };

    res.status(200).json(successResponse(apiInfo, 'API information retrieved successfully'));
});

/**
 * Get API metrics
 */
export const getMetrics = asyncHandler(async (req, res) => {
    try {
        const dbInstance = db.getDb();
        
        // Get database metrics
        const totalAuditLogs = await dbInstance.get('SELECT COUNT(*) as count FROM audit_log;');
        const recentAuditLogs = await dbInstance.get(`
            SELECT COUNT(*) as count FROM audit_log 
            WHERE timestamp >= datetime('now', '-24 hours');
        `);
        const totalGroups = await dbInstance.get('SELECT COUNT(*) as count FROM groups;');
        const totalUsers = await dbInstance.get('SELECT COUNT(*) as count FROM users;');
        const totalStrikes = await dbInstance.get('SELECT SUM(count) as total FROM strikes;');
        
        // Get top violation types
        const topViolations = await dbInstance.all(`
            SELECT 
                JSON_EXTRACT(logData, '$.violationType') as type,
                COUNT(*) as count 
            FROM audit_log 
            WHERE JSON_EXTRACT(logData, '$.violationType') IS NOT NULL 
            GROUP BY JSON_EXTRACT(logData, '$.violationType') 
            ORDER BY count DESC 
            LIMIT 5;
        `);

        const metricsData = {
            database: {
                totalAuditLogs: totalAuditLogs?.count || 0,
                recentAuditLogs24h: recentAuditLogs?.count || 0,
                totalGroups: totalGroups?.count || 0,
                totalUsers: totalUsers?.count || 0,
                totalStrikes: totalStrikes?.total || 0
            },
            moderation: {
                topViolationTypes: topViolations.map(v => ({
                    type: v.type,
                    count: v.count
                }))
            },
            system: {
                uptime: process.uptime(),
                memoryUsage: {
                    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                timestamp: new Date().toISOString()
            }
        };

        res.status(200).json(successResponse(metricsData, 'Metrics retrieved successfully'));
    } catch (error) {
        logger.error('Failed to retrieve metrics:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'METRICS_ERROR',
                message: 'Failed to retrieve system metrics',
                statusCode: 500
            }
        });
    }
});
