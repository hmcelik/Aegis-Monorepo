import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import winston from 'winston';

// Create a simple logger for the queue
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export interface MessageJob {
  chatId: string;
  messageId: string;
  userId: string;
  tenantId?: string; // Tenant for budget tracking
  text?: string;
  media?: {
    type: string;
    fileId: string;
    caption?: string;
  };
  user?: {
    isNewUser?: boolean;
    joinDate?: Date;
  };
  timestamp: number;
}

export interface QueueConfig {
  redisUrl: string;
  defaultJobOptions?: {
    removeOnComplete?: number;
    removeOnFail?: number;
    attempts?: number;
    backoff?: {
      type: string;
      delay?: number;
    };
  };
}

export class MessageQueue {
  private queue: Queue<MessageJob>;
  private redis: Redis;

  constructor(config: QueueConfig) {
    const redisConfig = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    };

    this.redis = new Redis(redisConfig);

    this.queue = new Queue<MessageJob>('message-processing', {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...config.defaultJobOptions,
      },
    });

    // Set up event listeners for monitoring
    this.queue.on('error', (error: Error) => {
      logger.error('Queue error', { error: error.message, stack: error.stack });
    });

    this.queue.on('waiting', (job: Job<MessageJob>) => {
      logger.debug('Job waiting', { jobId: job.id });
    });
  }

  async publishMessage(messageData: MessageJob): Promise<string> {
    const jobId = `${messageData.chatId}:${messageData.messageId}`;

    try {
      const job = await this.queue.add('process-message', messageData, {
        jobId, // This ensures idempotency - duplicate jobIds are ignored
        priority: this.calculatePriority(messageData),
      });

      logger.info('Message published to queue', {
        jobId: job.id,
        chatId: messageData.chatId,
        messageId: messageData.messageId,
      });

      return job.id!;
    } catch (error) {
      logger.error('Failed to publish message', {
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private calculatePriority(messageData: MessageJob): number {
    // Higher priority for messages with media or from new users
    let priority = 0;

    if (messageData.media) {
      priority += 10;
    }

    // Add time-based priority (more recent = higher priority)
    const minutesOld = (Date.now() - messageData.timestamp) / (1000 * 60);
    priority += Math.max(0, 100 - minutesOld);

    return Math.floor(priority);
  }

  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
      this.queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + delayed.length,
    };
  }

  async pause() {
    await this.queue.pause();
    logger.warn('Queue paused');
  }

  async resume() {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  async getQueueStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  async close() {
    await this.queue.close();
    await this.redis.quit();
    logger.info('Queue connection closed');
  }
}

export function createShardedQueue(shardCount: number, config: QueueConfig): MessageQueue[] {
  const shards: MessageQueue[] = [];

  for (let i = 0; i < shardCount; i++) {
    const shardConfig = {
      ...config,
      redisUrl: `${config.redisUrl}?db=${i}`, // Use different Redis DB for each shard
    };
    shards.push(new MessageQueue(shardConfig));
  }

  return shards;
}

export function getShardForChat(chatId: string, shardCount: number): number {
  // Simple hash function for deterministic shard assignment
  let hash = 0;
  for (let i = 0; i < chatId.length; i++) {
    const char = chatId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % shardCount;
}
