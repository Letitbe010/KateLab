/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /KateLab/ (repository name, case-sensitive).
export default defineConfig({
  base: '/KateLab/',
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
