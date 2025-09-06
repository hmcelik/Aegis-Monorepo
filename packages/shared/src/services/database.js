/**
 * @fileoverview Manages all interactions with the SQLite database.
 * This includes initializing the database, managing tables for settings,
 * user strikes, audit logs, and whitelisted keywords.
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import logger from './logger.js';
import { databaseBreaker, resetAllCircuitBreakers } from '../utils/circuitBreaker.js';
import { globalRetryManager, withTimeout } from '../utils/resilience.js';
import { cache, CacheKeys } from '../utils/cache.js';

// Enhanced database connection management
class DatabaseConnectionManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.connectionPool = new Map();
        this.maxConnections = 10;
        this.connectionTimeout = 30000; // 30 seconds
        this.idleTimeout = 300000; // 5 minutes
        this.healthCheckInterval = 60000; // 1 minute
        this.lastHealthCheck = null;
        
        // Start periodic health checks
        this.startHealthMonitoring();
    }

    /**
     * Initialize database with enhanced connection management
     */
    async initialize(isTest = false) {
        if (this.isInitialized) {
            return this.db;
        }

        try {
            const dbPath = isTest ? ':memory:' : (process.env.DATABASE_PATH || './moderator.db');
            
            this.db = await databaseBreaker.execute(async () => {
                return await withTimeout(
                    open({
                        filename: dbPath,
                        driver: sqlite3.Database,
                    }),
                    this.connectionTimeout,
                    'Database connection'
                );
            });

            // Enhanced PRAGMA settings for better performance and concurrency
            await this.db.exec('PRAGMA journal_mode = WAL;');
            await this.db.exec('PRAGMA synchronous = NORMAL;'); // Better performance than FULL
            await this.db.exec('PRAGMA cache_size = 10000;'); // 10MB cache
            await this.db.exec('PRAGMA temp_store = MEMORY;'); // Use memory for temp tables
            await this.db.exec('PRAGMA foreign_keys = ON;'); // Enable foreign key constraints
            await this.db.exec('PRAGMA busy_timeout = 30000;'); // 30 second busy timeout
            await this.db.exec('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped I/O
            await this.db.exec('PRAGMA optimize;'); // Enable query planner optimizations

            // Set up connection event handlers for better error handling
            this.db.on('error', (error) => {
                logger.error('Database connection error:', error);
                this.handleConnectionError(error);
            });

            this.db.on('close', () => {
                logger.info('Database connection closed');
                this.isInitialized = false;
            });

            // Create tables and indexes
            await this.createTablesAndIndexes();

            this.isInitialized = true;
            this.lastHealthCheck = Date.now();

            if (!isTest) {
                logger.info('Database initialized successfully with enhanced configuration.');
            }

            return this.db;
        } catch (error) {
            logger.error('Database initialization failed:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * Create tables and performance indexes
     */
    async createTablesAndIndexes() {
        await this.db.exec(`
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

            -- Performance indexes for analytical queries
            CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_log_chat_timestamp ON audit_log(chatId, timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp ON audit_log(userId, timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_log_type ON audit_log(json_extract(logData, '$.type'));
            CREATE INDEX IF NOT EXISTS idx_strikes_timestamp ON strikes(timestamp);
            CREATE INDEX IF NOT EXISTS idx_strikes_count ON strikes(count);
            
            -- Additional performance indexes
            CREATE INDEX IF NOT EXISTS idx_audit_log_composite ON audit_log(chatId, userId, timestamp);
            CREATE INDEX IF NOT EXISTS idx_strikes_chat_count ON strikes(chatId, count);
            CREATE INDEX IF NOT EXISTS idx_settings_lookup ON settings(chatId, key);
        `);
    }

    /**
     * Get database instance with health check
     */
    async getDatabase() {
        if (!this.isInitialized || !this.db) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        // Periodic health check
        const now = Date.now();
        if (now - this.lastHealthCheck > this.healthCheckInterval) {
            await this.performHealthCheck();
        }

        return this.db;
    }

    /**
     * Perform database health check
     */
    async performHealthCheck() {
        try {
            await databaseBreaker.execute(async () => {
                await withTimeout(
                    this.db.get('SELECT 1 as health_check'),
                    5000,
                    'Database health check'
                );
            });
            
            this.lastHealthCheck = Date.now();
            logger.debug('Database health check passed');
        } catch (error) {
            logger.error('Database health check failed:', error);
            throw new Error(`Database health check failed: ${error.message}`);
        }
    }

    /**
     * Handle connection errors
     */
    handleConnectionError(error) {
        logger.error('Database connection error detected:', error);
        
        // Mark connection as unhealthy
        this.isInitialized = false;
        
        // Attempt to reconnect if it's a recoverable error
        if (this.isRecoverableError(error)) {
            logger.info('Attempting database reconnection...');
            setTimeout(() => this.attemptReconnection(), 5000);
        }
    }

    /**
     * Check if error is recoverable
     */
    isRecoverableError(error) {
        const recoverableErrors = [
            'SQLITE_BUSY',
            'SQLITE_LOCKED',
            'SQLITE_IOERR',
            'ECONNRESET',
            'ETIMEDOUT'
        ];
        
        return recoverableErrors.some(code => 
            error.code === code || error.message.includes(code)
        );
    }

    /**
     * Attempt to reconnect to database
     */
    async attemptReconnection() {
        try {
            if (this.db) {
                await this.db.close();
            }
            
            await this.initialize();
            logger.info('Database reconnection successful');
        } catch (error) {
            logger.error('Database reconnection failed:', error);
            // Schedule another attempt
            setTimeout(() => this.attemptReconnection(), 10000);
        }
    }

    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            if (this.isInitialized && this.db) {
                try {
                    await this.performHealthCheck();
                } catch (error) {
                    logger.warn('Periodic health check failed:', error);
                }
            }
        }, this.healthCheckInterval);
    }

    /**
     * Close database connection gracefully
     */
    async close() {
        if (this.db) {
            try {
                await this.db.close();
                this.db = null;
                this.isInitialized = false;
                logger.info('Database connection closed successfully');
            } catch (error) {
                logger.error('Error closing database connection:', error);
                throw error;
            }
        }
    }

    /**
     * Get connection status and metrics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            hasConnection: !!this.db,
            lastHealthCheck: this.lastHealthCheck ? new Date(this.lastHealthCheck).toISOString() : null,
            healthCheckInterval: this.healthCheckInterval,
            connectionTimeout: this.connectionTimeout,
            circuitBreakerStatus: databaseBreaker.getStatus()
        };
    }

    /**
     * Create a new database connection for transactions
     * This allows concurrent transactions without blocking the main connection
     */
    async createConnection() {
        try {
            const dbPath = process.env.DATABASE_PATH || './moderator.db';
            
            const newConnection = await withTimeout(
                open({
                    filename: dbPath,
                    driver: sqlite3.Database,
                }),
                this.connectionTimeout,
                'New database connection'
            );

            // Apply same PRAGMA settings for consistency
            await newConnection.exec('PRAGMA journal_mode = WAL;');
            await newConnection.exec('PRAGMA synchronous = NORMAL;');
            await newConnection.exec('PRAGMA cache_size = 1000;'); // Smaller cache for individual connections
            await newConnection.exec('PRAGMA temp_store = MEMORY;');
            await newConnection.exec('PRAGMA foreign_keys = ON;');
            await newConnection.exec('PRAGMA busy_timeout = 30000;');

            return newConnection;
        } catch (error) {
            logger.error('Failed to create new database connection:', error);
            throw error;
        }
    }

    /**
     * Get the main database connection
     */
    getConnection() {
        if (!this.isInitialized || !this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }
}

// Global connection manager instance
const connectionManager = new DatabaseConnectionManager();
const dbConnManager = connectionManager; // Alias for easier access

// The database connection object. It will be initialized once.
let db;

/**
 * Initializes the database connection and creates tables if they do not exist.
 * This function must be called at application startup.
 * Renamed from initDb to initializeDatabase to match what server.js expects.
 */
export const initializeDatabase = async (isTest = false) => {
    try {
        db = await connectionManager.initialize(isTest);
        return db;
    } catch (error) {
        logger.error('Failed to initialize database through connection manager:', error);
        throw error;
    }
};

/**
 * Returns the active database connection instance.
 * Throws an error if the database has not been initialized.
 */
export const getDb = async () => {
    try {
        if (!db) {
            db = await connectionManager.getDatabase();
        }
        return db;
    } catch (error) {
        logger.error('Failed to get database connection:', error);
        throw new Error('Database connection unavailable. Please check system health.');
    }
};

/**
 * Injects a database connection object. Used for testing purposes.
 * @param {object} dbConnection - The database connection object from sqlite.open().
 */
export const setDb = (dbConnection) => {
    db = dbConnection;
};

/**
 * Closes the database connection gracefully
 */
export const closeDatabase = async () => {
    try {
        await connectionManager.close();
        db = null;
    } catch (error) {
        logger.error('Error closing database:', error);
        throw error;
    }
};

/**
 * Health check for database connection
 */
export const checkDatabaseHealth = async () => {
    try {
        const status = connectionManager.getStatus();
        
        if (!status.isInitialized || !status.hasConnection) {
            return { status: 'disconnected', error: 'Database not initialized' };
        }
        
        // Test the connection with a simple query
        const dbInstance = await getDb();
        await dbInstance.get('SELECT 1 as test');
        
        return { 
            status: 'healthy', 
            connectionTime: Date.now(),
            details: status
        };
    } catch (error) {
        logger.error('Database health check failed:', error);
        return { status: 'unhealthy', error: error.message };
    }
};

/**
 * Safely executes a database operation with proper error handling and transaction management.
 * @param {string} query - The SQL query to execute
 * @param {Array} params - Parameters for the query
 * @param {string} operation - Description of the operation for logging
 * @returns {Promise<any>} Query result
 */
const safeDbOperation = async (query, params, operation) => {
    try {
        const dbInstance = await getDb();
        
        // Use circuit breaker for database operations
        return await databaseBreaker.execute(async () => {
            // Validate inputs to prevent SQL injection and malformed queries
            validateDbInputs(query, params);
            
            // Execute the query
            if (query.trim().toUpperCase().startsWith('SELECT') || 
                query.trim().toUpperCase().startsWith('PRAGMA')) {
                return await dbInstance.all(query, params);
            } else {
                return await dbInstance.run(query, params);
            }
        });
    } catch (error) {
        logger.error(`Database operation failed: ${operation}`, { error: error.message, query, params });
        throw error;
    }
};

/**
 * Safely executes a complex database operation with proper error handling
 * @param {Function} operationFn - Function that executes database operations
 * @param {string} operation - Description of the operation for logging
 * @returns {Promise<any>} Operation result
 */
const safeDbExecution = async (operationFn, operation) => {
    try {
        return await databaseBreaker.execute(operationFn);
    } catch (error) {
        logger.error(`Database execution failed: ${operation}`, { error: error.message });
        throw error;
    }
};

/**
 * Safely executes a database transaction with proper rollback handling.
 * @param {Function} transactionFn - Function that executes database operations
 * @param {string} operation - Description of the transaction for logging
 * @returns {Promise<any>} Transaction result
 */
const safeTransaction = async (transactionFn, operation) => {
    // Use a separate connection for transactions to avoid conflicts
    let dbInstance;
    try {
        dbInstance = await dbConnManager.createConnection();
        
        return await databaseBreaker.execute(async () => {
            await dbInstance.run('BEGIN IMMEDIATE');
            
            try {
                const result = await transactionFn(dbInstance);
                await dbInstance.run('COMMIT');
                return result;
            } catch (error) {
                await dbInstance.run('ROLLBACK');
                throw error;
            }
        });
    } catch (error) {
        console.error(`Transaction failed for ${operation}:`, error);
        
        // Enhanced fallback for transaction failures
        if (error.message?.includes('SQLITE_BUSY') || error.message?.includes('transaction')) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            // Retry once with a fresh connection
            try {
                if (dbInstance) await dbInstance.close();
                dbInstance = await dbConnManager.createConnection();
                
                await dbInstance.run('BEGIN IMMEDIATE');
                const result = await transactionFn(dbInstance);
                await dbInstance.run('COMMIT');
                return result;
            } catch (retryError) {
                await dbInstance?.run('ROLLBACK').catch(() => {});
                throw retryError;
            }
        }
        
        throw error;
    } finally {
        if (dbInstance) {
            try {
                await dbInstance.close();
            } catch (closeError) {
                console.warn('Error closing transaction connection:', closeError);
            }
        }
    }
};

