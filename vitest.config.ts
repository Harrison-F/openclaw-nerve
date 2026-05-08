import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: ROOT_DIR,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.resolve(ROOT_DIR, 'src/test/setup.ts')],
    exclude: [
      'node_modules/**',
      'server-dist/**',  // Exclude compiled server output (contains duplicate .test.js files)
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'server-dist/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.{ts,tsx}',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
