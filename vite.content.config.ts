import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    // IMPORTANT: Do not empty the directory, or you'll delete the React app we just built!
    emptyOutDir: false, 
    outDir: 'dist',
    rollupOptions: {
      input: {
        'continuous-popup': resolve('src/continuous-popup.ts')
      },
      output: {
        entryFileNames: '[name].js',
        // 'iife' bundles everything into one function. No imports = No errors.
        format: 'iife', 
      }
    }
  }
});