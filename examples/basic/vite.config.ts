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
        find: 'galaxy-nodes/presets/initiatives',
        replacement: fileURLToPath(new URL('../shared/presets/initiatives.tsx', import.meta.url)),
      },
      {
        find: 'galaxy-nodes',
        replacement: fileURLToPath(new URL('../../src/adapters/index.ts', import.meta.url)),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    emptyOutDir: true,
    outDir: `${repoRoot}/examples/basic/dist`,
  },
});
