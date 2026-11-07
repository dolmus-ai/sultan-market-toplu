import type { NextConfig } from "next";

/**
 * Bu derlemenin kimliği. Vercel'de commit SHA'sı, yerelde derleme anı.
 * Hem istemci paketine hem /api/surum'a aynı değer gömülüyor; ikisi
 * farklıysa açık sekme eski sürümü çalıştırıyor demektir (ServisCalisani).
 */
const UYGULAMA_SURUM =
  process.env.VERCEL_GIT_COMMIT_SHA ?? `yerel-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { UYGULAMA_SURUM },
  async redirects() {
    return [
      // Bakkal defterinin eski giriş adresi: tek giriş ekranı artık /giris.
      { source: "/login", destination: "/giris", permanent: false },
    ];
  },
};

export default nextConfig;
