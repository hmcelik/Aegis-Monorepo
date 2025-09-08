// Database layer exports
export {
  DatabaseManager,
  BaseRepository,
  type DatabaseConnection,
  type DatabaseConfig,
  type Migration,
} from './src/db/index.js';

export { TenantRepository } from './src/db/repositories/TenantRepository.js';
export { DecisionRepository } from './src/db/repositories/DecisionRepository.js';
export { DualWriteAdapter } from './src/db/DualWriteAdapter.js';
export { initializeDatabase, registerMigrations } from './src/db/migrations.js';

// Cache exports
export { VerdictCache } from './src/cache/index.js';

// Rate limiting exports
export { RateLimiter } from './src/rate-limiter/index.js';

// Logger exports
export { logger } from './src/services/logger.js';
