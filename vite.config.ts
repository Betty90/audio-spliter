import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
        cors: true,
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:5001',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
          '/convert': {
            target: 'http://127.0.0.1:5001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'wavesurfer.js/dist/plugins/regions.js': path.resolve(__dirname, 'node_modules/wavesurfer.js/dist/plugins/regions.js'),
        }
      }
    };
});