/**
 * Validates database inputs to prevent SQL injection and malformed queries
 */
const validateDbInputs = (query, params) => {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid query: must be a non-empty string');
    }
    
    if (params !== undefined && !Array.isArray(params)) {
        throw new Error('Invalid params: must be an array or undefined');
    }
    
    // Basic SQL injection detection
    const dangerousPatterns = [
        /;\s*(drop|delete|truncate|update|insert|create|alter)\s+/i,
        /union\s+select/i,
        /exec\s*\(/i,
        /script\s*>/i
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(query)) {
            throw new Error('Potentially dangerous SQL detected');
        }
    }
    
    return true;
};

// --- Input Validation Helpers ---
const validateChatId = (chatId, allowInvalid = false) => {
    if (allowInvalid && (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number'))) {
        return null; // Allow invalid chatId for testing purposes
    }
    if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
        throw new Error('Invalid chatId: must be a non-empty string or number');
    }
    return chatId.toString();
};

const validateUserId = (userId) => {
    if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
        throw new Error('Invalid userId: must be a non-empty string or number');
    }
    return userId.toString();
};

const validateStrikeAmount = (amount) => {
    const num = parseInt(amount, 10);
    if (isNaN(num) || num < 0 || num > 1000) {
        throw new Error('Invalid strike amount: must be between 0 and 1000');
    }
    return num;
};

