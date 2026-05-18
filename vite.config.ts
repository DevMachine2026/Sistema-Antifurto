import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('pdfjs-dist')) return 'pdfjs';
  if (id.includes('recharts')) return 'recharts';
  if (id.includes('lucide-react')) return 'icons';
  if (id.includes('@supabase')) return 'supabase';
  if (id.includes('/motion/') || id.includes('\\motion\\')) return 'vendor-misc';
  if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
  if (id.includes('react-markdown')) return 'vendor-misc';
  if (id.includes('micromark') || id.includes('mdast') || id.includes('hast-util') || id.includes('unist'))
    return 'vendor-misc';
  if (id.includes('decode-named-character-reference')) return 'vendor-misc';
  if (id.includes('property-information')) return 'vendor-misc';
  if (id.includes('style-to-js') || id.includes('style-to-object')) return 'vendor-misc';
  if (id.includes('papaparse')) return 'papaparse';
  if (id.includes('hls.js')) return 'hls';

  if (id.includes('scheduler')) return 'vendor';
  if (id.includes('node_modules/react-dom')) return 'vendor';
  if (id.includes('node_modules/react/')) return 'vendor';

  return 'vendor-misc';
}

export default defineConfig(({mode}) => ({
  plugins: [react(), tailwindcss()],
  define: {},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    // Polling deixa o dev muito lento em HD externo (/mnt). Ative só se o watcher falhar:
    // CHOKIDAR_USEPOLLING=true npm run dev
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
    },
  },
  build: {
    sourcemap: mode === 'development',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
