/**
 * AEG-104: Shard processing by chat hash to avoid hotspot starvation
 * 
 * This module implements deterministic chat-based sharding to ensure that:
 * 1. Jobs are routed to N named queues/partitions based on hash(chatId) % N
 * 2. Each partition has independent concurrency (hot chats cannot block others)
 * 3. Partition count is configurable at runtime
 * 4. Load balancing prevents any single chat from monopolizing resources
 */

import { Worker, Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { MessageJob } from '@telegram-moderator/shared/src/queue/messageQueue';

// Simple logger for the sharding module
const logger = {
  info: (message: string, meta?: any) => console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : ''),
  warn: (message: string, meta?: any) => console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : ''),
  error: (message: string, meta?: any) => console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : ''),
};

export interface ShardingConfig {
  partitionCount: number;
  concurrency: number;
  redisConfig: {
    host: string;
    port: number;
    maxRetriesPerRequest?: number | null;
    retryDelayOnFailover?: number;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
  };
  queuePrefix?: string;
  maxConcurrencyPerShard?: number;
}

export interface ShardMetrics {
  shardId: number;
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  throughputPerMinute: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}

export interface ShardingMetrics {
  totalShards: number;
  totalConcurrency: number;
  distributionFairness: number; // 0-1, where 1 is perfectly balanced
  hotspotDetected: boolean;
  shards: ShardMetrics[];
}

/**
 * Deterministic hash function for chat-based sharding
 * Uses FNV-1a hash algorithm for better distribution
 */
export function hashChatId(chatId: string): number {
  let hash = 2166136261; // FNV offset basis (32-bit)
  
  for (let i = 0; i < chatId.length; i++) {
    hash ^= chatId.charCodeAt(i);
    hash *= 16777619; // FNV prime (32-bit)
    hash = hash >>> 0; // Convert to unsigned 32-bit integer
  }
  
  return hash;
}

/**
 * Get the shard index for a given chat ID
 */
export function getShardForChat(chatId: string, partitionCount: number): number {
  return hashChatId(chatId) % partitionCount;
}

/**
 * Validates shard configuration for optimal performance
 */
export function validateShardingConfig(config: ShardingConfig): string[] {
  const issues: string[] = [];
  
  if (config.partitionCount < 1) {
    issues.push('Partition count must be at least 1');
  }
  
  if (config.partitionCount > 64) {
    issues.push('Partition count should not exceed 64 for optimal performance');
  }
  
  if (config.concurrency < config.partitionCount) {
    issues.push('Total concurrency should be at least equal to partition count');
  }
  
  const concurrencyPerShard = Math.floor(config.concurrency / config.partitionCount);
  if (concurrencyPerShard < 1) {
    issues.push('Concurrency per shard would be less than 1, increase total concurrency');
  }
  
  if (config.maxConcurrencyPerShard && config.maxConcurrencyPerShard < concurrencyPerShard) {
    issues.push('Max concurrency per shard is less than calculated concurrency per shard');
  }
  
  return issues;
}

/**
 * Manages sharded message processing to prevent hotspot starvation
 */
export class ShardManager {
  private config: ShardingConfig;
  private workers: Worker<MessageJob>[] = [];
  private queues: Queue<MessageJob>[] = [];
  private metrics: Map<number, ShardMetrics> = new Map();
  private startTime: Date = new Date();
  private messageProcessor?: (job: MessageJob) => Promise<void>;
  
  constructor(config: ShardingConfig, messageProcessor?: (job: MessageJob) => Promise<void>) {
    this.config = config;
    this.messageProcessor = messageProcessor;
    this.validateConfiguration();
    this.initializeShards();
  }
  
  private validateConfiguration(): void {
    const issues = validateShardingConfig(this.config);
    if (issues.length > 0) {
      throw new Error(`Invalid sharding configuration: ${issues.join(', ')}`);
    }
  }
  
