/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL?.trim()
  if (mode === 'development' && !apiTarget) {
    console.warn('[vite] Set VITE_API_URL in client/.env for the /api proxy target.')
  }

  return {
    plugins: [react()],
    server: {
      ...(apiTarget
        ? {
            proxy: {
              '/api': {
                target: apiTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: './coverage',
        // Only files executed during tests; avoids listing the whole app at 0%.
        all: false,
        exclude: [
          '**/*.d.ts',
          '**/main.tsx',
          '**/vite-env.d.ts',
          '**/*.{test,spec}.{ts,tsx}',
        ],
      },
    },
  }
})
