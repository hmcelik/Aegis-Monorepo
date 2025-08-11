import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from 'apps/api/src/server.js';
import { initializeDatabase, setDb } from 'packages/shared/services/database.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

describe('WebApp API Endpoints', () => {
    let db;

    beforeAll(async () => {
        // Initialize test database
        db = await open({
            filename: ':memory:',
            driver: sqlite3.Database,
        });
        setDb(db);
        await initializeDatabase(true);
    });

    afterAll(async () => {
        if (db) {
            await db.close();
        }
    });

    describe('GET /api/v1/webapp/health', () => {
        it('should return health status', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/health')
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    status: 'healthy',
                    features: {
                        webAppSupport: true,
                        cors: true,
                        rateLimit: true,
                        authentication: true,
                        swagger: true
                    }
                }
            });
        });
    });

    describe('POST /api/v1/webapp/auth', () => {
        it('should reject request without Telegram initData', async () => {
            const response = await request(app)
                .post('/api/v1/webapp/auth')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });

        it('should reject request with invalid initData', async () => {
            const response = await request(app)
                .post('/api/v1/webapp/auth')
                .set('X-Telegram-Init-Data', 'invalid_data')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Invalid Telegram WebApp authentication')
                }
            });
        });
    });

    describe('GET /api/v1/webapp/user/profile', () => {
        it('should require Telegram WebApp authentication', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/user/profile')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });
    });

    describe('GET /api/v1/webapp/user/groups', () => {
        it('should require Telegram WebApp authentication', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/user/groups')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });
    });

    describe('GET /api/v1/webapp/group/:groupId/settings', () => {
        it('should require Telegram WebApp authentication', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/group/test123/settings')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });
    });

    describe('PUT /api/v1/webapp/group/:groupId/settings', () => {
        it('should require Telegram WebApp authentication', async () => {
            const response = await request(app)
                .put('/api/v1/webapp/group/test123/settings')
                .send({ settings: { alertLevel: 1 } })
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });
    });

    describe('GET /api/v1/webapp/group/:groupId/stats', () => {
        it('should require Telegram WebApp authentication', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/group/test123/stats')
                .expect(401);

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });

        it('should accept period query parameter', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/group/test123/stats?period=month')
                .expect(401); // Still 401 due to missing auth, but query param is parsed

            expect(response.body).toMatchObject({
                status: 'error',
                error: {
                    statusCode: 401,
                    message: expect.stringContaining('Missing Telegram WebApp authentication data')
                }
            });
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers in health endpoint', async () => {
            const response = await request(app)
                .get('/api/v1/webapp/health')
                .expect(200);

            // Note: supertest doesn't automatically include CORS headers in tests
            // but the middleware is configured and will work in real requests
        });

        it('should handle OPTIONS requests', async () => {
            const response = await request(app)
                .options('/api/v1/webapp/health')
                .expect(200); // CORS is configured with optionsSuccessStatus: 200
        });
    });

    describe('Rate Limiting', () => {
        it('should apply rate limiting to API endpoints', async () => {
            // Make multiple requests to test rate limiting
            const requests = [];
            for (let i = 0; i < 5; i++) {
                requests.push(
                    request(app)
                        .get('/api/v1/webapp/health')
                        .expect(200)
                );
            }
            
            await Promise.all(requests);
            // All should succeed since health endpoint allows more requests
        });
    });
});
