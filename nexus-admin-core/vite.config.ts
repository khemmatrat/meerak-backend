import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // โหลด .env จาก nexus-admin-core ก่อน (เช่น .env.local) — ค่านี้ควบคุม proxy ไป backend ตอน dev
  const envProject = loadEnv(mode, __dirname, "");
  const envParent = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const apiTarget =
    envProject.VITE_ADMIN_API_URL ||
    envParent.VITE_ADMIN_API_URL ||
    "http://localhost:3001";
  return {
    server: {
      port: 3002,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          // อัปโหลดรูปแบนเนอร์ (multipart) — รอ backend/S3 นานขึ้นได้
          timeout: 120_000,
          proxyTimeout: 120_000,
        },
      },
    },
    plugins: [react()],
    define: {
      // GEMINI เรียกผ่าน Backend API เท่านั้น — ห้ามใส่ key ใน frontend build
      "process.env.API_KEY": JSON.stringify(undefined),
      "process.env.GEMINI_API_KEY": JSON.stringify(undefined),
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