  private initializeShards(): void {
    const queuePrefix = this.config.queuePrefix || 'message-processing';
    const concurrencyPerShard = Math.max(1, Math.floor(this.config.concurrency / this.config.partitionCount));
    const maxConcurrencyPerShard = this.config.maxConcurrencyPerShard || concurrencyPerShard;
    
    logger.info('Initializing sharded message processing', {
      partitionCount: this.config.partitionCount,
      totalConcurrency: this.config.concurrency,
      concurrencyPerShard: Math.min(concurrencyPerShard, maxConcurrencyPerShard),
      queuePrefix
    });
    
    for (let shardId = 0; shardId < this.config.partitionCount; shardId++) {
      const queueName = `${queuePrefix}-${shardId}`;
      
      // Create queue for this shard
      const queue = new Queue<MessageJob>(queueName, {
        connection: this.config.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });
      
      // Create worker for this shard
      const worker = new Worker<MessageJob>(
        queueName,
        async (job: Job<MessageJob>) => this.processMessage(job, shardId),
        {
          connection: this.config.redisConfig,
          concurrency: Math.min(concurrencyPerShard, maxConcurrencyPerShard),
        }
      );
      
      this.setupWorkerEventHandlers(worker, shardId, queueName);
      
      this.workers.push(worker);
      this.queues.push(queue);
      
      // Initialize metrics for this shard
      this.metrics.set(shardId, {
        shardId,
        queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        throughputPerMinute: 0,
        averageProcessingTime: 0,
      });
      
      logger.info('Shard initialized', { 
        shardId, 
        queueName, 
        concurrency: Math.min(concurrencyPerShard, maxConcurrencyPerShard)
      });
    }
  }
  
  private setupWorkerEventHandlers(worker: Worker<MessageJob>, shardId: number, queueName: string): void {
    worker.on('completed', (job: Job<MessageJob>) => {
      const processingTime = Date.now() - job.timestamp;
      
      logger.info('Job completed', {
        jobId: job.id,
        shardId,
        queueName,
        chatId: job.data.chatId,
        messageId: job.data.messageId,
        processingTime
      });
      
      this.updateShardMetrics(shardId, 'completed', processingTime);
    });

    worker.on('failed', (job: Job<MessageJob> | undefined, err: Error) => {
      logger.error('Job failed', {
        jobId: job?.id,
        shardId,
        queueName,
        chatId: job?.data?.chatId,
        messageId: job?.data?.messageId,
        error: err.message,
        attempts: job?.attemptsMade
      });
      
      this.updateShardMetrics(shardId, 'failed');
    });

    worker.on('error', (error: Error) => {
      logger.error('Worker error', { 
        shardId, 
        queueName, 
        error: error.message 
      });
    });

    worker.on('stalled', (jobId: string) => {
      logger.warn('Job stalled', { 
        jobId, 
        shardId, 
        queueName 
      });
    });
  }
  