// --- User Management ---

export const upsertUser = async (user) => {
    if (!user || !user.id) return;
    
    return await safeDbOperation(
        `INSERT INTO users (userId, username, firstName, lastName) VALUES (?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
         username = excluded.username,
         firstName = excluded.firstName,
         lastName = excluded.lastName`,
        [user.id.toString(), user.username, user.first_name, user.last_name],
        'upsert user'
    );
};

export const findUserByUsernameInDb = async (username) => {
    if (!username) return null;
    
    const result = await safeDbOperation(
        'SELECT * FROM users WHERE username = ? COLLATE NOCASE',
        [username],
        'find user by username'
    );
    
    return result && result.length > 0 ? result[0] : null;
};

// --- Group Management ---

export const addGroup = async (chatId, chatTitle) => {
    const validatedChatId = validateChatId(chatId);
    
    return await safeDbOperation(
        'INSERT OR REPLACE INTO groups (chatId, chatTitle) VALUES (?, ?)',
        [validatedChatId, chatTitle],
        'add group'
    );
};

export const removeGroup = async (chatId) => {
    const validatedChatId = validateChatId(chatId);
    
    return await safeTransaction(async (db) => {
        // Remove group and all associated data
        await db.run('DELETE FROM strikes WHERE chatId = ?', validatedChatId);
        await db.run('DELETE FROM settings WHERE chatId = ?', validatedChatId);
        await db.run('DELETE FROM keyword_whitelist WHERE chatId = ?', validatedChatId);
        return await db.run('DELETE FROM groups WHERE chatId = ?', validatedChatId);
    }, 'remove group');
};

