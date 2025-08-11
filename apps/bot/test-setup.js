// Bot test setup
import { beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.ADMIN_USER_ID = '123456789';

beforeAll(() => {
  // Any global test setup for bot
});

afterAll(() => {
  // Any global test cleanup for bot
});
