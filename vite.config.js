import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', 
  build: {
    outDir: '../dist', // <--- THIS IS THE CRITICAL NEW LINE
    rollupOptions: {
      external: ['@google/genai']
    }
  }
});