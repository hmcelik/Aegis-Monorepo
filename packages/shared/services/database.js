/**
 * @fileoverview Manages all interactions with the SQLite database.
 * This includes initializing the database, managing tables for settings,
 * user strikes, audit logs, and whitelisted keywords.
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import logger from './logger.js';

// The database connection object. It will be initialized once.
let db;

/**
 * Initializes the database connection and creates tables if they do not exist.
 * This function must be called at application startup.
 * Renamed from initDb to initializeDatabase to match what server.js expects.
 */
export const initializeDatabase = async (isTest = false) => {
    if (db) {
        return; // Already initialized
    }

    try {
        const dbPath = isTest ? ':memory:' : (process.env.DATABASE_PATH || './moderator.db');
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });

        // Use PRAGMA for better performance and concurrency
        await db.exec('PRAGMA journal_mode = WAL;');

        await db.exec(`
            CREATE TABLE IF NOT EXISTS groups (
                chatId TEXT PRIMARY KEY,
                chatTitle TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                userId TEXT PRIMARY KEY,
                username TEXT,
                firstName TEXT,
                lastName TEXT
            );
            CREATE TABLE IF NOT EXISTS strikes (
                chatId TEXT NOT NULL,
                userId TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT,
                PRIMARY KEY (chatId, userId)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                chatId TEXT NOT NULL,
                userId TEXT NOT NULL,
                logData TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                chatId TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (chatId, key)
            );
            CREATE TABLE IF NOT EXISTS keyword_whitelist (
                chatId TEXT NOT NULL,
                keyword TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (chatId, keyword)
            );
        `);

        if (!isTest) {
            logger.info('Database initialized successfully.');
        }
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error; // Rethrow the error to stop the application from starting
    }
};

/**
 * Returns the active database connection instance.
 * Throws an error if the database has not been initialized.
 */
export const getDb = () => {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase first.');
    }
    return db;
};

/**
 * Injects a database connection object. Used for testing purposes.
 * @param {object} dbConnection - The database connection object from sqlite.open().
 */
export const setDb = (dbConnection) => {
    db = dbConnection;
};

// --- User Management ---

export const upsertUser = (user) => {
    if (!user || !user.id) return;
    return getDb().run(
        `INSERT INTO users (userId, username, firstName, lastName) VALUES (?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
         username = excluded.username,
         firstName = excluded.firstName,
         lastName = excluded.lastName`,
        user.id.toString(), user.username, user.first_name, user.last_name
    );
};

export const findUserByUsernameInDb = (username) => {
    if (!username) return null;
    return getDb().get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', username);
};


// --- Group Management ---

export const addGroup = (chatId, chatTitle) => {
    return getDb().run('INSERT OR REPLACE INTO groups (chatId, chatTitle) VALUES (?, ?)', chatId, chatTitle);
};

export const removeGroup = (chatId) => {
    return getDb().run('DELETE FROM groups WHERE chatId = ?', chatId);
};

export const getAllGroups = () => {
    return getDb().all('SELECT * FROM groups');
};

export const getGroup = (chatId) => {
    return getDb().get('SELECT * FROM groups WHERE chatId = ?', chatId);
};


// --- Keyword Whitelist Logic ---

export const addWhitelistKeyword = (chatId, keyword) => {
    return getDb().run('INSERT OR IGNORE INTO keyword_whitelist (chatId, keyword) VALUES (?, ?)', chatId, keyword);
};

export const removeWhitelistKeyword = (chatId, keyword) => {
    return getDb().run('DELETE FROM keyword_whitelist WHERE chatId = ? AND keyword = ?', chatId, keyword);
};

export const getWhitelistKeywords = async (chatId) => {
    const rows = await getDb().all('SELECT keyword FROM keyword_whitelist WHERE chatId = ?', chatId);
    return rows.map(row => row.keyword);
};


// --- Strike and Audit Logic ---

export const recordStrike = async (chatId, userId, logData) => {
    const dbInstance = getDb();
    await dbInstance.run('BEGIN TRANSACTION');
    try {
        await dbInstance.run(
            'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, 1, ?) ON CONFLICT(chatId, userId) DO UPDATE SET count = count + 1, timestamp = ?',
            chatId,
            userId,
            new Date().toISOString(),
            new Date().toISOString()
        );
        await dbInstance.run(
            'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
            logData.timestamp,
            chatId,
            userId,
            JSON.stringify(logData)
        );
        await dbInstance.run('COMMIT');

        const { count } = await getStrikes(chatId, userId);
        return count;
    } catch (error) {
        await dbInstance.run('ROLLBACK');
        logger.error('Failed to record strike in transaction', error);
        throw error;
    }
};

