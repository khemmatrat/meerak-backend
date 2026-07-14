import path from 'path';
import { readFileSync, copyFileSync, existsSync } from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/** index.html โหลด /themes.css ฯลฯ — ต้องอยู่ใน public ตอน deploy; ซิงค์จากราก mobile ทุกครั้งที่ build/dev เริ่ม */
const THEME_CSS_LINKED_FROM_HTML = [
  'globals.css',
  'themes.css',
  'training-themes.css',
  'job-detail-clean-pro.css',
] as const;

function syncThemeCssToPublicPlugin(mobileRoot: string): Plugin {
  return {
    name: 'sync-theme-css-to-public',
    buildStart() {
      const pubDir = path.join(mobileRoot, 'public');
      for (const file of THEME_CSS_LINKED_FROM_HTML) {
        const src = path.join(mobileRoot, file);
        const dest = path.join(pubDir, file);
        try {
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        } catch (e) {
          console.warn('[vite] sync-theme-css-to-public:', file, e);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = path.resolve(__dirname, '..');
  const mobileRoot = __dirname;
  // production: root .env.production ทับ mobile/.env (กัน localhost ใน mobile ทับ staging จริง)
  // development: root ก่อน แล้ว mobile ทับ — ใช้ localhost ใน mobile/.env ตอน dev
  const merged =
    mode === 'production'
      ? { ...loadEnv(mode, mobileRoot, ''), ...loadEnv(mode, root, '') }
      : { ...loadEnv(mode, root, ''), ...loadEnv(mode, mobileRoot, '') };
  const baseUrl = './';
  const viteDefines = Object.fromEntries(
    Object.entries(merged)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])
  );

  return {
    // ปิดการโหลด .env ซ้ำ — ฝังเฉพาะค่าที่ merge แล้ว (root + mobile)
    envDir: false,
    base: baseUrl,
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [syncThemeCssToPublicPlugin(mobileRoot), react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(undefined),
      'process.env.GEMINI_API_KEY': JSON.stringify(undefined),
      // envDir: false แล้วต้องฝังค่าเริ่มต้นของ Vite (มีโค้ดใช้ import.meta.env.DEV)
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.BASE_URL': JSON.stringify(baseUrl),
      'import.meta.env.DEV': JSON.stringify(mode !== 'production'),
      'import.meta.env.PROD': JSON.stringify(mode === 'production'),
      'import.meta.env.SSR': JSON.stringify(false),
      ...viteDefines,
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(merged.VITE_APP_VERSION || pkgVersion),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
  };
});
