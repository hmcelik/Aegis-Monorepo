import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxManager } from '../../packages/shared/src/outbox';

describe('Outbox Pattern (AEG-102)', () => {
  let outboxManager: OutboxManager;

  beforeEach(() => {
    outboxManager = new OutboxManager();
  });

  describe('Action Creation', () => {
    it('should create unique action IDs', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';
      const actionType = 'delete';

      const id1 = await outboxManager.createAction(chatId, messageId, actionType, {});
      const id2 = await outboxManager.createAction(chatId, 'msg456', actionType, {});

      expect(id1).toBe(`${chatId}:${messageId}:${actionType}`);
      expect(id2).toBe(`${chatId}:msg456:${actionType}`);
      expect(id1).not.toBe(id2);
    });

    it('should return same ID for idempotent requests', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';
      const actionType = 'delete';
      const payload = { reason: 'spam' };

      const id1 = await outboxManager.createAction(chatId, messageId, actionType, payload);
      const id2 = await outboxManager.createAction(chatId, messageId, actionType, payload);

      expect(id1).toBe(id2);

      const status = outboxManager.getActionStatus(id1);
      expect(status?.status).toBe('pending');
    });

    it('should create different IDs for different action types', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const deleteId = await outboxManager.createAction(chatId, messageId, 'delete', {});
      const muteId = await outboxManager.createAction(chatId, messageId, 'mute', {
        duration: 3600,
      });

      expect(deleteId).not.toBe(muteId);
      expect(deleteId).toBe(`${chatId}:${messageId}:delete`);
      expect(muteId).toBe(`${chatId}:${messageId}:mute`);
    });
  });

  describe('Action Processing', () => {
    it('should process delete action successfully', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const actionId = await outboxManager.createAction(chatId, messageId, 'delete', {
        reason: 'spam detected',
      });

      const result = await outboxManager.processAction(actionId);

      expect(result.success).toBe(true);

      const status = outboxManager.getActionStatus(actionId);
      expect(status?.status).toBe('completed');
      expect(status?.processedAt).toBeDefined();
      expect(status?.retryCount).toBe(1);
    });

    it('should handle action retries on failure', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123-fail'; // This will always fail

      const actionId = await outboxManager.createAction(chatId, messageId, 'delete', {});

      // First attempt - should fail
      const result1 = await outboxManager.processAction(actionId);
      expect(result1.success).toBe(false);

      const status1 = outboxManager.getActionStatus(actionId);
      expect(status1?.status).toBe('pending');
      expect(status1?.retryCount).toBe(1);

      // Second attempt - should fail
      const result2 = await outboxManager.processAction(actionId);
      expect(result2.success).toBe(false);

      const status2 = outboxManager.getActionStatus(actionId);
      expect(status2?.status).toBe('pending');
      expect(status2?.retryCount).toBe(2);

      // Third attempt - should still fail but stay pending
      const result3 = await outboxManager.processAction(actionId);
      expect(result3.success).toBe(false);

      const status3 = outboxManager.getActionStatus(actionId);
      expect(status3?.status).toBe('pending');
      expect(status3?.retryCount).toBe(3);
    });

    it('should mark action as failed after max retries', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123-fail'; // This will always fail

      const actionId = await outboxManager.createAction(chatId, messageId, 'delete', {});

      // Attempt processing until max retries
      for (let i = 0; i < 3; i++) {
        await outboxManager.processAction(actionId);
      }

      // One more attempt should mark as failed
      const result = await outboxManager.processAction(actionId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Max retries exceeded');

      const status = outboxManager.getActionStatus(actionId);
      expect(status?.status).toBe('failed');
      expect(status?.retryCount).toBe(3);
    });

    it('should be idempotent for completed actions', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123'; // This will succeed (no 'fail' in name)

      const actionId = await outboxManager.createAction(chatId, messageId, 'delete', {});

      // First processing - should succeed
      const result1 = await outboxManager.processAction(actionId);
      expect(result1.success).toBe(true);

      // Second processing - should return success without re-executing
      const result2 = await outboxManager.processAction(actionId);
      expect(result2.success).toBe(true);

      const status = outboxManager.getActionStatus(actionId);
      expect(status?.status).toBe('completed');
      expect(status?.retryCount).toBe(1); // Should not increment
    });
  });

  describe('Different Action Types', () => {
    it('should handle mute action', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const actionId = await outboxManager.createAction(chatId, messageId, 'mute', {
        userId: 123456789,
        duration: 3600,
      });

      const result = await outboxManager.processAction(actionId);
      expect(result.success).toBe(true);
    });

    it('should handle kick action', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const actionId = await outboxManager.createAction(chatId, messageId, 'kick', {
        userId: 123456789,
      });

      const result = await outboxManager.processAction(actionId);
      expect(result.success).toBe(true);
    });

    it('should handle ban action', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const actionId = await outboxManager.createAction(chatId, messageId, 'ban', {
        userId: 123456789,
      });

      const result = await outboxManager.processAction(actionId);
      expect(result.success).toBe(true);
    });

    it('should handle warn action', async () => {
      const chatId = -1001234567890;
      const messageId = 'msg123';

      const actionId = await outboxManager.createAction(chatId, messageId, 'warn', {
        userId: 123456789,
        reason: 'Inappropriate content',
      });

      const result = await outboxManager.processAction(actionId);
      expect(result.success).toBe(true);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should provide accurate metrics', async () => {
      const chatId = -1001234567890;

      // Create several actions
      const deleteId = await outboxManager.createAction(chatId, 'msg1', 'delete', {}); // This will succeed
      const muteId = await outboxManager.createAction(chatId, 'msg2', 'mute', { userId: 123 });
      const kickId = await outboxManager.createAction(chatId, 'msg3', 'kick', { userId: 456 });

      // Process one successfully
      await outboxManager.processAction(deleteId);

      // Leave others pending
      const metrics = outboxManager.getMetrics();

      expect(metrics.total).toBe(3);
      expect(metrics.pending).toBe(2);
      expect(metrics.completed).toBe(1);
      expect(metrics.failed).toBe(0);
      expect(metrics.processing).toBe(0);
    });

    it('should return pending actions in chronological order', async () => {
      const chatId = -1001234567890;

      const id1 = await outboxManager.createAction(chatId, 'msg1', 'delete', {});

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));

      const id2 = await outboxManager.createAction(chatId, 'msg2', 'mute', { userId: 123 });

      const pendingActions = outboxManager.getPendingActions();

      expect(pendingActions).toHaveLength(2);
      expect(pendingActions[0].id).toBe(id1);
      expect(pendingActions[1].id).toBe(id2);
    });

    it('should cleanup old completed entries', async () => {
      const chatId = -1001234567890;

      const actionId = await outboxManager.createAction(chatId, 'msg1', 'delete', {}); // This will succeed
      await outboxManager.processAction(actionId);

      // Wait a tiny bit to ensure the timestamp is older than cutoff
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cleanup with 5ms cutoff
      const cleaned = outboxManager.cleanup(5);

      expect(cleaned).toBe(1);
      expect(outboxManager.getActionStatus(actionId)).toBeUndefined();
    });
  });
});
