// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // Correct plugin import
import path from 'path'; // Ensure path is imported if used

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ // This is the correct plugin to use
      globals: true,
      buffer: true,
      process: true,
    }),
  ],
  build: {
    sourcemap: false, // Set this to false
  }
});