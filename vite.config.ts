import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    target: 'es2020',
    outDir: 'dist', 
    emptyOutDir: true, 
    
    rollupOptions: {
      input: {
        'notes-main': resolve('src/notes-main.tsx'),
        'background': resolve('src/background.ts')
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        format: 'es',
      },
    },
  },
});