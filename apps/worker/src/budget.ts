import logger from '../../../packages/shared/src/services/logger';

/**
 * Budget enforcement modes when tenant budget is exhausted
 */
export enum DegradeMode {
  STRICT_RULES = 'strict_rules',    // Use only fast-path rules, no AI
  LINK_BLOCKS = 'link_blocks',      // Block new user links only, allow AI for established users
  DISABLE_AI = 'disable_ai'         // Completely disable AI, allow all other actions
}

/**
 * Budget result interface
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  degradeMode?: DegradeMode;
  remainingBudget?: number;
}

/**
 * Budget usage tracking interface
 */
export interface UsageRecord {
  tokens: number;
  cost: number;
  model: string;
  operation: string;
  timestamp?: Date;
}

/**
 * BudgetEnforcer handles budget checking and enforcement in worker processes
 * 
 * Features:
 * - Pre-processing budget checks
 * - Post-processing usage recording
 * - Configurable degrade modes
 * - Caching for performance
 */
export class BudgetEnforcer {
  private budgetCache: Map<string, { budget: any; usage: any; lastCheck: number }> = new Map();
  private cacheTimeout = 60000; // 1 minute cache
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = 'http://localhost:3001') {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Check if AI processing is allowed for a tenant
   */
  async checkBudget(tenantId: string): Promise<BudgetCheckResult> {
    try {
      const budgetInfo = await this.getBudgetInfo(tenantId);
      
      if (!budgetInfo) {
        logger.warn('BudgetEnforcer: No budget info found', { tenantId });
        return { allowed: true }; // Default to allow if no budget info
      }

      const { budget, usage } = budgetInfo;
      const remaining = budget.monthlyLimit - usage.totalSpent;

      // Budget exhausted - check degrade mode
      if (remaining <= 0) {
        return {
          allowed: false,
          reason: 'Budget exhausted',
          degradeMode: budget.degradeMode as DegradeMode,
          remainingBudget: 0
        };
      }

      // Budget available
      return {
        allowed: true,
        remainingBudget: remaining
      };
    } catch (error) {
      logger.error('BudgetEnforcer: Budget check failed', { 
        tenantId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Default to allow on error to prevent blocking legitimate traffic
      return { allowed: true, reason: 'Budget check failed, defaulting to allow' };
    }
  }

  /**
   * Record AI usage after processing
   */
  async recordUsage(tenantId: string, usage: UsageRecord): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/billing/usage/${tenantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN}`
        },
        body: JSON.stringify(usage)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      // Invalidate cache after recording usage
      this.budgetCache.delete(tenantId);

      logger.debug('BudgetEnforcer: Usage recorded', { tenantId, ...usage });
    } catch (error) {
      logger.error('BudgetEnforcer: Failed to record usage', { 
        tenantId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      // Don't throw - recording failures shouldn't block processing
    }
  }

  /**
   * Apply degrade mode logic for budget-exhausted tenants
   */
  shouldApplyDegradeMode(degradeMode: DegradeMode, messageContext: any): boolean {
    switch (degradeMode) {
      case DegradeMode.STRICT_RULES:
        // No AI allowed, use only fast-path rules
        return true;

      case DegradeMode.LINK_BLOCKS:
        // Block links for new users, allow AI for established users
        return messageContext.hasLinks && messageContext.isNewUser;

      case DegradeMode.DISABLE_AI:
        // Completely disable AI
        return true;

      default:
        return true;
    }
  }

  /**
   * Get processing strategy based on budget status
   */
  async getProcessingStrategy(tenantId: string, messageContext: any): Promise<{
    useAI: boolean;
    useFastPath: boolean;
    reason: string;
  }> {
    const budgetCheck = await this.checkBudget(tenantId);

    if (budgetCheck.allowed) {
      return {
        useAI: true,
        useFastPath: true,
        reason: 'Budget available'
      };
    }

    // Budget exhausted - apply degrade mode
    const shouldDegrade = this.shouldApplyDegradeMode(
      budgetCheck.degradeMode!,
      messageContext
    );

    if (shouldDegrade) {
      return {
        useAI: false,
        useFastPath: true,
        reason: `Budget exhausted, degrade mode: ${budgetCheck.degradeMode}`
      };
    }

    // Special case for LINK_BLOCKS mode with established users
    return {
      useAI: true,
      useFastPath: true,
      reason: 'Budget exhausted but user is established'
    };
  }

  /**
   * Get cached or fresh budget information
   */
  private async getBudgetInfo(tenantId: string): Promise<any> {
    const cached = this.budgetCache.get(tenantId);
    const now = Date.now();

    // Return cached data if still valid
    if (cached && (now - cached.lastCheck) < this.cacheTimeout) {
      return cached;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/billing/budget/${tenantId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // No budget configured
        }
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the result
      const budgetInfo = {
        budget: data.budget,
        usage: data.usage,
        lastCheck: now
      };
      
      this.budgetCache.set(tenantId, budgetInfo);
      
      return budgetInfo;
    } catch (error) {
      logger.error('BudgetEnforcer: Failed to fetch budget info', { 
        tenantId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Clear budget cache for a tenant (useful for testing)
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.budgetCache.delete(tenantId);
    } else {
      this.budgetCache.clear();
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.budgetCache.size,
      hits: 0, // TODO: Implement hit/miss tracking if needed
      misses: 0
    };
  }
}

/**
 * Global budget enforcer instance
 */
export const budgetEnforcer = new BudgetEnforcer();
