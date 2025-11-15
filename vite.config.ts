import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020', // <-- Added the missing comma here
    // This is the "dist" folder inside your project
    outDir: 'dist', 
    // This cleans the "dist" folder before each build
    emptyOutDir: true, 
    
    rollupOptions: {
      // This tells Vite you have multiple "main" files
      input: {
        // Just resolve from the project root (remove __dirname)
        'notes-main': resolve('src/notes-main.tsx'),
        'content': resolve('src/content.js'),
      },
      output: {
        // This stops Vite from adding hashes to the filenames
        // (CRITICAL for extensions, so the manifest can find them)
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});