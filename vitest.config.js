// vitest.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Vitest will look for test files in the __tests__ directory
    include: ['__tests__/**/*.test.js'],
    // Clear mocks before each test
    clearMocks: true,
    // Use node environment for integration tests
    environment: 'node',
    // Global test timeout
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@telegram-moderator/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@telegram-moderator/types': path.resolve(__dirname, 'packages/types/src'),
      '@telegram-moderator/normalizer': path.resolve(__dirname, 'packages/normalizer/src'),
      '@telegram-moderator/policy': path.resolve(__dirname, 'packages/policy/src'),
      '@telegram-moderator/telemetry': path.resolve(__dirname, 'packages/telemetry/src'),
    },
  },
});