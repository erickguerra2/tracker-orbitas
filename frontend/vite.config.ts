import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// El proxy evita problemas de CORS en desarrollo: el frontend llama a
// rutas relativas (/api/...) y Vite las reenvía al backend FastAPI.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },
});
