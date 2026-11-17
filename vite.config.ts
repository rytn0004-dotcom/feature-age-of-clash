import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      // AI Studio / Cloud Run proxies expect 0.0.0.0
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0',
      strictPort: false,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: disableHmr ? false : true,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: disableHmr ? null : undefined,
    },
    preview: {
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0',
    },
  };
});
