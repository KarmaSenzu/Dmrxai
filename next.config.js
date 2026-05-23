/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output: hasilkan minimal Node.js bundle untuk Docker.
  // Lihat https://nextjs.org/docs/pages/api-reference/next-config-js/output
  output: 'standalone',
};

module.exports = nextConfig;
