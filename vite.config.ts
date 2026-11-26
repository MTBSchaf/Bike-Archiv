import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function classicScriptForFileManager(): Plugin {
  return {
    name: 'classic-script-for-file-manager',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) {
          return html;
        }
        return html
          .replace(/<script\s+type="module"\s+(?:crossorigin\s+)?src="([^"]+)"\s*><\/script>/g, '<script defer src="$1"></script>')
          .replace(/<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)">/g, '<link rel="stylesheet" href="$1">');
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), classicScriptForFileManager()],
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
