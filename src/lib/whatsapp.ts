/**
 * Müşteriye WhatsApp mesajı.
 *
 * API ya da ücret yok: `wa.me` bağlantısı kuryenin telefonunda WhatsApp'ı
 * hazır yazılmış mesajla açıyor, gönder tuşuna kurye basıyor.
 */

/** Türkiye numarasını wa.me'nin istediği 90XXXXXXXXXX biçimine çevirir. */
export function waNumarasi(telefon: string | null | undefined): string | null {
  const rakam = (telefon ?? "").replace(/\D/g, "");
  if (!rakam) return null;
  if (rakam.length === 12 && rakam.startsWith("90")) return rakam;
  if (rakam.length === 11 && rakam.startsWith("0")) return `9${rakam}`;
  if (rakam.length === 10 && rakam.startsWith("5")) return `90${rakam}`;
  // Yurt dışı ya da tanınmayan biçim: olduğu gibi dene.
  return rakam.length >= 10 ? rakam : null;
}

export type WaMesaji = "yolda" | "kapida";

export function waMetni(tur: WaMesaji, ad: string | null | undefined): string {
  const selam = ad?.trim() ? `Merhaba ${ad.trim().split(/\s+/)[0]}` : "Merhaba";
  return tur === "yolda"
    ? `${selam}, Sultan Market siparişiniz yola çıktı, birazdan kapınızdayız.`
    : `${selam}, Sultan Market kuryesi kapınızda.`;
}

export function waBaglantisi(
  telefon: string | null | undefined,
  tur: WaMesaji,
  ad: string | null | undefined,
): string | null {
  const no = waNumarasi(telefon);
  if (!no) return null;
  return `https://wa.me/${no}?text=${encodeURIComponent(waMetni(tur, ad))}`;
}

export function waAc(
  telefon: string | null | undefined,
  tur: WaMesaji,
  ad: string | null | undefined,
): boolean {
  const bag = waBaglantisi(telefon, tur, ad);
  if (!bag) return false;
  window.open(bag, "_blank", "noreferrer");
  return true;
}