export const getAllGroups = async () => {
    const result = await safeDbOperation(
        'SELECT * FROM groups',
        [],
        'get all groups'
    );
    
    return result || [];
};

export const getGroup = async (chatId) => {
    const validatedChatId = validateChatId(chatId);
    
    const result = await safeDbOperation(
        'SELECT * FROM groups WHERE chatId = ?',
        [validatedChatId],
        'get group'
    );
    
    return result && result.length > 0 ? result[0] : null;
};

// --- Keyword Whitelist Logic ---

export const addWhitelistKeyword = async (chatId, keyword) => {
    const validatedChatId = validateChatId(chatId);
    
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
        throw new Error('Invalid keyword: must be a non-empty string');
    }
    
    return await safeDbOperation(
        'INSERT OR IGNORE INTO keyword_whitelist (chatId, keyword) VALUES (?, ?)',
        [validatedChatId, keyword.trim()],
        'add whitelist keyword'
    );
};

export const removeWhitelistKeyword = async (chatId, keyword) => {
    const validatedChatId = validateChatId(chatId);
    
    if (!keyword || typeof keyword !== 'string') {
        throw new Error('Invalid keyword: must be a non-empty string');
    }
    
    return await safeDbOperation(
        'DELETE FROM keyword_whitelist WHERE chatId = ? AND keyword = ?',
        [validatedChatId, keyword.trim()],
        'remove whitelist keyword'
    );
};

