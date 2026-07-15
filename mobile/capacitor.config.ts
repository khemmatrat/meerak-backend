import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.aqond.app',
  appName: 'Aqond',
  webDir: 'dist',
  // ให้ fetch / XMLHttpRequest (รวม axios) ใช้ HTTP แบบ native (OkHttp) บน Android — ไม่ผ่านข้อจำกัด WebView/CORS เหมือนเบราว์เซอร์
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // Android WebView ค่าเริ่มต้นจะ "ทับ" เนื้อหาเมื่อคีย์บอร์ดเปิด — native resize
    // ย่อ viewport ของ WebView ให้ layout หด ไม่ให้คีย์บอร์ดบัง input/ปุ่มในหน้า auth
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
