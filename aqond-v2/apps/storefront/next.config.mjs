import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(dir, '../..'),
  reactStrictMode: true,
  transpilePackages: ['@aqond/ui', '@aqond/receipt-core', '@aqond/delivery-core', '@aqond/return-core', 'pdfjs-dist'],
  env: {
    BFF_URL: process.env.BFF_URL || 'http://127.0.0.1:8000/api/v2/merchant',
    AQOND_REGION: process.env.AQOND_REGION || 'TH',
    AQOND_LOCALE: process.env.AQOND_LOCALE || 'th-TH',
  },
  async headers() {
    return [
      {
        source: '/m/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://app.aqond.com https://*.aqond.com http://localhost:* http://127.0.0.1:* capacitor://localhost",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
