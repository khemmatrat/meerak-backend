import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const envProject = loadEnv(mode, __dirname, "");
  const envParent = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const apiTarget =
    envProject.VITE_ADS_ADMIN_API_URL ||
    envProject.VITE_ADMIN_API_URL ||
    envParent.VITE_ADMIN_API_URL ||
    "http://localhost:3001";
  const prodApiBase = (() => {
    const raw =
      envProject.VITE_ADS_ADMIN_API_URL ||
      envProject.VITE_ADMIN_API_URL ||
      "https://api.aqond.com";
    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(raw)) return "https://api.aqond.com";
    return raw.replace(/\/$/, "");
  })();
  const adsAdminApiBase = mode === "production" ? prodApiBase : "";
  return {
    define: {
      __ADS_ADMIN_API_BASE__: JSON.stringify(adsAdminApiBase),
    },
    server: {
      port: 3003,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          timeout: 120_000,
          proxyTimeout: 120_000,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, ".") },
    },
  };
});
