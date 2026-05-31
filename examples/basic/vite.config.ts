import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const exampleRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: exampleRoot,
  resolve: {
    alias: [
      {
        find: 'galaxy-nodes/styles.css',
        replacement: fileURLToPath(new URL('../../src/styles.css', import.meta.url)),
      },
      {
        find: 'galaxy-nodes/presets/markets',
        replacement: fileURLToPath(new URL('../../src/presets/markets.tsx', import.meta.url)),
      },
      {
        find: 'galaxy-nodes',
        replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: `${repoRoot}/examples/basic/dist`,
    emptyOutDir: true,
  },
});
