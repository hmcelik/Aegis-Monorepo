import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import groupRoutes from 'apps/api/src/routes/groups.js';
import * as db from '@telegram-moderator/shared/src/services/database.js';

// Mock the database
vi.mock('@telegram-moderator/shared/src/services/database.js');

// Mock the middleware
vi.mock('apps/api/src/middleware/checkJwt.js', () => ({
    checkJwt: (req, res, next) => {
        req.user = {
            id: '123456789',
            first_name: 'Test',
            username: 'testuser'
        };
        next();
    }
}));

vi.mock('apps/api/src/middleware/checkGroupAdmin.js', () => ({
    checkGroupAdmin: (req, res, next) => next()
}));

describe('Audit Log API', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/groups', groupRoutes);
        
        // Reset all mocks
        vi.clearAllMocks();
    });

    describe('GET /api/v1/groups/:groupId/audit', () => {
        it('should get paginated audit log entries', async () => {
            const mockTotalResult = { total: 100 };
            const mockResults = [
                {
                    id: 1,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    chatId: 'test-group',
                    userId: 'user1',
                    logData: JSON.stringify({
                        type: 'MANUAL-STRIKE-ADD',
                        amount: 2,
                        reason: 'Spam',
                        admin: { id: '123', first_name: 'Admin', username: 'admin' }
                    })
                },
                {
                    id: 2,
                    timestamp: '2023-01-01T01:00:00.000Z',
                    chatId: 'test-group',
                    userId: 'user2',
                    logData: JSON.stringify({
                        violationType: 'SPAM',
                        messageExcerpt: 'Spam message',
                        classificationScore: 0.95
                    })
                }
            ];

            db.getDb.mockReturnValue({
                get: vi.fn()
                    .mockResolvedValueOnce(mockTotalResult)
                    .mockResolvedValueOnce(mockTotalResult),
                all: vi.fn().mockResolvedValue(mockResults)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit?page=1&limit=50')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.pagination).toEqual({
                page: 1,
                limit: 50,
                total: 100,
                totalPages: 2,
                hasNext: true,
                hasPrev: false
            });

            // Check first entry (manual action)
            expect(response.body.data[0]).toMatchObject({
                id: 1,
                type: 'MANUAL-STRIKE-ADD',
                action: 'Added 2 strike(s)',
                details: {
                    reason: 'Spam',
                    amount: 2,
                    admin: {
                        id: '123',
                        firstName: 'Admin',
                        username: 'admin'
                    }
                }
            });

            // Check second entry (auto action)
            expect(response.body.data[1]).toMatchObject({
                id: 2,
                type: 'AUTO',
                action: 'Auto-strike',
                details: {
                    violationType: 'SPAM',
                    reason: 'Spam message',
                    classificationScore: 0.95
                }
            });
        });

        it('should filter by user ID', async () => {
            const mockTotalResult = { total: 10 };
            const mockResults = [
                {
                    id: 1,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    chatId: 'test-group',
                    userId: 'specific-user',
                    logData: JSON.stringify({
                        type: 'MANUAL-STRIKE-ADD',
                        amount: 1,
                        reason: 'Test'
                    })
                }
            ];

            const mockDbGet = vi.fn().mockResolvedValue(mockTotalResult);
            const mockDbAll = vi.fn().mockResolvedValue(mockResults);

            db.getDb.mockReturnValue({
                get: mockDbGet,
                all: mockDbAll
            });

            await request(app)
                .get('/api/v1/groups/test-group/audit?userId=specific-user')
                .expect(200);

            // Check that the query included userId filter
            expect(mockDbGet).toHaveBeenCalledWith(
                expect.stringContaining('userId = ?'),
                expect.arrayContaining(['test-group', 'specific-user'])
            );
        });

        it('should filter by type AUTO', async () => {
            const mockTotalResult = { total: 5 };
            const mockResults = [];

            const mockDbGet = vi.fn().mockResolvedValue(mockTotalResult);
            const mockDbAll = vi.fn().mockResolvedValue(mockResults);

            db.getDb.mockReturnValue({
                get: mockDbGet,
                all: mockDbAll
            });

            await request(app)
                .get('/api/v1/groups/test-group/audit?type=AUTO')
                .expect(200);

            // Check that the query filters for AUTO type
            expect(mockDbGet).toHaveBeenCalledWith(
                expect.stringContaining('JSON_EXTRACT(logData, "$.type") IS NULL OR JSON_EXTRACT(logData, "$.type") NOT LIKE "MANUAL%"'),
                expect.arrayContaining(['test-group'])
            );
        });

        it('should filter by manual strike type', async () => {
            const mockTotalResult = { total: 15 };
            const mockResults = [];

            const mockDbGet = vi.fn().mockResolvedValue(mockTotalResult);
            const mockDbAll = vi.fn().mockResolvedValue(mockResults);

            db.getDb.mockReturnValue({
                get: mockDbGet,
                all: mockDbAll
            });

            await request(app)
                .get('/api/v1/groups/test-group/audit?type=MANUAL-STRIKE-ADD')
                .expect(200);

            // Check that the query filters for specific manual type
            expect(mockDbGet).toHaveBeenCalledWith(
                expect.stringContaining('JSON_EXTRACT(logData, "$.type") = ?'),
                expect.arrayContaining(['test-group', 'MANUAL-STRIKE-ADD'])
            );
        });

        it('should validate page and limit parameters', async () => {
            const mockTotalResult = { total: 100 };
            const mockResults = [];

            db.getDb.mockReturnValue({
                get: vi.fn().mockResolvedValue(mockTotalResult),
                all: vi.fn().mockResolvedValue(mockResults)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit?page=2&limit=25')
                .expect(200);

            expect(response.body.pagination.page).toBe(2);
            expect(response.body.pagination.limit).toBe(25);
        });

        it('should enforce maximum limit of 200', async () => {
            const response = await request(app)
                .get('/api/v1/groups/test-group/audit?limit=500')
                .expect(400);

            // Should reject limits over 200
            expect(response.body).toHaveProperty('errors');
            expect(response.body.errors[0]).toHaveProperty('msg');
        });
    });

    describe('GET /api/v1/groups/:groupId/audit/export', () => {
        const mockAuditData = [
            {
                id: 1,
                timestamp: '2023-01-01T00:00:00.000Z',
                chatId: 'test-group',
                userId: 'user1',
                logData: JSON.stringify({
                    type: 'MANUAL-STRIKE-ADD',
                    amount: 2,
                    reason: 'Spam violation',
                    admin: { id: '123', first_name: 'Admin User', username: 'admin' }
                })
            },
            {
                id: 2,
                timestamp: '2023-01-01T01:00:00.000Z',
                chatId: 'test-group',
                userId: 'user2',
                logData: JSON.stringify({
                    violationType: 'PROFANITY',
                    messageExcerpt: 'Bad words here',
                    classificationScore: 0.88,
                    spamScore: 0.12,
                    profanityScore: 0.95
                })
            }
        ];

        it('should export audit log as CSV', async () => {
            db.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue(mockAuditData)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit/export?format=csv')
                .expect(200);

            expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
            expect(response.headers['content-disposition']).toMatch(/attachment; filename="audit_log_test-group_/);
            
            const csvContent = response.text;
            expect(csvContent).toContain('ID,Timestamp,Chat ID,User ID,Type,Action');
            expect(csvContent).toContain('1,2023-01-01T00:00:00.000Z,test-group,user1,MANUAL-STRIKE-ADD,Added 2 strike(s)');
            expect(csvContent).toContain('2,2023-01-01T01:00:00.000Z,test-group,user2,AUTO,Auto-strike');
        });

        it('should export audit log as JSON', async () => {
            db.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue(mockAuditData)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit/export?format=json')
                .expect(200);

            expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
            expect(response.headers['content-disposition']).toMatch(/attachment; filename="audit_log_test-group_/);
            
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2);
            
            expect(response.body[0]).toMatchObject({
                id: 1,
                type: 'MANUAL-STRIKE-ADD',
                action: 'Added 2 strike(s)',
                reason: 'Spam violation',
                adminId: '123',
                adminName: 'Admin User',
                adminUsername: 'admin'
            });
        });

        it('should handle CSV special characters properly', async () => {
            const dataWithSpecialChars = [
                {
                    id: 1,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    chatId: 'test-group',
                    userId: 'user1',
                    logData: JSON.stringify({
                        reason: 'Message with "quotes" and, commas\nand newlines'
                    })
                }
            ];

            db.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue(dataWithSpecialChars)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit/export?format=csv')
                .expect(200);

            const csvContent = response.text;
            // Should properly escape the complex string
            expect(csvContent).toContain('"Message with ""quotes"" and, commas\nand newlines"');
        });

        it('should reject invalid format', async () => {
            const response = await request(app)
                .get('/api/v1/groups/test-group/audit/export?format=xml')
                .expect(400);

            expect(response.body).toHaveProperty('errors');
        });

        it('should apply filters in export', async () => {
            const mockDbAll = vi.fn().mockResolvedValue([]);

            db.getDb.mockReturnValue({
                all: mockDbAll
            });

            await request(app)
                .get('/api/v1/groups/test-group/audit/export?userId=specific-user&type=MANUAL-STRIKE-ADD')
                .expect(200);

            // Check that filters were applied
            expect(mockDbAll).toHaveBeenCalledWith(
                expect.stringContaining('userId = ?'),
                expect.arrayContaining(['test-group', 'specific-user', 'MANUAL-STRIKE-ADD'])
            );
        });

        it('should handle parse errors gracefully', async () => {
            const dataWithParseError = [
                {
                    id: 1,
                    timestamp: '2023-01-01T00:00:00.000Z',
                    chatId: 'test-group',
                    userId: 'user1',
                    logData: 'invalid json'
                }
            ];

            db.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue(dataWithParseError)
            });

            const response = await request(app)
                .get('/api/v1/groups/test-group/audit/export?format=json')
                .expect(200);

            expect(response.body[0]).toMatchObject({
                id: 1,
                type: 'UNKNOWN',
                action: 'Parse error',
                error: 'Failed to parse log data'
            });
        });
    });
});
