import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BudgetEnforcer, DegradeMode } from '../../apps/worker/src/budget';

// Mock fetch
global.fetch = vi.fn();

describe('BudgetEnforcer', () => {
  let budgetEnforcer: BudgetEnforcer;

  beforeEach(() => {
    budgetEnforcer = new BudgetEnforcer('http://localhost:3001');
    budgetEnforcer.clearCache(); // Clear cache before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Budget Checking', () => {
    it('should allow processing when budget is available', async () => {
      const mockBudgetResponse = {
        budget: {
          tenantId: 'tenant-1',
          monthlyLimit: 100.0,
          degradeMode: 'strict_rules',
          isExhausted: false
        },
        usage: {
          totalSpent: 50.0,
          tokenCount: 1000,
          apiCalls: 25
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      const result = await budgetEnforcer.checkBudget('tenant-1');

      expect(result.allowed).toBe(true);
      expect(result.remainingBudget).toBe(50.0);
      expect(result.reason).toBeUndefined();
    });

    it('should deny processing when budget is exhausted', async () => {
      const mockBudgetResponse = {
        budget: {
          tenantId: 'tenant-1',
          monthlyLimit: 100.0,
          degradeMode: 'strict_rules',
          isExhausted: true
        },
        usage: {
          totalSpent: 100.0,
          tokenCount: 2000,
          apiCalls: 50
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      const result = await budgetEnforcer.checkBudget('tenant-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Budget exhausted');
      expect(result.degradeMode).toBe(DegradeMode.STRICT_RULES);
      expect(result.remainingBudget).toBe(0);
    });

    it('should default to allow on API error', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('API Error'));

      const result = await budgetEnforcer.checkBudget('tenant-1');

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Budget check failed');
    });

    it('should handle 404 response for unknown tenant', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await budgetEnforcer.checkBudget('unknown-tenant');

      expect(result.allowed).toBe(true);
    });
  });

  describe('Usage Recording', () => {
    it('should record usage successfully', async () => {
      const usage = {
        tokens: 150,
        cost: 0.003,
        model: 'gpt-3.5-turbo',
        operation: 'moderation'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await expect(budgetEnforcer.recordUsage('tenant-1', usage)).resolves.not.toThrow();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/billing/usage/tenant-1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(usage)
        })
      );
    });

    it('should not throw on usage recording failure', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network Error'));

      const usage = {
        tokens: 150,
        cost: 0.003,
        model: 'gpt-3.5-turbo',
        operation: 'moderation'
      };

      await expect(budgetEnforcer.recordUsage('tenant-1', usage)).resolves.not.toThrow();
    });

    it('should invalidate cache after recording usage', async () => {
      // First, populate cache
      const mockBudgetResponse = {
        budget: { monthlyLimit: 100.0, degradeMode: 'strict_rules' },
        usage: { totalSpent: 50.0 }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Record usage (should invalidate cache)
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await budgetEnforcer.recordUsage('tenant-1', {
        tokens: 100,
        cost: 0.002,
        model: 'gpt-3.5-turbo',
        operation: 'moderation'
      });

      // Next budget check should call API again (cache invalidated)
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(3); // Initial check + record usage + second check
    });
  });

  describe('Degrade Mode Logic', () => {
    it('should apply strict rules mode correctly', () => {
      const messageContext = {
        hasLinks: true,
        isNewUser: false,
        messageLength: 100
      };

      const shouldDegrade = budgetEnforcer.shouldApplyDegradeMode(
        DegradeMode.STRICT_RULES,
        messageContext
      );

      expect(shouldDegrade).toBe(true);
    });

    it('should apply link blocks mode for new users with links', () => {
      const messageContext = {
        hasLinks: true,
        isNewUser: true,
        messageLength: 50
      };

      const shouldDegrade = budgetEnforcer.shouldApplyDegradeMode(
        DegradeMode.LINK_BLOCKS,
        messageContext
      );

      expect(shouldDegrade).toBe(true);
    });

    it('should not apply link blocks mode for established users', () => {
      const messageContext = {
        hasLinks: true,
        isNewUser: false,
        messageLength: 50
      };

      const shouldDegrade = budgetEnforcer.shouldApplyDegradeMode(
        DegradeMode.LINK_BLOCKS,
        messageContext
      );

      expect(shouldDegrade).toBe(false);
    });

    it('should apply disable AI mode correctly', () => {
      const messageContext = {
        hasLinks: false,
        isNewUser: false,
        messageLength: 20
      };

      const shouldDegrade = budgetEnforcer.shouldApplyDegradeMode(
        DegradeMode.DISABLE_AI,
        messageContext
      );

      expect(shouldDegrade).toBe(true);
    });
  });

  describe('Processing Strategy', () => {
    it('should return AI processing when budget available', async () => {
      const mockBudgetResponse = {
        budget: {
          monthlyLimit: 100.0,
          degradeMode: 'strict_rules'
        },
        usage: {
          totalSpent: 30.0
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      const messageContext = {
        hasLinks: false,
        isNewUser: false,
        messageLength: 50
      };

      const strategy = await budgetEnforcer.getProcessingStrategy('tenant-1', messageContext);

      expect(strategy.useAI).toBe(true);
      expect(strategy.useFastPath).toBe(true);
      expect(strategy.reason).toBe('Budget available');
    });

    it('should return fast-path only when budget exhausted', async () => {
      const mockBudgetResponse = {
        budget: {
          monthlyLimit: 100.0,
          degradeMode: 'strict_rules'
        },
        usage: {
          totalSpent: 100.0
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      const messageContext = {
        hasLinks: false,
        isNewUser: false,
        messageLength: 50
      };

      const strategy = await budgetEnforcer.getProcessingStrategy('tenant-1', messageContext);

      expect(strategy.useAI).toBe(false);
      expect(strategy.useFastPath).toBe(true);
      expect(strategy.reason).toContain('degrade mode: strict_rules');
    });

    it('should allow AI for established users in link_blocks mode', async () => {
      const mockBudgetResponse = {
        budget: {
          monthlyLimit: 100.0,
          degradeMode: 'link_blocks'
        },
        usage: {
          totalSpent: 100.0
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBudgetResponse
      });

      const messageContext = {
        hasLinks: true,
        isNewUser: false, // Established user
        messageLength: 50
      };

      const strategy = await budgetEnforcer.getProcessingStrategy('tenant-1', messageContext);

      expect(strategy.useAI).toBe(true);
      expect(strategy.useFastPath).toBe(true);
      expect(strategy.reason).toBe('Budget exhausted but user is established');
    });
  });

  describe('Cache Management', () => {
    it('should cache budget information', async () => {
      const mockBudgetResponse = {
        budget: { monthlyLimit: 100.0, degradeMode: 'strict_rules' },
        usage: { totalSpent: 50.0 }
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockBudgetResponse
      });

      // First call
      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(1); // No additional API call
    });

    it('should provide cache statistics', () => {
      const stats = budgetEnforcer.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(typeof stats.size).toBe('number');
    });

    it('should clear cache for specific tenant', async () => {
      const mockBudgetResponse = {
        budget: { monthlyLimit: 100.0, degradeMode: 'strict_rules' },
        usage: { totalSpent: 50.0 }
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockBudgetResponse
      });

      // Populate cache
      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Clear cache for tenant
      budgetEnforcer.clearCache('tenant-1');

      // Next call should hit API again
      await budgetEnforcer.checkBudget('tenant-1');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      (fetch as any).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const result = await budgetEnforcer.checkBudget('tenant-1');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Budget check failed');
    });

    it('should handle malformed API responses', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      const result = await budgetEnforcer.checkBudget('tenant-1');
      expect(result.allowed).toBe(true);
    });

    it('should handle API server errors', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await budgetEnforcer.checkBudget('tenant-1');
      expect(result.allowed).toBe(true);
    });
  });
});