export const getWhitelistKeywords = async (chatId) => {
    const validatedChatId = validateChatId(chatId);
    
    const result = await safeDbOperation(
        'SELECT keyword FROM keyword_whitelist WHERE chatId = ?',
        [validatedChatId],
        'get whitelist keywords'
    );
    
    return result ? result.map(row => row.keyword) : [];
};


// --- Strike and Audit Logic ---

export const recordStrike = async (chatId, userId, logData) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    const cacheKey = CacheKeys.userStrikes(validatedChatId, validatedUserId);
    
    const result = await safeDbExecution(async () => {
        const db = await dbConnManager.getConnection();
        // Generate timestamp once to ensure consistency
        const timestamp = new Date().toISOString();
        
        // Update or insert the strike record
        await db.run(
            'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, 1, ?) ON CONFLICT(chatId, userId) DO UPDATE SET count = count + 1, timestamp = ?',
            validatedChatId,
            validatedUserId,
            timestamp,
            timestamp
        );
        
        // Insert audit log entry
        await db.run(
            'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
            logData.timestamp || timestamp,
            validatedChatId,
            validatedUserId,
            JSON.stringify(logData)
        );

        // Get the count within the same transaction context to ensure accuracy
        const result = await db.get('SELECT count FROM strikes WHERE chatId = ? AND userId = ?', 
            validatedChatId, validatedUserId);
        return result?.count || 1;
    }, 'record strike');
    
    // Invalidate cache
    await cache.delete(cacheKey);
    
    return result;
};

export const logManualAction = async (chatId, userId, logData) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    
    return await safeDbOperation(
        'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
        [new Date().toISOString(), validatedChatId, validatedUserId, JSON.stringify(logData)],
        'log manual action'
    );
};

export const getStrikes = async (chatId, userId) => {
    try {
        const validatedChatId = validateChatId(chatId);
        const validatedUserId = validateUserId(userId);
        const cacheKey = CacheKeys.userStrikes(validatedChatId, validatedUserId);
        
        // Try cache first
        let cachedValue = await cache.get(cacheKey);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
        
        await recalculateStrikes(validatedChatId, validatedUserId);
        
        const result = await safeDbOperation(
            'SELECT count, timestamp FROM strikes WHERE chatId = ? AND userId = ?',
            [validatedChatId, validatedUserId],
            'get strikes'
        );
        
        const strikes = result && result.length > 0 ? result[0] : { count: 0, timestamp: null };
        
        // Cache for 2 minutes
        await cache.set(cacheKey, strikes, 120000);
        
        return strikes;
    } catch (error) {
        // For invalid inputs, return default values gracefully
        console.warn('getStrikes: Invalid input, returning default:', error.message);
        return { count: 0, timestamp: null };
    }
};

export const resetStrikes = async (chatId, userId) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    const cacheKey = CacheKeys.userStrikes(validatedChatId, validatedUserId);
    
    const result = await safeDbOperation(
        'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, 0, NULL) ON CONFLICT(chatId, userId) DO UPDATE SET count = 0, timestamp = NULL',
        [validatedChatId, validatedUserId],
        'reset strikes'
    );
    
    // Invalidate cache
    await cache.delete(cacheKey);
    
    return result;
};

export const addStrikes = async (chatId, userId, amount) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    const validatedAmount = validateStrikeAmount(amount);
    const cacheKey = CacheKeys.userStrikes(validatedChatId, validatedUserId);
    
    const result = await safeDbExecution(async () => {
        const timestamp = new Date().toISOString();
        const db = await dbConnManager.getConnection();
        
        await db.run(
            'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(chatId, userId) DO UPDATE SET count = count + ?, timestamp = ?',
            validatedChatId, validatedUserId, validatedAmount, timestamp, validatedAmount, timestamp
        );
        
        // Return updated count
        const updated = await db.get('SELECT count FROM strikes WHERE chatId = ? AND userId = ?', 
            validatedChatId, validatedUserId);
        return updated?.count || validatedAmount;
    }, 'add strikes');
    
    // Invalidate cache
    await cache.delete(cacheKey);
    
    return result;
};

