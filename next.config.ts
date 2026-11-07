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
};

export default nextConfig;
