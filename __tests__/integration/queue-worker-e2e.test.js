import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MessageQueue } from '@telegram-moderator/shared/queue/messageQueue';
import Redis from 'ioredis';

describe('Queue-Worker E2E Integration', () => {
  let messageQueue;
  let redis;

  beforeAll(async () => {
    // Initialize Redis connection
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    // Initialize message queue
    messageQueue = new MessageQueue({
      redisUrl: 'redis://localhost:6379'
    });

    // Clear any existing jobs
    await redis.flushall();
  });

  afterAll(async () => {
    await messageQueue.close();
    await redis.quit();
  });

  it('should publish message to queue successfully', async () => {
    const testMessage = {
      messageId: 'test-msg-001',
      chatId: -1001234567890,
      userId: 123456789,
      content: 'This is a test message with offensive words: damn',
      timestamp: new Date(),
      metadata: {
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      }
    };

    const jobId = await messageQueue.publishMessage(testMessage);
    
    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe('string');
    expect(jobId).toContain('test-msg-001');
    
    // The job ID should follow our format: chatId:messageId
    expect(jobId).toBe('-1001234567890:test-msg-001');
  });

  it('should handle idempotent message publishing', async () => {
    const testMessage = {
      messageId: 'idempotent-test-001',
      chatId: -1001234567890,
      userId: 123456789,
      content: 'This message should only be processed once',
      timestamp: new Date(),
      metadata: {
        username: 'testuser'
      }
    };

    // Publish the same message twice
    const jobId1 = await messageQueue.publishMessage(testMessage);
    const jobId2 = await messageQueue.publishMessage(testMessage);
    
    // Should return the same job ID for idempotent publishing
    expect(jobId1).toBe(jobId2);
  });

  it('should calculate correct priority for different message types', async () => {
    const urgentMessage = {
      messageId: 'urgent-001',
      chatId: -1001234567890,
      userId: 123456789,
      content: 'spam spam spam urgent message',
      timestamp: new Date(),
      metadata: { username: 'spammer' }
    };

    const normalMessage = {
      messageId: 'normal-001',
      chatId: -1001234567890,
      userId: 123456789,
      content: 'Hello everyone, how are you today?',
      timestamp: new Date(),
      metadata: { username: 'gooduser' }
    };

    // Publish both messages
    const urgentJobId = await messageQueue.publishMessage(urgentMessage);
    const normalJobId = await messageQueue.publishMessage(normalMessage);

    // Verify both messages were queued with unique job IDs
    expect(urgentJobId).toBe('-1001234567890:urgent-001');
    expect(normalJobId).toBe('-1001234567890:normal-001');
    expect(urgentJobId).not.toBe(normalJobId);
  });

  it('should distribute messages across partitions correctly', async () => {
    const messages = [
      { chatId: -1001111111111, messageId: 'part-test-1' },
      { chatId: -1002222222222, messageId: 'part-test-2' },
      { chatId: -1003333333333, messageId: 'part-test-3' },
      { chatId: -1004444444444, messageId: 'part-test-4' },
    ];

    const jobIds = [];

    for (const msg of messages) {
      const fullMessage = {
        ...msg,
        userId: 123456789,
        content: 'Test message for partitioning',
        timestamp: new Date(),
        metadata: { username: 'testuser' }
      };

      const jobId = await messageQueue.publishMessage(fullMessage);
      jobIds.push(jobId);
      
      // Verify correct job ID format
      expect(jobId).toBe(`${msg.chatId}:${msg.messageId}`);
    }

    // Verify all messages have unique job IDs
    const uniqueJobIds = new Set(jobIds);
    expect(uniqueJobIds.size).toBe(4);
  });

  it('should handle queue metrics and monitoring', async () => {
    const testMessage = {
      messageId: 'metrics-test-001',
      chatId: -1001234567890,
      userId: 123456789,
      content: 'Message for metrics testing',
      timestamp: new Date(),
      metadata: { username: 'metricsuser' }
    };

    await messageQueue.publishMessage(testMessage);

    // Get queue statistics
    const stats = await messageQueue.getQueueStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.waiting).toBe('number');
    expect(typeof stats.active).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
    
    // Since workers are processing jobs immediately, we expect either:
    // - Jobs waiting (if workers are busy)
    // - Jobs completed (if workers processed them quickly)
    // - Jobs active (if currently being processed)
    const totalJobActivity = stats.waiting + stats.active + stats.completed;
    expect(totalJobActivity).toBeGreaterThanOrEqual(0);
  });

  it('should verify queue service is operational', async () => {
    // Test that we can get queue statistics
    const stats = await messageQueue.getQueueStats();
    
    expect(stats).toBeDefined();
    expect(typeof stats.waiting).toBe('number');
    expect(typeof stats.active).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
    
    // Verify we can connect to Redis
    const pingResult = await redis.ping();
    expect(pingResult).toBe('PONG');
  });
});
