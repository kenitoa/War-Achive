import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  // Keep exported page folders while passing exact API paths to Vercel rewrites.
  skipTrailingSlashRedirect: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};
export default config;
