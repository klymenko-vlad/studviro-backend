import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const swcPlugin = swc.vite({ module: { type: 'es6' } });

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [swcPlugin],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/**/*.spec.ts'],
          clearMocks: true,
        },
      },
      {
        plugins: [swcPlugin],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'e2e',
          globals: true,
          environment: 'node',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          globalSetup: ['./test/setup/global-setup.ts'],
          setupFiles: ['./test/setup/setup-env.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/**/dto/**',
        'src/database/schema/**',
        'src/database/migrate.ts',
        'src/main.ts',
        'src/openapi.ts',
      ],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
