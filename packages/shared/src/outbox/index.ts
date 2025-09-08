import logger from '../services/logger';
import { TelegramClient } from '../telegram';

export interface OutboxEntry {
  id: string; // Format: chatId:messageId:actionType
  chatId: number;
  messageId: string;
  actionType: 'delete' | 'mute' | 'kick' | 'ban' | 'warn';
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  retryCount: number;
  lastError?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  telegramResponse?: unknown;
}

export class OutboxManager {
  private outboxEntries: Map<string, OutboxEntry> = new Map();
  private maxRetries: number = 3;
  private telegramClient?: TelegramClient;

  constructor(maxRetries: number = 3, telegramClient?: TelegramClient) {
    this.maxRetries = maxRetries;
    this.telegramClient = telegramClient;
  }

  /**
   * Creates an idempotent action entry
   */
  async createAction(
    chatId: number,
    messageId: string,
    actionType: OutboxEntry['actionType'],
    payload: Record<string, unknown>
  ): Promise<string> {
    const id = `${chatId}:${messageId}:${actionType}`;

    // Check if action already exists (idempotency)
    const existing = this.outboxEntries.get(id);
    if (existing) {
      logger.info('Action already exists, returning existing ID', {
        id,
        status: existing.status,
        retryCount: existing.retryCount,
      });
      return id;
    }

    const entry: OutboxEntry = {
      id,
      chatId,
      messageId,
      actionType,
      payload,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
    };

    this.outboxEntries.set(id, entry);

    logger.info('Created outbox action entry', {
      id,
      actionType,
      chatId,
      messageId,
    });

    return id;
  }

  /**
   * Processes a pending action idempotently
   */
  async processAction(id: string): Promise<ActionResult> {
    const entry = this.outboxEntries.get(id);
    if (!entry) {
      return { success: false, error: 'Action not found' };
    }

    // Return if already completed
    if (entry.status === 'completed') {
      logger.info('Action already completed', { id });
      return { success: true };
    }

    // Check retry limit
    if (entry.retryCount >= this.maxRetries) {
      entry.status = 'failed';
      entry.lastError = 'Max retries exceeded';
      logger.error('Action failed after max retries', {
        id,
        retryCount: entry.retryCount,
        maxRetries: this.maxRetries,
      });
      return { success: false, error: 'Max retries exceeded' };
    }

    // Mark as processing
    entry.status = 'processing';
    entry.retryCount++;

    try {
      // Execute the action
      const result = await this.executeAction(entry);

      if (result.success) {
        entry.status = 'completed';
        entry.processedAt = new Date();
        logger.info('Action completed successfully', { id, retryCount: entry.retryCount });
      } else {
        entry.status = 'pending'; // Will retry
        entry.lastError = result.error;
        logger.warn('Action failed, will retry', {
          id,
          error: result.error,
          retryCount: entry.retryCount,
        });
      }

      return result;
    } catch (error) {
      entry.status = 'pending';
      entry.lastError = error instanceof Error ? error.message : String(error);

      logger.error('Action execution threw error', {
        id,
        error: entry.lastError,
        retryCount: entry.retryCount,
      });

      return { success: false, error: entry.lastError };
    }
  }

