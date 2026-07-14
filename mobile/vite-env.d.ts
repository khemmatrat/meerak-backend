// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POST_JOB_PHONE_GRACE_HOURS?: string;
}

// เพิ่ม declarations สำหรับ CSS
declare module '*.css' {
  const content: string;
  export default content;
}