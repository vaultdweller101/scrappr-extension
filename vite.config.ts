import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
    // We removed viteStaticCopy
  ],
  build: {
    target: 'es2020',
    outDir: 'dist', 
    emptyOutDir: true, 
    
    rollupOptions: {
      // We only have one input now: the popup
      input: {
        'notes-main': resolve('src/notes-main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        format: 'iife', 
        inlineDynamicImports: true,
      },
    },
  },
});