  /**
   * Process a message job with shard-specific handling
   */
  private async processMessage(job: Job<MessageJob>, shardId: number): Promise<void> {
    const messageData = job.data;
    const startTime = Date.now();
    
    // Verify this job is on the correct shard
    const expectedShard = getShardForChat(messageData.chatId, this.config.partitionCount);
    if (expectedShard !== shardId) {
      logger.warn('Job on incorrect shard', {
        jobId: job.id,
        chatId: messageData.chatId,
        expectedShard,
        actualShard: shardId
      });
    }
    
    logger.info('Processing message in shard', {
      jobId: job.id,
      shardId,
      chatId: messageData.chatId,
      messageId: messageData.messageId,
      expectedShard
    });
    
    try {
      // Use the provided message processor if available, otherwise simulate
      if (this.messageProcessor) {
        await this.messageProcessor(messageData);
      } else {
        await this.simulateMessageProcessing(messageData);
      }
      
      const processingTime = Date.now() - startTime;
      logger.info('Message processed successfully', {
        jobId: job.id,
        shardId,
        chatId: messageData.chatId,
        processingTime
      });
      
    } catch (error) {
      logger.error('Message processing failed', {
        jobId: job.id,
        shardId,
        chatId: messageData.chatId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Simulate message processing (placeholder for actual implementation)
   */
  private async simulateMessageProcessing(messageData: MessageJob): Promise<void> {
    // Simulate processing time based on message content
    const baseDelay = 50; // Base 50ms processing time
    const contentDelay = messageData.text ? Math.min(messageData.text.length * 2, 200) : 0;
    const totalDelay = baseDelay + contentDelay;
    
    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }
  
  /**
   * Add a message to the appropriate shard based on chat ID
   */
  async addMessage(messageData: MessageJob): Promise<string> {
    const shardId = getShardForChat(messageData.chatId, this.config.partitionCount);
    const queue = this.queues[shardId];
    
    if (!queue) {
      throw new Error(`Shard ${shardId} not initialized`);
    }
    
    const jobId = `${messageData.chatId}:${messageData.messageId}`;
    
    try {
      const job = await queue.add('process-message', messageData, {
        jobId, // Ensures idempotency
        priority: this.calculatePriority(messageData),
      });

      logger.info('Message added to shard', {
        jobId: job.id,
        shardId,
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        queueName: queue.name
      });

      return job.id!;
    } catch (error) {
      logger.error('Failed to add message to shard', {
        shardId,
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Calculate job priority (higher priority = processed first)
   */
  private calculatePriority(messageData: MessageJob): number {
    // Higher priority for:
    // 1. Admin messages (if user is admin)
    // 2. Commands (messages starting with /)
    // 3. Recent messages
    
    let priority = 0;
    
    // Command messages get higher priority
    if (messageData.text?.startsWith('/')) {
      priority += 10;
    }
    
    // Recent messages get slightly higher priority
    const messageAge = Date.now() - messageData.timestamp;
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (messageAge < maxAge) {
      priority += Math.floor((maxAge - messageAge) / 1000 / 60); // 1 point per minute
    }
    
    return priority;
  }
  
  /**
   * Update metrics for a specific shard
   */
  private updateShardMetrics(shardId: number, event: 'completed' | 'failed', processingTime?: number): void {
    const metrics = this.metrics.get(shardId);
    if (!metrics) return;
    
    if (event === 'completed') {
      metrics.completed++;
      metrics.lastProcessedAt = new Date();
      
      if (processingTime !== undefined) {
        // Update running average of processing time
        const totalProcessed = metrics.completed;
        const currentAvg = metrics.averageProcessingTime;
        metrics.averageProcessingTime = (currentAvg * (totalProcessed - 1) + processingTime) / totalProcessed;
      }
    } else if (event === 'failed') {
      metrics.failed++;
    }
    
    // Calculate throughput per minute
    const uptimeMinutes = (Date.now() - this.startTime.getTime()) / (1000 * 60);
    metrics.throughputPerMinute = uptimeMinutes > 0 ? metrics.completed / uptimeMinutes : 0;
  }
  
  /**
   * Get comprehensive metrics for all shards
   */
  async getMetrics(): Promise<ShardingMetrics> {
    // Update current queue states
    for (let i = 0; i < this.queues.length; i++) {
      const queue = this.queues[i];
      const metrics = this.metrics.get(i);
      
      if (metrics && queue) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        metrics.waiting = waiting.length;
        metrics.active = active.length;
        metrics.completed = completed.length;
        metrics.failed = failed.length;
      }
    }
    
    const shardMetrics = Array.from(this.metrics.values());
    
    // Calculate distribution fairness (coefficient of variation)
    const throughputs = shardMetrics.map(m => m.throughputPerMinute);
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    const variance = throughputs.reduce((sum, tp) => sum + Math.pow(tp - avgThroughput, 2), 0) / throughputs.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = avgThroughput > 0 ? standardDeviation / avgThroughput : 0;
    const distributionFairness = Math.max(0, 1 - coefficientOfVariation);
    
    // Detect hotspots (any shard with >3x average throughput)
    const hotspotDetected = throughputs.some(tp => tp > avgThroughput * 3);
    
    return {
      totalShards: this.config.partitionCount,
      totalConcurrency: this.config.concurrency,
      distributionFairness,
      hotspotDetected,
      shards: shardMetrics
    };
  }
  
  /**
   * Gracefully shutdown all workers and queues
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down shard manager', {
      shardCount: this.workers.length
    });
    
    // Close all workers
    await Promise.all(this.workers.map(worker => worker.close()));
    
    // Close all queues
    await Promise.all(this.queues.map(queue => queue.close()));
    
    logger.info('Shard manager shutdown complete');
  }
  
  /**
   * Get the shard ID for a specific chat (useful for debugging)
   */
  getShardForChat(chatId: string): number {
    return getShardForChat(chatId, this.config.partitionCount);
  }
  
  /**
   * Get statistics about hash distribution (for testing and validation)
   */
  async getHashDistributionStats(sampleChatIds: string[]): Promise<{
    distribution: number[];
    fairnessScore: number;
    maxDeviation: number;
  }> {
    const distribution = new Array(this.config.partitionCount).fill(0);
    
    for (const chatId of sampleChatIds) {
      const shard = getShardForChat(chatId, this.config.partitionCount);
      distribution[shard]++;
    }
    
    const expectedPerShard = sampleChatIds.length / this.config.partitionCount;
    const deviations = distribution.map(count => Math.abs(count - expectedPerShard));
    const maxDeviation = Math.max(...deviations);
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const fairnessScore = Math.max(0, 1 - (avgDeviation / expectedPerShard));
    
    return {
      distribution,
      fairnessScore,
      maxDeviation
    };
  }
}
