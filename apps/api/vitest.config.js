import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      '__tests__/api/**/*.test.js',
      '__tests__/services/**/*.test.js',
      '__tests__/database/**/*.test.js',
    ],
    clearMocks: true,
    environment: 'node',
    globals: true,
    setupFiles: ['apps/api/test-setup.js'],
    root: '../../', // Set root to monorepo root so paths resolve correctly
  },
  resolve: {
    alias: {
      '@telegram-moderator/shared': path.resolve(__dirname, '../../packages/shared'),
      'apps/api/src': path.resolve(__dirname, './src'),
      'packages/shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
});
