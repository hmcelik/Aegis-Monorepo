import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from 'apps/api/src/server.js';

// Mock the database service
vi.mock('@telegram-moderator/shared/src/services/database.js', () => ({
    Database: {
        getInstance: vi.fn(() => ({
            run: vi.fn(),
            get: vi.fn(),
            all: vi.fn(),
            close: vi.fn()
        }))
    }
}));

// Mock the NLP service
vi.mock('@telegram-moderator/shared/src/services/nlp.js', () => ({
    isPromotional: vi.fn().mockResolvedValue({
        isSpam: false,
        score: 0.2,
        reason: 'test'
    }),
    hasProfanity: vi.fn().mockResolvedValue({
        hasProfanity: false,
        severity: 0.1,
        type: 'clean'
    }),
    analyzeMessage: vi.fn().mockResolvedValue({
        spam: { isSpam: false, score: 0.2, reason: 'test' },
        profanity: { hasProfanity: false, severity: 0.1, type: 'clean' }
    })
}));

// Mock JWT verification middleware to allow requests
vi.mock('apps/api/src/middleware/checkJwt.js', () => ({
    checkJwt: vi.fn((req, res, next) => {
        // Check if Authorization header is present
        if (!req.headers.authorization) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user = { id: 12345 };
        next();
    })
}));

describe('NLP API Endpoints', () => {
    let validToken;

    beforeAll(() => {
        // Mock a valid JWT token for tests
        validToken = 'Bearer mock-jwt-token';
    });

    describe('GET /api/v1/nlp/status', () => {
        it('should return NLP service status', async () => {
            const response = await request(app)
                .get('/api/v1/nlp/status')
                .set('Authorization', validToken)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('status');
            expect(response.body.status).toHaveProperty('service', 'NLP Processing Service');
            expect(response.body.status).toHaveProperty('model', 'gpt-4o-mini');
            expect(response.body.status).toHaveProperty('features');
        });
    });

    describe('POST /api/v1/nlp/test/spam', () => {
        it('should test spam detection successfully', async () => {
            const testData = {
                text: 'Check out this amazing new crypto project!',
                whitelistedKeywords: ['crypto']
            };

            const response = await request(app)
                .post('/api/v1/nlp/test/spam')
                .set('Authorization', validToken)
                .send(testData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('analysis');
            expect(response.body.analysis).toHaveProperty('isSpam');
            expect(response.body.analysis).toHaveProperty('score');
            expect(response.body).toHaveProperty('input');
        });

        it('should reject invalid input', async () => {
            const response = await request(app)
                .post('/api/v1/nlp/test/spam')
                .set('Authorization', validToken)
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('errors');
        });
    });

    describe('POST /api/v1/nlp/test/profanity', () => {
        it('should test profanity detection successfully', async () => {
            const testData = {
                text: 'This is a clean message'
            };

            const response = await request(app)
                .post('/api/v1/nlp/test/profanity')
                .set('Authorization', validToken)
                .send(testData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('analysis');
            expect(response.body.analysis).toHaveProperty('hasProfanity');
            expect(response.body.analysis).toHaveProperty('severity');
            expect(response.body).toHaveProperty('input');
        });
    });

    describe('POST /api/v1/nlp/analyze', () => {
        it('should perform complete message analysis', async () => {
            const testData = {
                text: 'Test message for analysis',
                whitelistedKeywords: ['test'],
                groupId: 'test-group'
            };

            const response = await request(app)
                .post('/api/v1/nlp/analyze')
                .set('Authorization', validToken)
                .send(testData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('analysis');
            expect(response.body.analysis).toHaveProperty('spam');
            expect(response.body.analysis).toHaveProperty('profanity');
            expect(response.body).toHaveProperty('input');
        });

        it('should handle text that is too long', async () => {
            const longText = 'a'.repeat(5000); // Exceeds 4000 character limit

            const response = await request(app)
                .post('/api/v1/nlp/analyze')
                .set('Authorization', validToken)
                .send({ text: longText })
                .expect(400);

            expect(response.body).toHaveProperty('errors');
        });
    });

    describe('Authentication', () => {
        it('should require authentication for all endpoints', async () => {
            await request(app)
                .get('/api/v1/nlp/status')
                .expect(401);

            await request(app)
                .post('/api/v1/nlp/test/spam')
                .send({ text: 'test' })
                .expect(401);

            await request(app)
                .post('/api/v1/nlp/test/profanity')
                .send({ text: 'test' })
                .expect(401);

            await request(app)
                .post('/api/v1/nlp/analyze')
                .send({ text: 'test' })
                .expect(401);
        });
    });
});
