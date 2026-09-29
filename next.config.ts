import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Bakkal defterinin eski giriş adresi: tek giriş ekranı artık /giris.
      { source: "/login", destination: "/giris", permanent: false },
    ];
  },
};

export default nextConfig;
