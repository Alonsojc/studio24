import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Browser storage belongs to JSDOM, not Node's file-backed Web Storage.
    execArgv: ['--no-experimental-webstorage'],
    globals: true,
    exclude: ['node_modules/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
