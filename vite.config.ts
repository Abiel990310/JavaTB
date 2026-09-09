import { defineConfig } from 'vite';
import { bookPlugin } from './build/plugin.ts';
import { compilePlugin } from './server/plugin.ts';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the deploy workflow
  // sets CPPTB_BASE. Everything else defaults to the domain root.
  base: process.env.CPPTB_BASE ?? '/',
  plugins: [bookPlugin(), compilePlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: { input: 'index.html' },
    target: 'es2022',
  },
  server: { port: 5173 },
});
