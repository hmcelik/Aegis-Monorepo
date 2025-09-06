import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the BudgetManager
const mockBudgetManager = {
  getBudget: vi.fn(),
  updateBudget: vi.fn(),
  recordUsage: vi.fn(),
  getCurrentUsage: vi.fn(),
  getUsageHistory: vi.fn(),
  getAnalytics: vi.fn(),
  isBudgetExhausted: vi.fn(),
  initializeTables: vi.fn()
};

// Mock BudgetManager class
class MockBudgetManager {
  constructor() {
    Object.assign(this, mockBudgetManager);
  }
}

describe('BudgetManager Service', () => {
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import the BudgetManager class first
const BudgetManager = vi.fn().mockImplementation(() => {
  return {
    getBudget: vi.fn(),
    updateBudget: vi.fn(),
    recordUsage: vi.fn(),
    getCurrentUsage: vi.fn(),
    getUsageHistory: vi.fn(),
    getAnalytics: vi.fn(),
    isBudgetExhausted: vi.fn(),
    initializeTables: vi.fn()
  };
});

// Mock Database
const mockDatabase = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  getInstance: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn()
  })
};

// Mock Logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn()
};

// Mock the dependencies
vi.mock('@telegram-moderator/shared/src/services/database.js', () => ({
  Database: mockDatabase
}));

vi.mock('@telegram-moderator/shared/src/services/logger.js', () => ({
  logger: mockLogger
}));