  /**
   * Execute the actual moderation action
   */
  private async executeAction(entry: OutboxEntry): Promise<ActionResult> {
    const { actionType, chatId, messageId, payload } = entry;

    // Mock implementation - in real app, this would call Telegram API
    logger.info('Executing moderation action', {
      actionType,
      chatId,
      messageId,
      payload,
    });

    // Simulate different action types
    switch (actionType) {
      case 'delete':
        return this.deleteMessage(chatId, messageId);
      case 'mute':
        return this.muteUser(chatId, payload.userId as number, payload.duration as number);
      case 'kick':
        return this.kickUser(chatId, payload.userId as number);
      case 'ban':
        return this.banUser(chatId, payload.userId as number);
      case 'warn':
        return this.warnUser(chatId, payload.userId as number, payload.reason as string);
      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  }

  private async deleteMessage(chatId: number, messageId: string): Promise<ActionResult> {
    logger.info('Deleting message', { chatId, messageId });

    if (this.telegramClient) {
      // Use real Telegram API client
      try {
        const response = await this.telegramClient.deleteMessage(chatId, parseInt(messageId));
        return {
          success: response.ok,
          error: response.ok ? undefined : response.description,
          telegramResponse: response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramResponse: null,
        };
      }
    } else {
      // Mock implementation for testing
      const shouldFail = messageId.includes('fail');

      if (shouldFail) {
        return { success: false, error: 'Failed to delete message' };
      } else {
        return { success: true, telegramResponse: { ok: true } };
      }
    }
  }

  private async muteUser(chatId: number, userId: number, duration: number): Promise<ActionResult> {
    logger.info('Muting user', { chatId, userId, duration });

    if (this.telegramClient) {
      // Use real Telegram API client
      try {
        const untilDate = Math.floor(Date.now() / 1000) + duration * 60; // Convert minutes to timestamp
        const permissions = {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        };

        const response = await this.telegramClient.restrictChatMember(chatId, userId, permissions, {
          until_date: untilDate,
        });

        return {
          success: response.ok,
          error: response.ok ? undefined : response.description,
          telegramResponse: response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramResponse: null,
        };
      }
    } else {
      // Mock implementation for testing
      return { success: true, telegramResponse: { ok: true } };
    }
  }

  private async kickUser(chatId: number, userId: number): Promise<ActionResult> {
    logger.info('Kicking user', { chatId, userId });

    if (this.telegramClient) {
      // Use real Telegram API client (ban then immediately unban = kick)
      try {
        const banResponse = await this.telegramClient.banChatMember(chatId, userId);
        if (banResponse.ok) {
          // Immediately unban to simulate kick
          const unbanResponse = await this.telegramClient.unbanChatMember(chatId, userId);
          return {
            success: unbanResponse.ok,
            error: unbanResponse.ok ? undefined : unbanResponse.description,
            telegramResponse: unbanResponse,
          };
        } else {
          return {
            success: false,
            error: banResponse.description || 'Failed to ban user',
            telegramResponse: banResponse,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramResponse: null,
        };
      }
    } else {
      // Mock implementation for testing
      return { success: true, telegramResponse: { ok: true } };
    }
  }

  private async banUser(chatId: number, userId: number): Promise<ActionResult> {
    logger.info('Banning user', { chatId, userId });

    if (this.telegramClient) {
      // Use real Telegram API client
      try {
        const response = await this.telegramClient.banChatMember(chatId, userId);
        return {
          success: response.ok,
          error: response.ok ? undefined : response.description,
          telegramResponse: response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramResponse: null,
        };
      }
    } else {
      // Mock implementation for testing
      return { success: true, telegramResponse: { ok: true } };
    }
  }

  private async warnUser(chatId: number, userId: number, reason: string): Promise<ActionResult> {
    logger.info('Warning user', { chatId, userId, reason });

    if (this.telegramClient) {
      // Use real Telegram API client to send warning message
      try {
        const warningText = `⚠️ Warning: ${reason}\n\nPlease follow the group rules to avoid further action.`;
        const response = await this.telegramClient.sendMessage(chatId, warningText, {
          reply_to_message_id: undefined, // Could be set if we had the original message
          parse_mode: 'HTML',
        });

        return {
          success: response.ok,
          error: response.ok ? undefined : response.description,
          telegramResponse: response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramResponse: null,
        };
      }
    } else {
      // Mock implementation for testing
      return { success: true, telegramResponse: { ok: true } };
    }
  }

  /**
   * Get all pending actions for processing
   */
  getPendingActions(): OutboxEntry[] {
    return Array.from(this.outboxEntries.values())
      .filter(entry => entry.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Get action status
   */
  getActionStatus(id: string): OutboxEntry | undefined {
    return this.outboxEntries.get(id);
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const entries = Array.from(this.outboxEntries.values());
    return {
      total: entries.length,
      pending: entries.filter(e => e.status === 'pending').length,
      processing: entries.filter(e => e.status === 'processing').length,
      completed: entries.filter(e => e.status === 'completed').length,
      failed: entries.filter(e => e.status === 'failed').length,
      avgRetryCount:
        entries.length > 0 ? entries.reduce((sum, e) => sum + e.retryCount, 0) / entries.length : 0,
    };
  }

  /**
   * Cleanup old completed entries (memory management)
   */
  cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - olderThanMs);
    let cleaned = 0;

    for (const [id, entry] of this.outboxEntries.entries()) {
      if (entry.status === 'completed' && entry.processedAt && entry.processedAt < cutoff) {
        this.outboxEntries.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old outbox entries', { cleaned, remaining: this.outboxEntries.size });
    }

    return cleaned;
  }
}

// Export singleton instance
export const outboxManager = new OutboxManager();
