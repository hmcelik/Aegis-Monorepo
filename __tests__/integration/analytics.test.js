import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../apps/api/src/server.js';
import { createUsageRollupService } from '../../apps/worker/src/jobs/usageRollup.js';

// Mock the usage rollup service
vi.mock('../../apps/worker/src/jobs/usageRollup.js');
vi.mock('@telegram-moderator/shared/src/services/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Analytics API Endpoints', () => {
  let mockService;
  const mockToken = 'Bearer mock-jwt-token';

  beforeEach(() => {
    mockService = {
      getDailyRollups: vi.fn(),
      getAggregatedMetrics: vi.fn(),
      performDailyRollup: vi.fn(),
      cleanupOldMetrics: vi.fn(),
    };

    createUsageRollupService.mockReturnValue(mockService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/analytics/daily-usage', () => {
    it('should return daily usage rollups', async () => {
      const mockRollups = [
        {
          tenantId: 'tenant1',
          date: '2025-09-07',
          messagesProcessed: 100,
          aiCallsMade: 50,
          aiCost: 2.5,
          cacheHits: 30,
          cacheMisses: 20,
          avgProcessingTimeMs: 150,
        },
      ];

      mockService.getDailyRollups.mockResolvedValue(mockRollups);

      const response = await request(app)
        .get('/api/v1/analytics/daily-usage')
        .set('Authorization', mockToken)
        .query({
          startDate: '2025-09-01',
          endDate: '2025-09-07',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRollups);
      expect(response.body.metadata.count).toBe(1);
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/daily-usage')
        .set('Authorization', mockToken)
        .query({
          startDate: 'invalid-date',
          endDate: '2025-09-07',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/v1/analytics/daily-usage').query({
        startDate: '2025-09-01',
        endDate: '2025-09-07',
      });

      expect(response.status).toBe(401);
    });

    it('should handle service errors gracefully', async () => {
      mockService.getDailyRollups.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/analytics/daily-usage')
        .set('Authorization', mockToken)
        .query({
          startDate: '2025-09-01',
          endDate: '2025-09-07',
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to retrieve usage data');
    });
  });

  describe('GET /api/v1/analytics/metrics', () => {
    it('should return aggregated metrics', async () => {
      const mockMetrics = {
        totalMessages: 1000,
        totalAICalls: 500,
        totalCost: 25.0,
        cacheHitRate: 0.6,
        avgProcessingTime: 140,
      };

      mockService.getAggregatedMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', mockToken)
        .query({
          startDate: '2025-09-01',
          endDate: '2025-09-07',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockMetrics);
    });

    it('should validate date parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', mockToken)
        .query({
          startDate: '2025-09-01',
          // Missing endDate
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/analytics/rollup', () => {
    it('should trigger manual rollup for admin user', async () => {
      mockService.performDailyRollup.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/analytics/rollup')
        .set('Authorization', mockToken)
        .send({
          date: '2025-09-07',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockService.performDailyRollup).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/rollup')
        .set('Authorization', mockToken)
        .send({
          date: '2025-09-07',
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Insufficient permissions to trigger rollup');
    });

    it('should validate date format', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/rollup')
        .set('Authorization', mockToken)
        .send({
          date: 'invalid-date',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/analytics/cleanup', () => {
    it('should perform cleanup for admin user', async () => {
      mockService.cleanupOldMetrics.mockResolvedValue(150);

      const response = await request(app)
        .delete('/api/v1/analytics/cleanup')
        .set('Authorization', mockToken)
        .query({ retentionDays: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(150);
      expect(mockService.cleanupOldMetrics).toHaveBeenCalledWith(30);
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .delete('/api/v1/analytics/cleanup')
        .set('Authorization', mockToken);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Insufficient permissions to perform cleanup');
    });

    it('should validate retention days parameter', async () => {
      const response = await request(app)
        .delete('/api/v1/analytics/cleanup')
        .set('Authorization', mockToken)
        .query({ retentionDays: 500 }); // Invalid: > 365

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/analytics/overview', () => {
    it('should return usage overview with default period', async () => {
      const mockMetrics = {
        totalMessages: 1000,
        totalAICalls: 500,
        totalCost: 25.0,
        cacheHitRate: 0.6,
        avgProcessingTime: 140,
      };

      const mockRollups = [
        {
          tenantId: 'tenant1',
          date: '2025-09-07',
          messagesProcessed: 100,
          aiCallsMade: 50,
          aiCost: 2.5,
          cacheHits: 30,
          cacheMisses: 20,
          avgProcessingTimeMs: 150,
        },
      ];

      mockService.getAggregatedMetrics.mockResolvedValue(mockMetrics);
      mockService.getDailyRollups.mockResolvedValue(mockRollups);

      const response = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', mockToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary).toEqual(mockMetrics);
      expect(response.body.data.dailyBreakdown).toEqual(mockRollups);
      expect(response.body.data.period.type).toBe('month');
    });

    it('should support different period types', async () => {
      mockService.getAggregatedMetrics.mockResolvedValue({});
      mockService.getDailyRollups.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', mockToken)
        .query({ period: 'week' });

      expect(response.status).toBe(200);
      expect(response.body.data.period.type).toBe('week');
    });

    it('should validate period parameter', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', mockToken)
        .query({ period: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

describe('Analytics API Integration', () => {
  let mockService;
  const mockToken = 'Bearer mock-jwt-token';

  beforeEach(() => {
    mockService = {
      getDailyRollups: vi.fn(),
      getAggregatedMetrics: vi.fn(),
      performDailyRollup: vi.fn(),
      cleanupOldMetrics: vi.fn(),
    };

    createUsageRollupService.mockReturnValue(mockService);
  });

  it('should handle concurrent requests efficiently', async () => {
    mockService.getDailyRollups.mockResolvedValue([]);

    const requests = Array.from({ length: 10 }, () =>
      request(app).get('/api/v1/analytics/daily-usage').set('Authorization', mockToken).query({
        startDate: '2025-09-01',
        endDate: '2025-09-07',
      })
    );

    const responses = await Promise.all(requests);

    expect(responses.every(res => res.status === 200)).toBe(true);
    expect(mockService.getDailyRollups).toHaveBeenCalledTimes(10);
  });

  it('should maintain data consistency across related endpoints', async () => {
    const mockMetrics = {
      totalMessages: 1000,
      totalAICalls: 500,
      totalCost: 25.0,
      cacheHitRate: 0.6,
      avgProcessingTime: 140,
    };

    const mockRollups = [
      {
        tenantId: 'tenant1',
        date: '2025-09-07',
        messagesProcessed: 1000, // Should match totalMessages
        aiCallsMade: 500, // Should match totalAICalls
        aiCost: 25.0, // Should match totalCost
        cacheHits: 300,
        cacheMisses: 200, // Combined should give 0.6 hit rate
        avgProcessingTimeMs: 140,
      },
    ];

    mockService.getAggregatedMetrics.mockResolvedValue(mockMetrics);
    mockService.getDailyRollups.mockResolvedValue(mockRollups);

    const [metricsResponse, rollupsResponse] = await Promise.all([
      request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', mockToken)
        .query({ startDate: '2025-09-07', endDate: '2025-09-07' }),
      request(app)
        .get('/api/v1/analytics/daily-usage')
        .set('Authorization', mockToken)
        .query({ startDate: '2025-09-07', endDate: '2025-09-07' }),
    ]);

    expect(metricsResponse.status).toBe(200);
    expect(rollupsResponse.status).toBe(200);

    const metrics = metricsResponse.body.data;
    const rollups = rollupsResponse.body.data;

    // Verify data consistency
    expect(metrics.totalMessages).toBe(rollups[0].messagesProcessed);
    expect(metrics.totalAICalls).toBe(rollups[0].aiCallsMade);
    expect(metrics.totalCost).toBe(rollups[0].aiCost);
  });
});
