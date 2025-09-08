import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      '__tests__/bot/**/*.test.js',
      '__tests__/services/**/*.test.js',
      '__tests__/database/performance.test.js',
    ],
    exclude: ['__tests__/database/enhanced-analytics.test.js'],
    clearMocks: true,
    environment: 'node',
    globals: true,
    setupFiles: ['apps/bot/test-setup.js'],
    root: '../../', // Set root to monorepo root so paths resolve correctly
  },
  resolve: {
    alias: {
      '@telegram-moderator/shared': path.resolve(__dirname, '../../packages/shared'),
      'apps/bot/src': path.resolve(__dirname, './src'),
      'packages/shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
});