export const removeStrike = async (chatId, userId, amount) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    const validatedAmount = validateStrikeAmount(amount);
    const cacheKey = CacheKeys.userStrikes(validatedChatId, validatedUserId);
    
    if (validatedAmount === 0) return 0;
    
    const result = await safeDbExecution(async () => {
        const db = await dbConnManager.getConnection();
        
        // First ensure the record exists
        await db.run(
            'INSERT INTO strikes (chatId, userId, count, timestamp) VALUES (?, ?, 0, NULL) ON CONFLICT(chatId, userId) DO NOTHING',
            validatedChatId, validatedUserId
        );
        
        // Get current count
        const currentStrikes = await db.get('SELECT count FROM strikes WHERE chatId = ? AND userId = ?', 
            validatedChatId, validatedUserId);
        
        if (!currentStrikes || currentStrikes.count === 0) return 0;
        
        // Calculate new count
        const newCount = Math.max(0, currentStrikes.count - validatedAmount);
        
        // Update strikes
        await db.run('UPDATE strikes SET count = ?, timestamp = CASE WHEN ? > 0 THEN ? ELSE NULL END WHERE chatId = ? AND userId = ?', 
            newCount, newCount, new Date().toISOString(), validatedChatId, validatedUserId);
        
        return newCount;
    }, 'remove strikes');
    
    // Invalidate cache
    await cache.delete(cacheKey);
    
    return result;
};

export const setStrikes = async (chatId, userId, amount) => {
    const validatedChatId = validateChatId(chatId);
    const validatedUserId = validateUserId(userId);
    const validatedAmount = validateStrikeAmount(amount);
    
    await safeDbOperation(
        `INSERT INTO strikes (chatId, userId, count, timestamp)
         VALUES (?, ?, ?, CASE WHEN ? > 0 THEN ? ELSE NULL END)
         ON CONFLICT(chatId, userId) DO UPDATE SET count = excluded.count, timestamp = excluded.timestamp`,
        [validatedChatId, validatedUserId, validatedAmount, validatedAmount, new Date().toISOString()],
        'set strikes'
    );
    
    const result = await getStrikes(validatedChatId, validatedUserId);
    return result.count;
};

export const getTotalDeletionsToday = async (chatId) => {
    return safeDbExecution(async () => {
        const validatedChatId = validateChatId(chatId);
        const today = new Date().toISOString().split('T')[0];
        const result = await dbConnManager.getConnection().get(
            `SELECT COUNT(*) as count FROM audit_log WHERE chatId = ? AND date(timestamp) = ?`, 
            validatedChatId, 
            today
        );
        return result?.count || 0;
    }, 'getTotalDeletionsToday');
};

export const getAuditLog = async (chatId, limit = 15) => {
    return safeDbExecution(async () => {
        const validatedChatId = validateChatId(chatId);
        const validatedLimit = Math.max(1, Math.min(100, Number(limit) || 15));
        return await dbConnManager.getConnection().all(
            'SELECT * FROM audit_log WHERE chatId = ? ORDER BY timestamp DESC LIMIT ?', 
            validatedChatId, 
            validatedLimit
        );
    }, 'getAuditLog');
};

export const getStrikeHistory = async (chatId, userId, limit = 10) => {
    return safeDbExecution(async () => {
        const validatedChatId = validateChatId(chatId);
        const validatedUserId = validateUserId(userId);
        const validatedLimit = Math.max(1, Math.min(50, Number(limit) || 10));
        return await dbConnManager.getConnection().all(
            'SELECT * FROM audit_log WHERE chatId = ? AND userId = ? ORDER BY timestamp DESC LIMIT ?', 
            validatedChatId, 
            validatedUserId, 
            validatedLimit
        );
    }, 'getStrikeHistory');
};

