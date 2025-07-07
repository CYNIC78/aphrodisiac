import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src', // <--- THIS IS THE CRITICAL NEW LINE
  build: {
    rollupOptions: {
      external: ['@google/genai']
    }
  }
});