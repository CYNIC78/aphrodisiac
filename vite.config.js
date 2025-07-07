import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['@google/genai'] // THIS TELLS VITE NOT TO BUNDLE @google/genai
    }
  }
});