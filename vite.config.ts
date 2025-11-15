import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy'; // <-- Import the new plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // --- Add this plugin ---
    viteStaticCopy({
      targets: [
        {
          // Copy the polyfill to dist
          src: 'node_modules/webextension-polyfill/dist/browser-polyfill.js',
          dest: '.'
        },
        {
          // Copy the content script to dist (without bundling it)
          src: 'src/content.js',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    target: 'es2020',
    outDir: 'dist', 
    emptyOutDir: true, 
    
    rollupOptions: {
      // --- Change this ---
      // Only build the popup. The content script is now copied.
      input: {
        'notes-main': resolve('src/notes-main.tsx'),
        // 'content': resolve('src/content.js'), // <-- REMOVE THIS LINE
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        
        // --- Keep these lines ---
        // Since we only have one input, 'iife' will now work
        format: 'iife', 
        inlineDynamicImports: true,
      },
    },
  },
});