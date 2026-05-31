import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        angular: 'src/angular.ts',
        core: 'src/core.ts',
        index: 'src/index.ts',
        react: 'src/react.ts',
        vue: 'src/vue.ts',
        'presets/markets': 'src/presets/markets.tsx',
        'presets/markets/core': 'src/presets/markets-core.ts',
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'three', 'three/examples/jsm/controls/OrbitControls.js'],
    },
  },
});
