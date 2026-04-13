import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
let gitSha = 'dev';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch { /* not a git checkout or git missing — keep 'dev' */ }
const APP_VERSION = `${pkg.version || '0.0.0'}+${gitSha}`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Stable vendor libs — cached long-term separately from app code
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'node',
  },
});
