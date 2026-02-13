// src/vite-env.d.ts
/// <reference types="vite/client" />

// เพิ่ม declarations สำหรับ CSS
declare module '*.css' {
  const content: string;
  export default content;
}