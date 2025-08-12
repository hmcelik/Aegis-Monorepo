/**
 * @fileoverview Tests for enhanced database analytics functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import * as db from '@telegram-moderator/shared/services/database.js';

describe('Enhanced Database Analytics', () => {
    let testDb;
    const testGroupId = '-1001234567890';
    const testUserId = '123456789';
    const testUserId2 = '987654321';

    beforeEach(async () => {
        // Create in-memory database for testing
        testDb = await open({
            filename: ':memory:',
            driver: sqlite3.Database
        });

        // Inject test database
        db.setDb(testDb);

        // Create tables explicitly for testing
        await testDb.exec(`
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

        // Insert test data
        await setupTestData();
    });

    afterEach(async () => {
        if (testDb) {
            await testDb.close();
        }
    });

    async function setupTestData() {
        // Insert test users
        await testDb.run(
            'INSERT INTO users (userId, username, firstName, lastName) VALUES (?, ?, ?, ?)',
            testUserId, 'testuser1', 'Test', 'User1'
        );
        await testDb.run(
            'INSERT INTO users (userId, username, firstName, lastName) VALUES (?, ?, ?, ?)',
            testUserId2, 'testuser2', 'Test', 'User2'
        );

        // Insert test group
        await testDb.run(
            'INSERT INTO groups (chatId, chatTitle) VALUES (?, ?)',
            testGroupId, 'Test Group'
        );

        // Insert test audit log entries with enhanced logging format
        const baseTime = new Date('2025-08-01T10:00:00Z');
        
        // Scanned messages (new format)
        for (let i = 0; i < 10; i++) {
            const timestamp = new Date(baseTime.getTime() + i * 60000).toISOString();
            await testDb.run(
                'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
                timestamp,
                testGroupId,
                i % 2 === 0 ? testUserId : testUserId2,
                JSON.stringify({
                    type: 'SCANNED',
                    action: 'message_analyzed',
                    timestamp,
                    user: { id: i % 2 === 0 ? testUserId : testUserId2 },
                    messageExcerpt: `Test message ${i}`,
                    spamScore: 0.2 + (i * 0.05),
                    profanityScore: 0.1,
                    profanityType: 'none',
                    messageLength: 20 + i
                })
            );
        }

        // Violation entries (new format)
        for (let i = 0; i < 3; i++) {
            const timestamp = new Date(baseTime.getTime() + (i + 20) * 60000).toISOString();
            const violationType = i % 2 === 0 ? 'SPAM' : 'PROFANITY';
            
            await testDb.run(
                'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
                timestamp,
                testGroupId,
                testUserId,
                JSON.stringify({
                    type: 'VIOLATION',
                    action: 'message_deleted',
                    timestamp,
                    user: { id: testUserId },
                    messageExcerpt: `Violating message ${i}`,
                    reason: 'Violation detected',
                    violationType,
                    spamScore: violationType === 'SPAM' ? 0.8 + (i * 0.05) : 0.3,
                    profanityScore: violationType === 'PROFANITY' ? 0.9 : 0.1,
                    profanityType: violationType === 'PROFANITY' ? 'mild' : 'none',
                    messageLength: 50 + i,
                    thresholdExceeded: violationType === 'SPAM' ? 0.7 : 0.8
                })
            );
        }

        // Penalty entries (new format)
        const penaltyActions = ['user_muted', 'user_kicked', 'user_banned'];
        for (let i = 0; i < 3; i++) {
            const timestamp = new Date(baseTime.getTime() + (i + 30) * 60000).toISOString();
            
            await testDb.run(
                'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
                timestamp,
                testGroupId,
                testUserId,
                JSON.stringify({
                    type: 'PENALTY',
                    action: penaltyActions[i],
                    timestamp,
                    user: { id: testUserId },
                    strikeCount: i + 1,
                    reason: 'Strike limit reached',
                    violationType: 'SPAM',
                    executedBy: 'AUTO_MODERATOR',
                    severity: i === 0 ? 'LOW' : i === 1 ? 'MEDIUM' : 'HIGH'
                })
            );
        }

        // Add some legacy format entries for backward compatibility testing
        await testDb.run(
            'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
            new Date(baseTime.getTime() + 40 * 60000).toISOString(),
            testGroupId,
            testUserId2,
            JSON.stringify({
                type: 'AUTO',
                action: 'deleted',
                timestamp: new Date(baseTime.getTime() + 40 * 60000).toISOString(),
                user: { id: testUserId2 },
                messageExcerpt: 'Legacy spam message',
                classificationScore: 0.85,
                violationType: 'SPAM'
            })
        );

        // Add second legacy AUTO entry to match test expectations
        await testDb.run(
            'INSERT INTO audit_log (timestamp, chatId, userId, logData) VALUES (?, ?, ?, ?)',
            new Date(baseTime.getTime() + 41 * 60000).toISOString(),
            testGroupId,
            testUserId,
            JSON.stringify({
                type: 'AUTO',
                action: 'deleted',
                timestamp: new Date(baseTime.getTime() + 41 * 60000).toISOString(),
                user: { id: testUserId },
                messageExcerpt: 'Another legacy spam message',
                classificationScore: 0.92
            })
        );
    }

    describe('getGroupStats', () => {
        it('should return comprehensive statistics with new logging format', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const stats = await db.getGroupStats(testGroupId, startDate, endDate);

            expect(stats).toMatchObject({
                totalMessages: 10, // 10 SCANNED entries
                flaggedMessages: {
                    total: 5, // 3 VIOLATION + 2 legacy AUTO
                    spam: 4, // 2 SPAM violations + 2 legacy AUTO entries (counted as spam)
                    profanity: 1 // 1 PROFANITY violation
                },
                deletedMessages: 5, // 3 VIOLATION + 2 legacy
                mutedUsers: 1,
                kickedUsers: 1,
                bannedUsers: 1,
                averageSpamScore: expect.any(Number),
                topViolationTypes: expect.arrayContaining([
                    expect.objectContaining({ type: 'SPAM' })
                ]),
                flaggedRate: expect.any(Number),
                autoModerationEfficiency: {
                    messagesScanned: 10,
                    violationsDetected: 5, // 3 VIOLATION + 2 legacy AUTO
                    usersActioned: 3
                }
            });

            // Check that average spam score is calculated correctly
            expect(stats.averageSpamScore).toBeGreaterThan(0.5);
            expect(stats.averageSpamScore).toBeLessThan(1);

            // Check flagged rate calculation
            expect(stats.flaggedRate).toBe(50); // 5 flagged out of 10 total = 50%
        });

        it('should handle backward compatibility with old format', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const stats = await db.getGroupStats(testGroupId, startDate, endDate);

            // Should include both new and old format entries
            expect(stats.flaggedMessages.spam).toBeGreaterThanOrEqual(2);
            expect(stats.deletedMessages).toBeGreaterThanOrEqual(1);
        });

        it('should return zero stats for empty date range', async () => {
            const startDate = new Date('2025-07-01T00:00:00Z');
            const endDate = new Date('2025-07-01T01:00:00Z');

            const stats = await db.getGroupStats(testGroupId, startDate, endDate);

            expect(stats.totalMessages).toBe(0);
            expect(stats.flaggedMessages.total).toBe(0);
            expect(stats.deletedMessages).toBe(0);
        });
    });

    describe('getUserActivityStats', () => {
        it('should return user activity statistics', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const userStats = await db.getUserActivityStats(testGroupId, startDate, endDate, 10);

            expect(userStats).toHaveLength(2);
            expect(userStats[0]).toMatchObject({
                userId: expect.any(String),
                username: expect.any(String),
                firstName: expect.any(String),
                lastName: expect.any(String),
                messages_sent: expect.any(Number),
                violations: expect.any(Number),
                penalties: expect.any(Number)
            });

            // Users should be ordered by violations descending
            if (userStats.length > 1) {
                expect(userStats[0].violations).toBeGreaterThanOrEqual(userStats[1].violations);
            }
        });

        it('should respect the limit parameter', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const userStats = await db.getUserActivityStats(testGroupId, startDate, endDate, 1);

            expect(userStats).toHaveLength(1);
        });
    });

    describe('getActivityPatterns', () => {
        it('should return hourly and daily activity patterns', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const patterns = await db.getActivityPatterns(testGroupId, startDate, endDate);

            expect(patterns).toHaveProperty('hourlyDistribution');
            expect(patterns).toHaveProperty('dailyActivity');
            expect(Array.isArray(patterns.hourlyDistribution)).toBe(true);
            expect(Array.isArray(patterns.dailyActivity)).toBe(true);

            if (patterns.hourlyDistribution.length > 0) {
                expect(patterns.hourlyDistribution[0]).toMatchObject({
                    hour: expect.any(String),
                    messages: expect.any(Number),
                    violations: expect.any(Number)
                });
            }

            if (patterns.dailyActivity.length > 0) {
                expect(patterns.dailyActivity[0]).toMatchObject({
                    date: expect.any(String),
                    messages: expect.any(Number),
                    violations: expect.any(Number)
                });
            }
        });
    });

    describe('getModerationEffectiveness', () => {
        it('should calculate moderation effectiveness metrics', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const effectiveness = await db.getModerationEffectiveness(testGroupId, startDate, endDate);

            expect(effectiveness).toMatchObject({
                averageResponseTimeSeconds: expect.any(Number),
                responseTimeDistribution: expect.any(Array),
                repeatOffenders: expect.any(Array),
                totalRepeatOffenders: expect.any(Number),
                effectivenessScore: expect.any(Number)
            });

            // Effectiveness score should be between 0 and 100
            expect(effectiveness.effectivenessScore).toBeGreaterThanOrEqual(0);
            expect(effectiveness.effectivenessScore).toBeLessThanOrEqual(100);
        });

        it('should identify repeat offenders correctly', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            const effectiveness = await db.getModerationEffectiveness(testGroupId, startDate, endDate);

            if (effectiveness.repeatOffenders.length > 0) {
                expect(effectiveness.repeatOffenders[0]).toMatchObject({
                    userId: expect.any(String),
                    total_violations: expect.any(Number),
                    active_days: expect.any(Number),
                    avg_violation_score: expect.any(Number)
                });

                // Should only include users with more than 1 violation
                expect(effectiveness.repeatOffenders[0].total_violations).toBeGreaterThan(1);
            }
        });
    });

    describe('getTopGroupsByDeletions', () => {
        it('should return groups ordered by deletion count', async () => {
            const topGroups = await db.getTopGroupsByDeletions(5);

            expect(Array.isArray(topGroups)).toBe(true);
            
            if (topGroups.length > 0) {
                expect(topGroups[0]).toMatchObject({
                    chatId: expect.any(String),
                    chatTitle: expect.any(String),
                    deletions: expect.any(Number)
                });

                // Should include our test group
                const testGroup = topGroups.find(g => g.chatId === testGroupId);
                expect(testGroup).toBeTruthy();
                expect(testGroup.deletions).toBeGreaterThan(0);
            }
        });
    });

    describe('Enhanced logging integration', () => {
        it('should log manual actions with new format', async () => {
            const logData = {
                type: 'PENALTY',
                action: 'user_muted',
                timestamp: new Date().toISOString(),
                user: { id: testUserId },
                strikeCount: 1,
                reason: 'Manual action',
                violationType: 'SPAM',
                executedBy: 'ADMIN',
                severity: 'LOW'
            };

            await db.logManualAction(testGroupId, testUserId, logData);

            // Verify the log was inserted
            const logs = await testDb.all(
                'SELECT * FROM audit_log WHERE chatId = ? AND userId = ? ORDER BY timestamp DESC LIMIT 1',
                testGroupId, testUserId
            );

            expect(logs).toHaveLength(1);
            const parsedLogData = JSON.parse(logs[0].logData);
            expect(parsedLogData).toMatchObject({
                type: 'PENALTY',
                action: 'user_muted',
                executedBy: 'ADMIN'
            });
        });

        it('should handle mixed old and new format data in queries', async () => {
            const startDate = new Date('2025-08-01T09:00:00Z');
            const endDate = new Date('2025-08-01T12:00:00Z');

            // This should work with both old AUTO entries and new VIOLATION entries
            const stats = await db.getGroupStats(testGroupId, startDate, endDate);

            expect(stats.flaggedMessages.total).toBeGreaterThan(0);
            expect(stats.topViolationTypes.length).toBeGreaterThanOrEqual(1);
        });
    });
});