// --- Settings Logic ---

export const getSetting = async (chatId, key, defaultValue) => {
    const validatedChatId = validateChatId(chatId);
    const cacheKey = CacheKeys.groupSettings(`${validatedChatId}:${key}`);
    
    // Try cache first
    let cachedValue = await cache.get(cacheKey);
    if (cachedValue !== undefined) {
        return cachedValue;
    }
    
    const result = await safeDbOperation(
        'SELECT value FROM settings WHERE chatId = ? AND key = ?',
        [validatedChatId, key],
        'get setting'
    );
    
    if (!result || result.length === 0) {
        return defaultValue;
    }
    
    try {
        const value = JSON.parse(result[0].value);
        // Cache the result for 5 minutes
        await cache.set(cacheKey, value, 300000);
        return value;
    } catch (error) {
        logger.error('Failed to parse setting value:', error);
        return defaultValue;
    }
};

export const setSetting = async (chatId, key, value) => {
    const validatedChatId = validateChatId(chatId);
    const cacheKey = CacheKeys.groupSettings(`${validatedChatId}:${key}`);
    
    const result = await safeDbOperation(
        'INSERT OR REPLACE INTO settings (chatId, key, value) VALUES (?, ?, ?)',
        [validatedChatId, key, JSON.stringify(value)],
        'set setting'
    );
    
    // Update cache
    await cache.set(cacheKey, value, 300000);
    
    return result;
};

export const recalculateStrikes = async (chatId, userId) => {
    return safeDbExecution(async () => {
        const validatedChatId = validateChatId(chatId);
        const validatedUserId = validateUserId(userId);
        
        const strikeExpirationDays = await getSetting(validatedChatId, 'strikeExpirationDays', 30);
        if (strikeExpirationDays > 0) {
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() - strikeExpirationDays);
            const result = await dbConnManager.getConnection().run(
                'DELETE FROM strikes WHERE chatId = ? AND userId = ? AND timestamp < ?', 
                validatedChatId, 
                validatedUserId, 
                expirationDate.toISOString()
            );
            return result;
        }
        return { changes: 0 };
    }, 'recalculateStrikes');
};

// --- WebApp Additional Functions ---

export const getUser = async (userId) => {
    return safeDbExecution(async () => {
        const validatedUserId = validateUserId(userId);
        return await dbConnManager.getConnection().get(
            'SELECT * FROM users WHERE userId = ?', 
            validatedUserId
        );
    }, 'getUser');
};

