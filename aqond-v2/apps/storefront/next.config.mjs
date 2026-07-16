import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(dir, '../..'),
  reactStrictMode: true,
  // Repo carries pre-existing type/lint debt across unrelated features (escrow,
  // merchant, jarvis, e2e, packages). Compilation still runs; type errors are
  // surfaced via `tsc --noEmit` in CI rather than blocking the production build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@aqond/ui', '@aqond/receipt-core', '@aqond/delivery-core', '@aqond/return-core', 'pdfjs-dist'],
  env: {
    BFF_URL: process.env.BFF_URL || 'http://127.0.0.1:8000/api/v2/merchant',
    AQOND_REGION: process.env.AQOND_REGION || 'TH',
    AQOND_LOCALE: process.env.AQOND_LOCALE || 'th-TH',
  },
  async rewrites() {
    return [
      { source: '/storefront/rider-os', destination: '/m/rider/home' },
      { source: '/storefront/rider-os/:path*', destination: '/m/rider/:path*' },
    ];
  },
  async redirects() {
    return [
      { source: '/m/rider', destination: '/storefront/rider-os/home', permanent: false },
    ];
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
      {
        source: '/storefront/rider-os/:path*',
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