export const logManualAction = (chatId, userId, logData) => {
    return getDb().run(
        'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
        new Date().toISOString(),
        chatId,
        userId,
        JSON.stringify(logData)
    );
};

export const getStrikes = async (chatId, userId) => {
    await recalculateStrikes(chatId, userId);
    return await getDb().get('SELECT count, timestamp FROM strikes WHERE chatId = ? AND userId = ?', chatId, userId) || { count: 0, timestamp: null };
};

export const resetStrikes = (chatId, userId) => {
    return getDb().run('UPDATE strikes SET count = 0, timestamp = NULL WHERE chatId = ? AND userId = ?', chatId, userId);
};

export const addStrikes = async (chatId, userId, amount) => {
    await getDb().run(
        `INSERT INTO strikes (chatId, userId, count) VALUES (?, ?, ?)
         ON CONFLICT(chatId, userId) DO UPDATE SET count = count + excluded.count`,
        chatId, userId, amount
    );
    const { count } = await getStrikes(chatId, userId);
    return count;
};

export const removeStrike = async (chatId, userId, amount) => {
    const currentStrikes = await getStrikes(chatId, userId);
    if (currentStrikes.count === 0) return 0;
    const newCount = Math.max(0, currentStrikes.count - amount);
    await getDb().run('UPDATE strikes SET count = ? WHERE chatId = ? AND userId = ?', newCount, chatId, userId);
    return newCount;
};

export const setStrikes = async (chatId, userId, amount) => {
    await getDb().run(
        `INSERT INTO strikes (chatId, userId, count, timestamp)
         VALUES (?, ?, ?, CASE WHEN ? > 0 THEN ? ELSE NULL END)
         ON CONFLICT(chatId, userId) DO UPDATE SET count = excluded.count`,
        chatId, userId, amount, amount, new Date().toISOString()
    );
    const { count } = await getStrikes(chatId, userId);
    return count;
};

export const getTotalDeletionsToday = async (chatId) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await getDb().get(`SELECT COUNT(*) as count FROM audit_log WHERE chatId = ? AND date(timestamp) = ?`, chatId, today);
    return result?.count || 0;
};

export const getAuditLog = (chatId, limit = 15) => {
    return getDb().all('SELECT * FROM audit_log WHERE chatId = ? ORDER BY timestamp DESC LIMIT ?', chatId, limit);
};

export const getStrikeHistory = (chatId, userId, limit = 10) => {
    return getDb().all('SELECT * FROM audit_log WHERE chatId = ? AND userId = ? ORDER BY timestamp DESC LIMIT ?', chatId, userId, limit);
};

// --- Settings Logic ---

export const getSetting = async (chatId, key, defaultValue) => {
    const row = await getDb().get('SELECT value FROM settings WHERE chatId = ? AND key = ?', chatId, key);
    if (!row) return defaultValue;
    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
};

export const setSetting = (chatId, key, value) => {
    return getDb().run('INSERT OR REPLACE INTO settings (chatId, key, value) VALUES (?, ?, ?)', chatId, key, JSON.stringify(value));
};

export const recalculateStrikes = async (chatId, userId) => {
    const strikeExpirationDays = await getSetting(chatId, 'strikeExpirationDays', 30);
    if (strikeExpirationDays > 0) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - strikeExpirationDays);
        await getDb().run('DELETE FROM strikes WHERE chatId = ? AND userId = ? AND timestamp < ?', chatId, userId, expirationDate.toISOString());
    }
};

// --- WebApp Additional Functions ---

export const getUser = (userId) => {
    return getDb().get('SELECT * FROM users WHERE userId = ?', userId.toString());
};

export const getUserAdminGroups = async (userId) => {
    // Import here to avoid circular dependencies
    const { getChatAdmins } = await import('./telegram.js');
    
    // Get all groups from database
    const allGroups = await getDb().all('SELECT * FROM groups ORDER BY chatTitle');
    const userAdminGroups = [];

    // Check each group to see if user is an admin
    const { getChatMemberCount } = await import('./telegram.js');
    for (const group of allGroups) {
        try {
            const admins = await getChatAdmins(group.chatId);
            if (admins.includes(parseInt(userId))) {
                let member_count = 0;
                // Only try to get member count if we successfully got admin list
                // This indicates the bot has access to this group
                if (admins.length > 0) {
                    try {
                        member_count = await getChatMemberCount(group.chatId);
                    } catch (err) {
                        // Silently fail for member count - bot might not have permission
                        // but can still manage the group if user is admin
                        member_count = 0;
                    }
                }
                userAdminGroups.push({
                    id: group.chatId,
                    title: group.chatTitle,
                    type: 'group', // or 'supergroup' based on your data
                    member_count
                });
            }
        } catch (error) {
            // Skip groups where admin info is unavailable (bot not in group, etc.)
            console.warn(`Could not check admin status for group ${group.chatId}:`, error.message);
        }
    }
    return userAdminGroups;
};

