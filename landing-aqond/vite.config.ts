import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      /** บังคับ React ชุดเดียว — ถ้ามี react สองชุดจะ white screen + Invalid hook call */
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      /** หลีกเลี่ยง CORS: เบราว์เซอร์เรียก /api/* ที่ origin เดียวกับ Vite แล้วส่งต่อไป api.aqond.com */
      proxy: {
        '^/api': {
          target: 'https://api.aqond.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
