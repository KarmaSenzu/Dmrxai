/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output: hasilkan minimal Node.js bundle untuk Docker.
  // Lihat https://nextjs.org/docs/pages/api-reference/next-config-js/output
  output: 'standalone',

  // dockerode (dan dependensi native-nya seperti ssh2 → sshcrypto.node) adalah
  // library server-only yang tidak boleh di-bundle webpack. Tandai sebagai
  // external agar di-require langsung di runtime (standalone tracing sudah
  // menyalinnya via Dockerfile COPY). Next.js 14 memakai
  // `serverComponentsExternalPackages` (bukan `serverExternalPackages` yang
  // baru ada di Next 15).
  experimental: {
    serverComponentsExternalPackages: ['dockerode', 'ssh2'],
  },
};

module.exports = nextConfig;
