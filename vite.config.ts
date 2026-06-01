import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    lib: {
      entry: {
        angular: 'src/adapters/angular.ts',
        core: 'src/engine/core.ts',
        index: 'src/adapters/index.ts',
        react: 'src/adapters/react.ts',
        vue: 'src/adapters/vue.ts',
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        'three/examples/jsm/controls/OrbitControls.js',
        'three/examples/jsm/postprocessing/EffectComposer.js',
        'three/examples/jsm/postprocessing/RenderPass.js',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js',
        'three/examples/jsm/postprocessing/ShaderPass.js',
        'three/examples/jsm/postprocessing/OutputPass.js',
      ],
    },
  },
});
