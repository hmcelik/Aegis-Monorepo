import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database first
const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  exec: vi.fn(),
};

const mockDatabaseManager = vi.fn(() => mockDb);

// Mock the shared modules
vi.mock('@telegram-moderator/shared/src/db/index', () => ({
  DatabaseManager: mockDatabaseManager,
}));

vi.mock('@telegram-moderator/shared/src/services/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Now import the modules after mocking - fix import path
const { UsageRollupService, createUsageRollupService, runDailyRollup } = await import(
  '../../apps/worker/src/jobs/usageRollup.ts'
);

describe('UsageRollupService', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsageRollupService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('performDailyRollup', () => {
    it('should process rollup for all tenants', async () => {
      const mockTenants = [{ id: 'tenant1' }, { id: 'tenant2' }];

      const mockUsageData = {
        tenant_id: 'tenant1',
        messages_processed: 100,
        ai_calls_made: 50,
        ai_cost: 2.5,
        cache_hits: 30,
        cache_misses: 20,
        avg_processing_time_ms: 150,
      };

      // Mock database responses
      mockDb.all.mockResolvedValue(mockTenants);
      mockDb.get
        .mockResolvedValueOnce({ count: 10 }) // Has data for tenant1
        .mockResolvedValueOnce(mockUsageData) // Usage data for tenant1
        .mockResolvedValueOnce({ count: 0 }); // No data for tenant2

      mockDb.run.mockResolvedValue({ changes: 1 });

      const targetDate = new Date('2025-09-08');
      await service.performDailyRollup(targetDate);

      // Verify tenant query
      expect(mockDb.all).toHaveBeenCalledWith('SELECT id FROM tenants WHERE is_active = 1');

      // Verify usage data was processed for tenant1
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO daily_usage_rollups'),
        expect.arrayContaining(['tenant1', '2025-09-07', 100, 50, 2.5, 30, 20, 150])
      );
    });

    it('should handle database errors gracefully', async () => {
      mockDb.all.mockRejectedValue(new Error('Database connection failed'));

      const targetDate = new Date('2025-09-08');
      await expect(service.performDailyRollup(targetDate)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should skip tenants with no data', async () => {
      const mockTenants = [{ id: 'tenant1' }];

      mockDb.all.mockResolvedValue(mockTenants);
      mockDb.get.mockResolvedValue({ count: 0 }); // No data

      const targetDate = new Date('2025-09-08');
      await service.performDailyRollup(targetDate);

      // Should not attempt to insert rollup data
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO daily_usage_rollups'),
        expect.any(Array)
      );
    });
  });

  describe('getDailyRollups', () => {
    it('should return rollup data for specified period', async () => {
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

      mockDb.all.mockResolvedValue(mockRollups);

      const result = await service.getDailyRollups('tenant1', '2025-09-01', '2025-09-07');

      expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('FROM daily_usage_rollups'), [
        'tenant1',
        '2025-09-01',
        '2025-09-07',
      ]);
      expect(result).toEqual(mockRollups);
    });
  });

  describe('getAggregatedMetrics', () => {
    it('should calculate aggregated metrics correctly', async () => {
      const mockAggregatedData = {
        total_messages: 1000,
        total_ai_calls: 500,
        total_cost: 25.0,
        total_cache_hits: 300,
        total_cache_misses: 200,
        avg_processing_time: 140,
      };

      mockDb.get.mockResolvedValue(mockAggregatedData);

      const result = await service.getAggregatedMetrics('tenant1', '2025-09-01', '2025-09-07');

      expect(result).toEqual({
        totalMessages: 1000,
        totalAICalls: 500,
        totalCost: 25.0,
        cacheHitRate: 0.6, // 300 / (300 + 200)
        avgProcessingTime: 140,
      });
    });

    it('should handle empty result gracefully', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await service.getAggregatedMetrics('tenant1', '2025-09-01', '2025-09-07');

      expect(result).toEqual({
        totalMessages: 0,
        totalAICalls: 0,
        totalCost: 0,
        cacheHitRate: 0,
        avgProcessingTime: 0,
      });
    });

    it('should calculate cache hit rate correctly when no cache data', async () => {
      const mockAggregatedData = {
        total_messages: 1000,
        total_ai_calls: 500,
        total_cost: 25.0,
        total_cache_hits: 0,
        total_cache_misses: 0,
        avg_processing_time: 140,
      };

      mockDb.get.mockResolvedValue(mockAggregatedData);

      const result = await service.getAggregatedMetrics('tenant1', '2025-09-01', '2025-09-07');

      expect(result.cacheHitRate).toBe(0);
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should delete old metrics and return count', async () => {
      mockDb.run.mockResolvedValue({ changes: 150 });

      const result = await service.cleanupOldMetrics(30);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM usage_metrics'),
        expect.arrayContaining([expect.any(String)])
      );
      expect(result).toBe(150);
    });

    it('should handle zero deletions', async () => {
      mockDb.run.mockResolvedValue({ changes: 0 });

      const result = await service.cleanupOldMetrics(30);
      expect(result).toBe(0);
    });
  });
});

describe('Edge Cases and Data Validation', () => {
  let service;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
      exec: vi.fn(),
    };

    mockDatabaseManager.mockImplementation(() => mockDb);
    service = new UsageRollupService(mockDb);
  });

  it('should handle date boundary correctly', async () => {
    const targetDate = new Date('2025-09-08T23:59:59');
    const mockTenants = [{ id: 'tenant1' }];

    mockDb.all.mockResolvedValue(mockTenants);
    mockDb.get.mockResolvedValue({ count: 0 });

    await service.performDailyRollup(targetDate);

    // Should query for previous day (2025-09-07)
    expect(mockDb.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['tenant1', '2025-09-07 00:00:00', '2025-09-07 23:59:59'])
    );
  });
});

describe('Performance and Concurrency', () => {
  let service;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
      exec: vi.fn(),
    };

    mockDatabaseManager.mockImplementation(() => mockDb);
    service = new UsageRollupService(mockDb);
  });

  it('should handle multiple tenants efficiently', async () => {
    const mockTenants = Array.from({ length: 100 }, (_, i) => ({ id: `tenant${i}` }));

    mockDb.all.mockResolvedValue(mockTenants);
    mockDb.get.mockResolvedValue({ count: 0 }); // No data for any tenant

    await service.performDailyRollup();

    // Should query for all tenants
    expect(mockDb.all).toHaveBeenCalledTimes(1);
    // Should check data existence for each tenant
    expect(mockDb.get).toHaveBeenCalledTimes(100);
  });

  it('should handle partial failures gracefully', async () => {
    const mockTenants = [{ id: 'tenant1' }, { id: 'tenant2' }, { id: 'tenant3' }];

    mockDb.all.mockResolvedValue(mockTenants);
    mockDb.get
      .mockResolvedValueOnce({ count: 0 }) // tenant1: no data
      .mockRejectedValueOnce(new Error('Database error for tenant2')) // tenant2: error
      .mockResolvedValueOnce({ count: 0 }); // tenant3: no data

    // Should not throw despite tenant2 error
    await expect(service.performDailyRollup()).resolves.not.toThrow();
  });
});
