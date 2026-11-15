import type { NextConfig } from "next";

import { SUPABASE_URL } from "./src/lib/ortam";

/**
 * Bu derlemenin kimliği. Vercel'de commit SHA'sı, yerelde derleme anı.
 * Hem istemci paketine hem /api/surum'a aynı değer gömülüyor; ikisi
 * farklıysa açık sekme eski sürümü çalıştırıyor demektir (ServisCalisani).
 */
const UYGULAMA_SURUM =
  process.env.VERCEL_GIT_COMMIT_SHA ?? `yerel-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { UYGULAMA_SURUM },
  /*
   * Supabase geçidi: tarayıcı Supabase'e kendi alan adımız üzerinden
   * ulaşıyor (lib/supabase/gecit.ts). Bazı mobil operatörler ve DNS'ler
   * *.supabase.co'yu engelleyebiliyor; o zaman giriş ve kayıt işlemleri
   * "Failed to fetch" ile düşüyordu. Bu yol açıksa uygulama da açık.
   */
  async rewrites() {
    return [
      { source: "/sb/:yol*", destination: `${SUPABASE_URL}/:yol*` },
    ];
  },
  async redirects() {
    return [
      // Bakkal defterinin eski giriş adresi: tek giriş ekranı artık /giris.
      { source: "/login", destination: "/giris", permanent: false },
    ];
  },
};

export default nextConfig;
