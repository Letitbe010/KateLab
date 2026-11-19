/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /katelab/ (repository name).
export default defineConfig({
  base: '/katelab/',
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
