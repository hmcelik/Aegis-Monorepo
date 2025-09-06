import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@telegram-moderator/shared': resolve(__dirname, './packages/shared/src'),
      '@telegram-moderator/types': resolve(__dirname, './packages/types/src'),
      '@telegram-moderator/normalizer': resolve(__dirname, './packages/normalizer/src'),
      '@telegram-moderator/policy': resolve(__dirname, './packages/policy/src'),
      '@telegram-moderator/telemetry': resolve(__dirname, './packages/telemetry/src'),
    }
  },
  esbuild: {
    target: 'node18'
  }
});
