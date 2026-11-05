import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/{game-config,game-rules,contracts,asset-pipeline,tactical-sim}/test/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'packages/core/test/**/*.test.ts',
            'apps/api/test/**/*.test.ts',
            'apps/battle-server/test/**/*.test.ts',
          ],
          environment: 'node',
          // Comparten una BD PostgreSQL real: sin paralelismo entre archivos.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_test',
          },
        },
      },
    ],
  },
});
