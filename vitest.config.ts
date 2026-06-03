import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.browser.test.ts', 'src/vite-env.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        branches: 55,
        functions: 60,
        lines: 65,
        statements: 65,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'examples/shared/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        test: {
          name: 'react',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright({
              contextOptions: {
                deviceScaleFactor: 1,
                reducedMotion: 'reduce',
              },
              launchOptions: {
                args: ['--use-gl=angle', '--use-angle=swiftshader'],
              },
            }),
            headless: true,
            screenshotDirectory: 'temp/vitest-browser-screenshots',
            instances: [
              {
                browser: 'chromium',
                viewport: {
                  width: 960,
                  height: 640,
                },
              },
            ],
          },
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
