# Aegis Integration Guide

## Getting Started with EP1 - Queue & Idempotency

This guide will help you start integrating the task board items, beginning with EP1.

### Prerequisites Completed ✅

1. **New Package Structure**: Created new packages:
   - `@telegram-moderator/worker` - BullMQ worker service
   - `@telegram-moderator/normalizer` - Text/URL normalization
   - `@telegram-moderator/policy` - Rule engine
   - `@telegram-moderator/telemetry` - OpenTelemetry integration
   - `@telegram-moderator/types` - Shared TypeScript types

2. **Dependencies**: Added BullMQ, Redis, OpenTelemetry packages

3. **Infrastructure**: Docker Compose with Redis, PostgreSQL, Jaeger

### Next Steps for Integration

#### 1. Start Development Environment

```bash
# Start infrastructure services
docker-compose up -d

# Install and build packages
pnpm install
pnpm build

# Start the worker service
pnpm dev:worker
```

#### 2. Integrate Queue Publishing in Bot (AEG-101)

Add queue publishing to your existing bot service:

```typescript
// In apps/bot/src/handlers/messageHandler.js
import { MessageQueue } from '@telegram-moderator/shared/src/queue/messageQueue.js';

const queue = new MessageQueue({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
});

// In your message handler:
await queue.publishMessage({
  chatId: msg.chat.id.toString(),
  messageId: msg.message_id.toString(),
  userId: msg.from.id.toString(),
  text: msg.text,
  timestamp: Date.now(),
});
```

#### 3. Test the Integration

```bash
# Run unit tests
pnpm test:unit

# Run worker tests
pnpm test:worker

# Check queue metrics
curl http://localhost:3001/metrics
```

#### 4. Next Implementation Priorities

1. **AEG-102**: Implement idempotent action execution
2. **AEG-103**: Add Telegram API rate limiting
3. **AEG-104**: Implement chat sharding

### File Structure Created

```
apps/worker/
├── src/
│   └── index.ts                 # Worker service implementation
├── package.json
└── tsconfig.json

packages/
├── normalizer/
│   ├── src/
│   │   ├── index.ts            # Text normalization
│   │   └── url.ts              # URL utilities
│   └── package.json
├── policy/
│   ├── src/
│   │   ├── index.ts            # Policy engine
│   │   └── keywords.ts         # Keyword matching
│   └── package.json
├── telemetry/
│   ├── src/
│   │   └── index.ts            # OpenTelemetry setup
│   └── package.json
├── types/
│   ├── src/
│   │   ├── index.ts            # Core types
│   │   ├── api.ts              # API types
│   │   └── telegram.ts         # Telegram types
│   └── package.json
└── shared/
    └── src/queue/
        └── messageQueue.ts     # BullMQ implementation
```

### Configuration Files

- `docker-compose.yml` - Redis, PostgreSQL, Jaeger services
- `tsconfig.base.json` - Base TypeScript configuration
- `vitest.config.ts` - Test configuration
- Updated `package.json` scripts for new services

### Current Status

✅ **Infrastructure Setup**: Redis, PostgreSQL, Jaeger services ready  
✅ **Package Structure**: All new packages created with basic implementations  
✅ **Worker Service**: Basic BullMQ worker with health endpoints  
✅ **Queue Implementation**: Message publishing with idempotency  
✅ **Type Safety**: Shared types across packages

🚧 **Next**: Integration with existing bot and API services  
🚧 **Testing**: Complete test suite for queue functionality  
🚧 **Monitoring**: OpenTelemetry integration in all services

### Development Commands

```bash
# Start all services
pnpm dev

# Start individual services
pnpm dev:worker    # Worker service on :3001
pnpm dev:api       # API service on :3000
pnpm dev:bot       # Bot service

# Testing
pnpm test          # All tests
pnpm test:unit     # Unit tests only
pnpm test:worker   # Worker tests only

# Infrastructure
docker-compose up -d     # Start Redis/PostgreSQL/Jaeger
docker-compose down      # Stop services
```

### Monitoring URLs

- **Jaeger UI**: http://localhost:16686
- **Worker Health**: http://localhost:3001/healthz
- **Worker Metrics**: http://localhost:3001/metrics

The foundation for reliability-first development is now in place! Continue with the integration steps above to implement the complete EP1 functionality.
