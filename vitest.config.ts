import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      shared: path.resolve(__dirname, 'shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'shared/test/**/*.test.ts',
      'server/test/**/*.test.ts',
      'client/test/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['shared/src/**/*.ts'],
      exclude: ['shared/src/index.ts', 'shared/src/sim/index.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