describe('BudgetManager Service', () => {
  let budgetManager: BudgetManager;

  beforeEach(() => {
    budgetManager = new BudgetManager();
    vi.clearAllMocks();
    
    // Setup default mock return values
    mockDatabase.run.mockResolvedValue({ lastID: 1 });
    mockDatabase.get.mockResolvedValue(null);
    mockDatabase.all.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Budget Management', () => {
    it('should create default budget for new tenant', async () => {
      // Mock no existing budget
      mockDatabase.get.mockResolvedValueOnce(null);
      
      // Mock successful creation
      mockDatabase.run.mockResolvedValueOnce({ lastID: 1 });
      
      // Mock the new budget returned
      const mockBudget = {
        tenant_id: 'tenant-1',
        monthly_limit: 100.0,
        degrade_mode: 'strict_rules',
        reset_date: '2025-10-01T00:00:00.000Z',
        created_at: '2025-09-06T12:00:00.000Z',
        updated_at: '2025-09-06T12:00:00.000Z'
      };
      
      mockDatabase.get.mockResolvedValueOnce(mockBudget);

      const budget = await budgetManager.getBudget('tenant-1');

      expect(budget.tenantId).toBe('tenant-1');
      expect(budget.monthlyLimit).toBe(100.0);
      expect(budget.degradeMode).toBe('strict_rules');
      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_budgets'),
        expect.arrayContaining(['tenant-1', 100.0, 'strict_rules'])
      );
    });

    it('should return existing budget', async () => {
      const mockBudget = {
        tenant_id: 'tenant-1',
        monthly_limit: 200.0,
        degrade_mode: 'link_blocks',
        reset_date: '2025-10-01T00:00:00.000Z',
        created_at: '2025-09-01T00:00:00.000Z',
        updated_at: '2025-09-05T10:00:00.000Z'
      };

      mockDatabase.get.mockResolvedValue(mockBudget);

      const budget = await budgetManager.getBudget('tenant-1');

      expect(budget.tenantId).toBe('tenant-1');
      expect(budget.monthlyLimit).toBe(200.0);
      expect(budget.degradeMode).toBe('link_blocks');
    });

    it('should update budget settings', async () => {
      const mockUpdatedBudget = {
        tenant_id: 'tenant-1',
        monthly_limit: 150.0,
        degrade_mode: 'disable_ai',
        reset_date: '2025-10-01T00:00:00.000Z',
        created_at: '2025-09-01T00:00:00.000Z',
        updated_at: '2025-09-06T12:00:00.000Z'
      };

      mockDatabase.run.mockResolvedValue({ changes: 1 });
      mockDatabase.get.mockResolvedValue(mockUpdatedBudget);

      const result = await budgetManager.updateBudget('tenant-1', {
        monthlyLimit: 150.0,
        degradeMode: 'disable_ai'
      });

      expect(result.monthlyLimit).toBe(150.0);
      expect(result.degradeMode).toBe('disable_ai');
      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_budgets'),
        [150.0, 'disable_ai', 'tenant-1']
      );
    });

    it('should check if budget is exhausted', async () => {
      const mockBudget = {
        tenant_id: 'tenant-1',
        monthly_limit: 100.0,
        degrade_mode: 'strict_rules',
        reset_date: '2025-10-01T00:00:00.000Z'
      };

      const mockUsage = {
        api_calls: 50,
        total_tokens: 5000,
        total_spent: 105.0, // Exceeds budget
        avg_cost_per_call: 2.1
      };

      mockDatabase.get
        .mockResolvedValueOnce(mockBudget) // getBudget call
        .mockResolvedValueOnce(mockUsage); // getCurrentUsage call

      const isExhausted = await budgetManager.isBudgetExhausted('tenant-1');

      expect(isExhausted).toBe(true);
    });

    it('should handle budget check errors gracefully', async () => {
      mockDatabase.get.mockRejectedValue(new Error('Database error'));

      const isExhausted = await budgetManager.isBudgetExhausted('tenant-1');

      expect(isExhausted).toBe(false); // Default to allowing operations
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BudgetManager: Failed to check budget status',
        expect.objectContaining({
          tenantId: 'tenant-1'
        })
      );
    });
  });

  describe('Usage Tracking', () => {
    it('should record AI usage', async () => {
      const usage = {
        tokens: 150,
        cost: 0.003,
        model: 'gpt-3.5-turbo',
        operation: 'moderation',
        timestamp: new Date('2025-09-06T12:00:00.000Z')
      };

      mockDatabase.run.mockResolvedValue({ lastID: 123 });

      const result = await budgetManager.recordUsage('tenant-1', usage);

      expect(result.id).toBe(123);
      expect(result.tenantId).toBe('tenant-1');
      expect(result.tokens).toBe(150);
      expect(result.cost).toBe(0.003);
      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_usage'),
        ['tenant-1', 150, 0.003, 'gpt-3.5-turbo', 'moderation', usage.timestamp]
      );
    });

    it('should get current month usage', async () => {
      const mockUsage = {
        api_calls: 25,
        total_tokens: 2500,
        total_spent: 50.0,
        avg_cost_per_call: 2.0
      };

      mockDatabase.get.mockResolvedValue(mockUsage);

      const usage = await budgetManager.getCurrentUsage('tenant-1');

      expect(usage.apiCalls).toBe(25);
      expect(usage.tokenCount).toBe(2500);
      expect(usage.totalSpent).toBe(50.0);
      expect(usage.avgCostPerCall).toBe(2.0);
    });

    it('should handle null usage data', async () => {
      mockDatabase.get.mockResolvedValue({
        api_calls: null,
        total_tokens: null,
        total_spent: null,
        avg_cost_per_call: null
      });

      const usage = await budgetManager.getCurrentUsage('tenant-1');

      expect(usage.apiCalls).toBe(0);
      expect(usage.tokenCount).toBe(0);
      expect(usage.totalSpent).toBe(0);
      expect(usage.avgCostPerCall).toBe(0);
    });

    it('should get usage history with options', async () => {
      const mockHistory = [
        {
          id: 1,
          tenant_id: 'tenant-1',
          tokens: 150,
          cost: 0.003,
          model: 'gpt-3.5-turbo',
          operation: 'moderation',
          timestamp: '2025-09-06T12:00:00.000Z'
        },
        {
          id: 2,
          tenant_id: 'tenant-1',
          tokens: 200,
          cost: 0.004,
          model: 'gpt-4',
          operation: 'content_analysis',
          timestamp: '2025-09-06T11:00:00.000Z'
        }
      ];

      mockDatabase.all.mockResolvedValue(mockHistory);

      const startDate = new Date('2025-09-01');
      const endDate = new Date('2025-09-06');
      const history = await budgetManager.getUsageHistory('tenant-1', {
        startDate,
        endDate,
        limit: 50
      });

      expect(history).toHaveLength(2);
      expect(history[0].tenantId).toBe('tenant-1');
      expect(history[0].tokens).toBe(150);
      expect(history[1].model).toBe('gpt-4');
      expect(mockDatabase.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM ai_usage'),
        ['tenant-1', startDate.toISOString(), endDate.toISOString(), 50]
      );
    });
  });

  describe('Analytics', () => {
    it('should generate analytics for dashboard', async () => {
      const mockDailyUsage = [
        { date: '2025-09-06', daily_spent: 10.0, daily_tokens: 1000, daily_calls: 5 },
        { date: '2025-09-05', daily_spent: 8.0, daily_tokens: 800, daily_calls: 4 }
      ];

      const mockModelUsage = [
        { model: 'gpt-3.5-turbo', total_cost: 12.0, total_tokens: 1200, call_count: 6 },
        { model: 'gpt-4', total_cost: 6.0, total_tokens: 600, call_count: 3 }
      ];

      const mockOperationUsage = [
        { operation: 'moderation', total_cost: 15.0, total_tokens: 1500, call_count: 8 },
        { operation: 'content_analysis', total_cost: 3.0, total_tokens: 300, call_count: 1 }
      ];

      mockDatabase.all
        .mockResolvedValueOnce(mockDailyUsage)
        .mockResolvedValueOnce(mockModelUsage)
        .mockResolvedValueOnce(mockOperationUsage);

      const analytics = await budgetManager.getAnalytics('tenant-1', '30d');

      expect(analytics.period).toBe('30d');
      expect(analytics.dailyUsage).toHaveLength(2);
      expect(analytics.dailyUsage[0].spent).toBe(10.0);
      expect(analytics.modelBreakdown).toHaveLength(2);
      expect(analytics.modelBreakdown[0].model).toBe('gpt-3.5-turbo');
      expect(analytics.operationBreakdown).toHaveLength(2);
      expect(analytics.operationBreakdown[0].operation).toBe('moderation');
    });

    it('should handle different time periods', async () => {
      mockDatabase.all
        .mockResolvedValue([])
        .mockResolvedValue([])
        .mockResolvedValue([]);

      await budgetManager.getAnalytics('tenant-1', '7d');

      // Check that the startDate is approximately 7 days ago
      const calls = mockDatabase.all.mock.calls;
      expect(calls[0][1][1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle null analytics data', async () => {
      const mockEmptyData = [
        { date: '2025-09-06', daily_spent: null, daily_tokens: null, daily_calls: null }
      ];

      mockDatabase.all
        .mockResolvedValueOnce(mockEmptyData)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const analytics = await budgetManager.getAnalytics('tenant-1', '30d');

      expect(analytics.dailyUsage[0].spent).toBe(0);
      expect(analytics.dailyUsage[0].tokens).toBe(0);
      expect(analytics.dailyUsage[0].calls).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database initialization errors', async () => {
      mockDatabase.run.mockRejectedValue(new Error('Database connection failed'));

      await expect(budgetManager.initializeTables()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BudgetManager: Failed to initialize tables',
        expect.objectContaining({
          error: 'Database connection failed'
        })
      );
    });

    it('should handle getBudget errors', async () => {
      mockDatabase.get.mockRejectedValue(new Error('Query failed'));

      await expect(budgetManager.getBudget('tenant-1')).rejects.toThrow('Query failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BudgetManager: Failed to get budget',
        expect.objectContaining({
          tenantId: 'tenant-1',
          error: 'Query failed'
        })
      );
    });

    it('should handle recordUsage errors', async () => {
      mockDatabase.run.mockRejectedValue(new Error('Insert failed'));

      const usage = {
        tokens: 150,
        cost: 0.003,
        model: 'gpt-3.5-turbo',
        operation: 'moderation'
      };

      await expect(budgetManager.recordUsage('tenant-1', usage)).rejects.toThrow('Insert failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BudgetManager: Failed to record usage',
        expect.objectContaining({
          tenantId: 'tenant-1',
          error: 'Insert failed'
        })
      );
    });
  });
});
});
