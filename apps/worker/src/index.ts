import express from 'express';
import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { MessageJob } from '@telegram-moderator/shared/src/queue/messageQueue';
import { outboxManager } from '@telegram-moderator/shared/src/outbox';
import { PolicyEngine } from '@telegram-moderator/policy';
import { normalize } from '@telegram-moderator/normalizer';
import { ShardManager, ShardingConfig, ShardingMetrics } from './sharding';
import { budgetEnforcer, DegradeMode } from './budget';
import winston from 'winston';

// Create a simple logger for the worker
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

interface WorkerConfig {
  redisUrl: string;
  concurrency: number;
  partitions: number;
  port: number;
  maxConcurrencyPerShard?: number;
}

class MessageWorkerService {
  private shardManager!: ShardManager;
  private app: express.Application;
  private config: WorkerConfig;
  private policyEngine: PolicyEngine;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.app = express();
    this.policyEngine = new PolicyEngine();
    this.setupHealthEndpoints();
    this.initializeShardedProcessing();
  }

  private setupHealthEndpoints() {
    this.app.get('/healthz', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.get('/readyz', async (req, res) => {
      try {
        // Check Redis connectivity
        const redis = new Redis({
          host: 'localhost',
          port: 6379,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
        });
        await redis.ping();
        await redis.quit();

        // Check shard manager status
        const metrics = await this.shardManager.getMetrics();
        const healthyShards = metrics.shards.filter(shard => 
          shard.waiting >= 0 && shard.active >= 0
        ).length;
        
        if (healthyShards === metrics.totalShards) {
          res.json({ 
            status: 'ready', 
            timestamp: new Date().toISOString(),
            shards: healthyShards,
            totalShards: metrics.totalShards
          });
        } else {
          res.status(503).json({ 
            status: 'not ready', 
            reason: 'some shards not healthy',
            healthyShards,
            totalShards: metrics.totalShards
          });
        }
      } catch (error) {
        res.status(503).json({ 
          status: 'not ready', 
          reason: 'redis connection failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.getMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get metrics',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    this.app.get('/sharding', async (req, res) => {
      try {
        const shardingMetrics = await this.shardManager.getMetrics();
        res.json(shardingMetrics);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get sharding metrics',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    this.app.get('/distribution/:chatId', (req, res) => {
      try {
        const chatId = req.params.chatId;
        const shardId = this.shardManager.getShardForChat(chatId);
        res.json({
          chatId,
          shardId,
          totalShards: this.config.partitions
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get distribution info',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private initializeShardedProcessing() {
    const shardingConfig: ShardingConfig = {
      partitionCount: this.config.partitions,
      concurrency: this.config.concurrency,
      maxConcurrencyPerShard: this.config.maxConcurrencyPerShard,
      redisConfig: {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      queuePrefix: 'message-processing'
    };

    // Create ShardManager with message processor callback
    this.shardManager = new ShardManager(shardingConfig, (messageData) => this.processMessage(messageData));
    
    logger.info('Sharded message processing initialized', {
      partitions: this.config.partitions,
      totalConcurrency: this.config.concurrency,
      maxConcurrencyPerShard: this.config.maxConcurrencyPerShard
    });
  }

  // This method is called by the ShardManager for message processing
  async processMessage(messageData: MessageJob): Promise<void> {
    const startTime = Date.now();
    const tenantId = messageData.tenantId || 'default'; // Extract tenant from message data

    logger.info('Processing message', {
      chatId: messageData.chatId,
      messageId: messageData.messageId,
      tenantId,
      hasText: !!messageData.text,
      hasMedia: !!messageData.media
    });

    try {
      // Build message context for budget decisions
      const messageContext = {
        hasLinks: messageData.text ? /https?:\/\//.test(messageData.text) : false,
        isNewUser: messageData.user?.isNewUser || false,
        userJoinDate: messageData.user?.joinDate,
        messageLength: messageData.text?.length || 0
      };

      // Get processing strategy based on budget status
      const strategy = await budgetEnforcer.getProcessingStrategy(tenantId, messageContext);
      
      logger.info('Processing strategy determined', {
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        tenantId,
        useAI: strategy.useAI,
        useFastPath: strategy.useFastPath,
        reason: strategy.reason
      });

      // Process text content if available
      if (messageData.text) {
        const normalizedContent = normalize(messageData.text);
        let policyResult;
        let aiUsage = null;

        if (strategy.useAI) {
          // Full AI processing with budget tracking
          const aiStartTime = Date.now();
          policyResult = this.policyEngine.evaluate(messageData.text);
          const aiEndTime = Date.now();

          // Estimate AI usage (this would be replaced with actual AI API calls)
          aiUsage = {
            tokens: Math.ceil(messageData.text.length / 4), // Rough token estimate
            cost: 0.001, // Placeholder cost
            model: 'gpt-3.5-turbo',
            operation: 'moderation',
            timestamp: new Date()
          };

          // Record AI usage for budget tracking
          await budgetEnforcer.recordUsage(tenantId, aiUsage);

          logger.info('AI policy evaluation completed', {
            chatId: messageData.chatId,
            messageId: messageData.messageId,
            tenantId,
            verdict: policyResult.verdict,
            scores: policyResult.scores,
            rulesMatched: policyResult.rulesMatched,
            aiProcessingTime: aiEndTime - aiStartTime,
            estimatedTokens: aiUsage.tokens
          });
        } else {
          // Fast-path rules only (no AI)
          policyResult = this.policyEngine.evaluateFastPath(messageData.text);
          
          logger.info('Fast-path evaluation completed', {
            chatId: messageData.chatId,
            messageId: messageData.messageId,
            tenantId,
            verdict: policyResult.verdict,
            reason: strategy.reason
          });
        }

        // Handle different verdicts
        if (policyResult.verdict === 'block') {
          await this.handleBlockAction(messageData, policyResult.reason);
        } else if (policyResult.verdict === 'review') {
          await this.handleReviewAction(messageData, policyResult.reason);
        }
        // 'allow' verdict needs no action
      }

      const processingTime = Date.now() - startTime;
      logger.info('Message processing completed', {
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        tenantId,
        processingTime,
        strategyUsed: strategy.reason
      });

    } catch (error) {
      logger.error('Message processing failed', {
        chatId: messageData.chatId,
        messageId: messageData.messageId,
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async handleBlockAction(messageData: MessageJob, reason: string): Promise<void> {
    const chatId = parseInt(messageData.chatId);
    
    logger.info('Handling block action', {
      chatId,
      messageId: messageData.messageId,
      reason
    });

    // Create delete message action through outbox
    const actionId = await outboxManager.createAction(
      chatId,
      messageData.messageId,
      'delete',
      { reason }
    );

    // Process the action immediately
    const result = await outboxManager.processAction(actionId);
    
    if (!result.success) {
      logger.error('Failed to process delete action', {
        chatId,
        messageId: messageData.messageId,
        actionId,
        error: result.error
      });
    }
  }

  private async handleReviewAction(messageData: MessageJob, reason: string): Promise<void> {
    const chatId = parseInt(messageData.chatId);
    
    logger.info('Handling review action', {
      chatId,
      messageId: messageData.messageId,
      reason
    });

    // Create warn action through outbox (softer action for review)
    const actionId = await outboxManager.createAction(
      chatId,
      messageData.messageId,
      'warn',
      { 
        reason,
        userId: parseInt(messageData.userId),
        warningLevel: 'low'
      }
    );

    // Process the action immediately
    const result = await outboxManager.processAction(actionId);
    
    if (!result.success) {
      logger.error('Failed to process warn action', {
        chatId,
        messageId: messageData.messageId,
        actionId,
        error: result.error
      });
    }
  }

  private async getMetrics() {
    const shardingMetrics = await this.shardManager.getMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      sharding: shardingMetrics,
      config: {
        partitions: this.config.partitions,
        totalConcurrency: this.config.concurrency,
        maxConcurrencyPerShard: this.config.maxConcurrencyPerShard
      }
    };
  }

  async addMessage(messageData: MessageJob): Promise<string> {
    return await this.shardManager.addMessage(messageData);
  }

  async start() {
    const server = this.app.listen(this.config.port, () => {
      logger.info('Worker service started', {
        port: this.config.port,
        partitions: this.config.partitions,
        concurrency: this.config.concurrency
      });
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      // Stop shard manager
      await this.shardManager.shutdown();
      
      // Close HTTP server
      server.close(() => {
        logger.info('Worker service shut down complete');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Configuration from environment
const config: WorkerConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10'),
  partitions: parseInt(process.env.WORKER_PARTITIONS || '4'),
  port: parseInt(process.env.WORKER_PORT || '3001'),
  maxConcurrencyPerShard: process.env.MAX_CONCURRENCY_PER_SHARD ? 
    parseInt(process.env.MAX_CONCURRENCY_PER_SHARD) : undefined,
};

// Start the service
const workerService = new MessageWorkerService(config);
workerService.start().catch((error) => {
  logger.error('Failed to start worker service', { error: error.message });
  process.exit(1);
});

export { MessageWorkerService };