export const getUserAdminGroups = async (userId) => {
    // Import here to avoid circular dependencies
    const { getChatAdmins } = await import('./telegram.js');
    
    // Get all groups from database using our enhanced database operations
    const allGroups = await safeDbOperation(
        'SELECT * FROM groups ORDER BY chatTitle',
        [],
        'get all groups for admin check'
    );
    const userAdminGroups = [];

    // Check each group to see if user is an admin
    const { getChatMemberCount } = await import('./telegram.js');
    for (const group of allGroups || []) {
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
    const validatedGroupId = validateChatId(groupId);
    
    try {
        // Count scanned messages - current approach (temporary until counter table)
        const scannedMessagesResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ?
            AND JSON_EXTRACT(logData, '$.type') = 'SCANNED'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get scanned messages count');
        
        const scannedMessages = scannedMessagesResult && scannedMessagesResult.length > 0 
            ? scannedMessagesResult[0].count || 0 
            : 0;

        // Count flagged messages by violation type
        const spamMessagesResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.violationType') = 'SPAM'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get spam violations');

        const profanityMessagesResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.violationType') = 'PROFANITY'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get profanity violations');

        // Legacy compatibility: count old AUTO entries
        const legacyAutoEntriesResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get legacy auto entries');

        const spamCount = (spamMessagesResult && spamMessagesResult.length > 0 ? spamMessagesResult[0].count || 0 : 0) + 
                         (legacyAutoEntriesResult && legacyAutoEntriesResult.length > 0 ? legacyAutoEntriesResult[0].count || 0 : 0);
        const profanityCount = profanityMessagesResult && profanityMessagesResult.length > 0 ? profanityMessagesResult[0].count || 0 : 0;

        // Count deleted messages (new and legacy)
        const deletedMessagesNewResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'message_deleted'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get deleted messages new');

        const deletedMessagesLegacyResult = await safeDbOperation(`
            SELECT COUNT(*) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
            AND JSON_EXTRACT(logData, '$.action') = 'deleted'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get deleted messages legacy');

        const totalDeleted = (deletedMessagesNewResult && deletedMessagesNewResult.length > 0 ? deletedMessagesNewResult[0].count || 0 : 0) + 
                            (deletedMessagesLegacyResult && deletedMessagesLegacyResult.length > 0 ? deletedMessagesLegacyResult[0].count || 0 : 0);

        // Count unique users affected by penalties
        const mutedUsersResult = await safeDbOperation(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_muted'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get muted users');

        const kickedUsersResult = await safeDbOperation(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_kicked'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get kicked users');

        const bannedUsersResult = await safeDbOperation(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.action') = 'user_banned'
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get banned users');

        // Get average spam score from flagged messages
        const spamScoresResult = await safeDbOperation(`
            SELECT JSON_EXTRACT(logData, '$.spamScore') as score 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'VIOLATION'
            AND JSON_EXTRACT(logData, '$.spamScore') IS NOT NULL
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get spam scores');

        // Include legacy scores
        const legacyScoresResult = await safeDbOperation(`
            SELECT JSON_EXTRACT(logData, '$.classificationScore') as score 
            FROM audit_log 
            WHERE chatId = ? AND timestamp BETWEEN ? AND ? 
            AND JSON_EXTRACT(logData, '$.type') = 'AUTO'
            AND JSON_EXTRACT(logData, '$.classificationScore') IS NOT NULL
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get legacy scores');

        const spamScores = spamScoresResult || [];
        const legacyScores = legacyScoresResult || [];

        const allScores = [
            ...spamScores.map(row => parseFloat(row.score || 0)),
            ...legacyScores.map(row => parseFloat(row.score || 0))
        ].filter(score => score > 0);

        const avgSpamScore = allScores.length > 0 
            ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length 
            : 0;

        // Get top violation types
        const violationTypesResult = await safeDbOperation(`
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
        `, [validatedGroupId, startDate.toISOString(), endDate.toISOString()], 'get violation types');

        const violationTypes = violationTypesResult || [];

        // Add legacy types
        const legacyAutoCount = legacyAutoEntriesResult && legacyAutoEntriesResult.length > 0 ? legacyAutoEntriesResult[0].count || 0 : 0;
        if (legacyAutoCount > 0) {
            const existingSpam = violationTypes.find(v => v.type === 'SPAM');
            if (existingSpam) {
                existingSpam.count += legacyAutoCount;
            } else {
                violationTypes.push({ type: 'SPAM', count: legacyAutoCount });
            }
        }

        const totalScanned = scannedMessages;

        return {
            totalMessages: totalScanned,
            flaggedMessages: {
                total: spamCount + profanityCount,
                spam: spamCount,
                profanity: profanityCount
            },
            deletedMessages: totalDeleted,
            mutedUsers: mutedUsersResult && mutedUsersResult.length > 0 ? mutedUsersResult[0].count || 0 : 0,
            kickedUsers: kickedUsersResult && kickedUsersResult.length > 0 ? kickedUsersResult[0].count || 0 : 0,
            bannedUsers: bannedUsersResult && bannedUsersResult.length > 0 ? bannedUsersResult[0].count || 0 : 0,
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
                usersActioned: (mutedUsersResult && mutedUsersResult.length > 0 ? mutedUsersResult[0].count || 0 : 0) + 
                              (kickedUsersResult && kickedUsersResult.length > 0 ? kickedUsersResult[0].count || 0 : 0) + 
                              (bannedUsersResult && bannedUsersResult.length > 0 ? bannedUsersResult[0].count || 0 : 0)
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
        const result = await safeDbOperation(
            'SELECT COUNT(DISTINCT userId) as count FROM users',
            [],
            'get total users count'
        );
        
        return result && result.length > 0 ? result[0].count || 0 : 0;
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

// Export circuit breaker utilities for testing
export { resetAllCircuitBreakers };
