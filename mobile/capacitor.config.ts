import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aqond.app',
  appName: 'Aqond',
  webDir: 'dist',
  // ให้ fetch / XMLHttpRequest (รวม axios) ใช้ HTTP แบบ native (OkHttp) บน Android — ไม่ผ่านข้อจำกัด WebView/CORS เหมือนเบราว์เซอร์
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