export const isUserGroupAdmin = async (userId, groupId) => {
    // Import here to avoid circular dependencies
    const { getChatAdmins } = await import('./telegram.js');
    
    try {
        const admins = await getChatAdmins(groupId);
        return admins.includes(parseInt(userId));
    } catch (error) {
        console.warn(`Could not check admin status for user ${userId} in group ${groupId}:`, error.message);
        return false;
    }
};

export const setWhitelistKeywords = async (chatId, keywords) => {
    const dbInstance = getDb();
    await dbInstance.run('BEGIN TRANSACTION');
    try {
        // Clear existing keywords
        await dbInstance.run('DELETE FROM keyword_whitelist WHERE chatId = ?', chatId);
        
        // Add new keywords
        for (const keyword of keywords) {
            await dbInstance.run('INSERT INTO keyword_whitelist (chatId, keyword) VALUES (?, ?)', chatId, keyword);
        }
        
        await dbInstance.run('COMMIT');
    } catch (error) {
        await dbInstance.run('ROLLBACK');
        logger.error('Failed to set whitelist keywords:', error);
        throw error;
    }
};

export const getGroupStats = async (groupId, startDate, endDate) => {
    const dbInstance = getDb();
    
    try {
        // Count scanned messages - current approach (temporary until counter table)
        const scannedMessages = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ?
            AND JSON_EXTRACT(logData, '$.type') = 'SCANNED'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // TODO: Replace above with efficient counter table query:
        // const stats = await dbInstance.get(`
        //     SELECT SUM(messages_scanned) as totalMessages
        //     FROM message_stats 
        //     WHERE chatId = ? AND date BETWEEN ? AND ?
        // `, groupId, startDate.split('T')[0], endDate.split('T')[0]);

        // Count flagged messages by violation type
        const spamMessages = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.violationType') = 'SPAM'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const profanityMessages = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.violationType') = 'PROFANITY'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Legacy compatibility: count old AUTO entries
        const legacyAutoEntries = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const spamCount = (spamMessages?.count || 0) + (legacyAutoEntries?.count || 0);
        const profanityCount = profanityMessages?.count || 0;

        // Count deleted messages (new and legacy)
        const deletedMessagesNew = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'message_deleted'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const deletedMessagesLegacy = await dbInstance.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
            AND JSON_EXTRACT(logData, '$.action') = 'deleted'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const totalDeleted = (deletedMessagesNew?.count || 0) + (deletedMessagesLegacy?.count || 0);

        // Count unique users affected by penalties
        const mutedUsers = await dbInstance.get(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_muted'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const kickedUsers = await dbInstance.get(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_kicked'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const bannedUsers = await dbInstance.get(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_banned'
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Get average spam score from flagged messages
        const spamScores = await dbInstance.all(`
            SELECT JSON_EXTRACT(logData, '$.spamScore') as score 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.spamScore') IS NOT NULL
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Include legacy scores
        const legacyScores = await dbInstance.all(`
            SELECT JSON_EXTRACT(logData, '$.classificationScore') as score 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
            AND JSON_EXTRACT(logData, '$.classificationScore') IS NOT NULL
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const allScores = [
            ...spamScores.map(row => parseFloat(row.score || 0)),
            ...legacyScores.map(row => parseFloat(row.score || 0))
        ].filter(score => score > 0);

        const avgSpamScore = allScores.length > 0 
            ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length 
            : 0;

        // Get top violation types
        const violationTypes = await dbInstance.all(`
            SELECT 
                JSON_EXTRACT(logData, '$.violationType') as type, 
                COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.violationType') IS NOT NULL
            GROUP BY type
            ORDER BY count DESC
            LIMIT 5
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Add legacy types
        if (legacyAutoEntries?.count > 0) {
            const existingSpam = violationTypes.find(v => v.type === 'SPAM');
            if (existingSpam) {
                existingSpam.count += legacyAutoEntries.count;
            } else {
                violationTypes.push({ type: 'SPAM', count: legacyAutoEntries.count });
            }
        }

        const totalScanned = scannedMessages?.count || 0;

        return {
            totalMessages: totalScanned,
            flaggedMessages: {
                total: spamCount + profanityCount,
                spam: spamCount,
                profanity: profanityCount
            },
            deletedMessages: totalDeleted,
            mutedUsers: mutedUsers?.count || 0,
            kickedUsers: kickedUsers?.count || 0,
            bannedUsers: bannedUsers?.count || 0,
            averageSpamScore: Math.round(avgSpamScore * 100) / 100,
            topViolationTypes: violationTypes.map(row => ({ 
                type: row.type, 
                count: row.count 
            })).sort((a, b) => b.count - a.count),
            flaggedRate: totalScanned > 0 ? 
                Math.round((spamCount + profanityCount) / totalScanned * 10000) / 100 : 0,
            autoModerationEfficiency: {
                messagesScanned: totalScanned,
                violationsDetected: spamCount + profanityCount,
                usersActioned: (mutedUsers?.count || 0) + (kickedUsers?.count || 0) + (bannedUsers?.count || 0)
            }
        };
    } catch (error) {
        logger.error('Error getting group stats:', error);
        throw error;
    }
};

/**
 * Get total count of unique users across all groups
 */
export const getTotalUsersCount = async () => {
    try {
        const result = await db.get('SELECT COUNT(DISTINCT userId) as count FROM users');
        return result?.count || 0;
    } catch (error) {
        logger.error('Error getting total users count:', error);
        throw error;
    }
};

/**
 * Get total count of active strikes across all groups
 */
export const getTotalStrikesCount = async () => {
    try {
        const result = await db.get('SELECT SUM(count) as total FROM strikes WHERE count > 0');
        return result?.total || 0;
    } catch (error) {
        logger.error('Error getting total strikes count:', error);
        throw error;
    }
};

/**
 * Get total deletions today across all groups (for super admin)
 */
export const getGlobalDeletionsToday = async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const result = await db.get(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE timestamp >= ? AND timestamp < ?
            AND logData LIKE '%AUTO%'
        `, today.toISOString(), tomorrow.toISOString());
        
        return result?.count || 0;
    } catch (error) {
        logger.error('Error getting global deletions today:', error);
        throw error;
    }
};

/**
 * Get top groups by deletion count
 */
export const getTopGroupsByDeletions = async (limit = 5) => {
    try {
        const result = await db.all(`
            SELECT 
                g.chatId,
                g.chatTitle,
                COUNT(CASE WHEN JSON_EXTRACT(al.logData, '$.action') = 'message_deleted' THEN 1 END) as deletions_new,
                COUNT(CASE WHEN JSON_EXTRACT(al.logData, '$.type') = 'AUTO' AND JSON_EXTRACT(al.logData, '$.action') = 'deleted' THEN 1 END) as deletions_old
            FROM groups g
            LEFT JOIN audit_log al ON g.chatId = al.chatId
            GROUP BY g.chatId, g.chatTitle
            ORDER BY (deletions_new + deletions_old) DESC
            LIMIT ?
        `, limit);
        
        return result.map(row => ({
            chatId: row.chatId,
            chatTitle: row.chatTitle,
            deletions: row.deletions_new + row.deletions_old
        })) || [];
    } catch (error) {
        logger.error('Error getting top groups by deletions:', error);
        throw error;
    }
};

/**
 * Get user activity stats for a specific group
 */
export const getUserActivityStats = async (groupId, startDate, endDate, limit = 10) => {
    try {
        const result = await db.all(`
            SELECT 
                u.userId,
                u.username,
                u.firstName,
                u.lastName,
                COUNT(CASE WHEN JSON_EXTRACT(al.logData, '$.type') = 'SCANNED' THEN 1 END) as messages_sent,
                COUNT(CASE WHEN JSON_EXTRACT(al.logData, '$.type') = 'VIOLATION' THEN 1 END) as violations,
                COUNT(CASE WHEN JSON_EXTRACT(al.logData, '$.type') = 'PENALTY' THEN 1 END) as penalties,
                AVG(CASE 
                    WHEN JSON_EXTRACT(al.logData, '$.spamScore') IS NOT NULL 
                    THEN CAST(JSON_EXTRACT(al.logData, '$.spamScore') AS REAL)
                    WHEN JSON_EXTRACT(al.logData, '$.classificationScore') IS NOT NULL 
                    THEN CAST(JSON_EXTRACT(al.logData, '$.classificationScore') AS REAL)
                END) as avg_spam_score
            FROM users u
            JOIN audit_log al ON u.userId = al.userId
            WHERE al.chatId = ? AND al.timestamp BETWEEN ? AND ?
            GROUP BY u.userId, u.username, u.firstName, u.lastName
            ORDER BY violations DESC, penalties DESC
            LIMIT ?
        `, groupId, startDate.toISOString(), endDate.toISOString(), limit);
        
        return result || [];
    } catch (error) {
        logger.error('Error getting user activity stats:', error);
        throw error;
    }
};

/**
 * Get time-based activity patterns for a group
 */
export const getActivityPatterns = async (groupId, startDate, endDate) => {
    try {
        // Get hourly distribution
        const hourlyActivity = await db.all(`
            SELECT 
                strftime('%H', timestamp) as hour,
                COUNT(CASE WHEN JSON_EXTRACT(logData, '$.type') = 'SCANNED' THEN 1 END) as messages,
                COUNT(CASE WHEN JSON_EXTRACT(logData, '$.type') = 'VIOLATION' THEN 1 END) as violations
            FROM audit_log
            WHERE chatId = ? AND timestamp BETWEEN ? AND ?
            GROUP BY hour
            ORDER BY hour
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Get daily distribution
        const dailyActivity = await db.all(`
            SELECT 
                date(timestamp) as date,
                COUNT(CASE WHEN JSON_EXTRACT(logData, '$.type') = 'SCANNED' THEN 1 END) as messages,
                COUNT(CASE WHEN JSON_EXTRACT(logData, '$.type') = 'VIOLATION' THEN 1 END) as violations
            FROM audit_log
            WHERE chatId = ? AND timestamp BETWEEN ? AND ?
            GROUP BY date
            ORDER BY date
        `, groupId, startDate.toISOString(), endDate.toISOString());

        return {
            hourlyDistribution: hourlyActivity,
            dailyActivity: dailyActivity
        };
    } catch (error) {
        logger.error('Error getting activity patterns:', error);
        throw error;
    }
};

/**
 * Get comprehensive moderation effectiveness metrics
 */
export const getModerationEffectiveness = async (groupId, startDate, endDate) => {
    try {
        // Get response time metrics (time between violation and penalty)
        const responseTimeStats = await db.all(`
            SELECT 
                v.timestamp as violation_time,
                p.timestamp as penalty_time,
                (julianday(p.timestamp) - julianday(v.timestamp)) * 86400 as response_time_seconds,
                JSON_EXTRACT(v.logData, '$.violationType') as violation_type,
                JSON_EXTRACT(p.logData, '$.action') as penalty_action
            FROM audit_log v
            JOIN audit_log p ON v.userId = p.userId AND v.chatId = p.chatId
            WHERE v.chatId = ? 
            AND v.timestamp BETWEEN ? AND ?
            AND JSON_EXTRACT(v.logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(p.logData, '$.type') = 'PENALTY'
            AND p.timestamp > v.timestamp
            AND (julianday(p.timestamp) - julianday(v.timestamp)) * 86400 < 300  -- Within 5 minutes
        `, groupId, startDate.toISOString(), endDate.toISOString());

        // Get repeat offender statistics
        const repeatOffenders = await db.all(`
            SELECT 
                userId,
                COUNT(*) as total_violations,
                COUNT(DISTINCT date(timestamp)) as active_days,
                AVG(CASE 
                    WHEN JSON_EXTRACT(logData, '$.spamScore') IS NOT NULL 
                    THEN CAST(JSON_EXTRACT(logData, '$.spamScore') AS REAL)
                    WHEN JSON_EXTRACT(logData, '$.classificationScore') IS NOT NULL 
                    THEN CAST(JSON_EXTRACT(logData, '$.classificationScore') AS REAL)
                END) as avg_violation_score
            FROM audit_log
            WHERE chatId = ? AND timestamp BETWEEN ? AND ?
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            GROUP BY userId
            HAVING total_violations > 1
            ORDER BY total_violations DESC
        `, groupId, startDate.toISOString(), endDate.toISOString());

        const avgResponseTime = responseTimeStats.length > 0 
            ? responseTimeStats.reduce((sum, row) => sum + row.response_time_seconds, 0) / responseTimeStats.length 
            : 0;

        return {
            averageResponseTimeSeconds: Math.round(avgResponseTime * 100) / 100,
            responseTimeDistribution: responseTimeStats,
            repeatOffenders: repeatOffenders.slice(0, 10), // Top 10
            totalRepeatOffenders: repeatOffenders.length,
            effectivenessScore: responseTimeStats.length > 0 ? Math.max(0, 100 - (avgResponseTime / 60) * 10) : 0 // Score based on response time
        };
    } catch (error) {
        logger.error('Error getting moderation effectiveness:', error);
        throw error;
    }
};

/**
 * Get paginated audit log entries for a group
 */
export const getAuditLogPaginated = async (groupId, options = {}) => {
    const dbInstance = getDb();
    const { limit = 50, offset = 0, type, userId } = options;
    
    try {
        // Build WHERE clauses
        let whereClause = 'WHERE chatId = ?';
        const params = [groupId];
        
        if (type) {
            whereClause += ' AND JSON_EXTRACT(logData, \'$.type\') = ?';
            params.push(type);
        }
        
        if (userId) {
            whereClause += ' AND userId = ?';
            params.push(userId);
        }
        
        // Get total count
        const totalResult = await dbInstance.get(`
            SELECT COUNT(*) as total 
            FROM audit_log 
            ${whereClause}
        `, ...params);
        
        const total = totalResult?.total || 0;
        
        // Get paginated entries
        const entries = await dbInstance.all(`
            SELECT 
                id,
                timestamp,
                userId,
                chatId,
                logData
            FROM audit_log 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        `, ...params, limit, offset);
        
        // Parse logData for each entry
        const parsedEntries = entries.map(entry => ({
            id: entry.id,
            timestamp: entry.timestamp,
            userId: entry.userId,
            chatId: entry.chatId,
            type: JSON.parse(entry.logData || '{}').type || 'UNKNOWN',
            action: JSON.parse(entry.logData || '{}').action || null,
            details: JSON.parse(entry.logData || '{}')
        }));
        
        return {
            entries: parsedEntries,
            total: total,
            hasMore: (offset + limit) < total
        };
    } catch (error) {
        logger.error('Error getting paginated audit log:', error);
        throw error;
    }
};

/**
 * Export audit log in CSV or JSON format
 */
export const exportAuditLog = async (groupId, options = {}) => {
    const dbInstance = getDb();
    const { startDate, endDate } = options;
    
    try {
        let whereClause = 'WHERE chatId = ?';
        const params = [groupId];
        
        if (startDate) {
            whereClause += ' AND timestamp >= ?';
            params.push(new Date(startDate).toISOString());
        }
        
        if (endDate) {
            whereClause += ' AND timestamp <= ?';
            params.push(new Date(endDate).toISOString());
        }
        
        const entries = await dbInstance.all(`
            SELECT 
                id,
                timestamp,
                userId,
                chatId,
                logData
            FROM audit_log 
            ${whereClause}
            ORDER BY timestamp DESC
        `, ...params);
        
        // Parse entries for export
        const exportEntries = entries.map(entry => {
            const logData = JSON.parse(entry.logData || '{}');
            return {
                id: entry.id,
                timestamp: entry.timestamp,
                userId: entry.userId,
                chatId: entry.chatId,
                type: logData.type || 'UNKNOWN',
                action: logData.action || null,
                violationType: logData.violationType || null,
                spamScore: logData.spamScore || null,
                profanityScore: logData.profanityScore || null,
                reason: logData.reason || null,
                adminId: logData.adminId || null,
                amount: logData.amount || null
            };
        });
        
        // Generate CSV content
        const csvHeaders = [
            'ID', 'Timestamp', 'User ID', 'Chat ID', 'Type', 
            'Action', 'Violation Type', 'Spam Score', 'Profanity Score', 
            'Reason', 'Admin ID', 'Amount'
        ];
        
        const csvRows = exportEntries.map(entry => [
            entry.id,
            entry.timestamp,
            entry.userId,
            entry.chatId,
            entry.type,
            entry.action || '',
            entry.violationType || '',
            entry.spamScore || '',
            entry.profanityScore || '',
            entry.reason || '',
            entry.adminId || '',
            entry.amount || ''
        ]);
        
        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.map(field => 
                typeof field === 'string' && field.includes(',') 
                    ? `"${field.replace(/"/g, '""')}"` 
                    : field
            ).join(','))
        ].join('\n');
        
        return {
            entries: exportEntries,
            csv: csvContent,
            total: exportEntries.length
        };
    } catch (error) {
        logger.error('Error exporting audit log:', error);
        throw error;
    }
};