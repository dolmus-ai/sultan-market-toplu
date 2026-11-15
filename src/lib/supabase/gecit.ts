import { SUPABASE_URL } from "@/lib/ortam";

/**
 * Tarayıcıdan Supabase'e giden HTTP isteklerini kendi alan adımızdaki
 * `/sb` geçidine (next.config.ts → rewrites) yönlendirir.
 *
 * Neden: bazı mobil operatörler/DNS'ler *.supabase.co'yu engelleyebiliyor ya
 * da çözemiyor. O zaman sayfa açılsa bile giriş, sipariş ve tahsilat
 * istekleri düşüyordu. Geçit sayesinde tarayıcı yalnızca uygulamanın kendi
 * adresine bağlanıyor; site açılıyorsa Supabase de açık.
 *
 * İstemciye verilen adres bilerek değişmiyor: oturum çerezinin adı
 * (`sb-<proje>-auth-token`) adresten türüyor ve sunucu tarafı doğrudan
 * Supabase'e gidiyor; ikisi aynı çerezi okumalı. Canlı akış (WebSocket)
 * geçitten geçemediği için doğrudan bağlanmayı deniyor; olmazsa yalnızca
 * anlık güncelleme gecikir, işlemler yine çalışır.
 */
const KOK = SUPABASE_URL.replace(/\/+$/, "");

/** Supabase adresini geçit adresine çevirir; başka adreslere dokunmaz. */
export function gecitAdresi(adres: string): string {
  if (typeof window === "undefined") return adres;
  if (adres === KOK || adres.startsWith(`${KOK}/`)) {
    return `${window.location.origin}/sb${adres.slice(KOK.length)}`;
  }
  return adres;
}

/** Supabase istemcisine verilecek fetch: istekleri geçitten geçirir. */
export const gecitFetch: typeof fetch = (girdi, ayar) => {
  if (typeof girdi === "string") return fetch(gecitAdresi(girdi), ayar);
  if (girdi instanceof URL) return fetch(gecitAdresi(girdi.href), ayar);
  const yeni = gecitAdresi(girdi.url);
  return yeni === girdi.url ? fetch(girdi, ayar) : fetch(new Request(yeni, girdi), ayar);
};
