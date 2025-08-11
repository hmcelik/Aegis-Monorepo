// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest will look for test files in the __tests__ directory
    include: ['__tests__/**/*.test.js'],
    // Clear mocks before each test
    clearMocks: true,
  },
});