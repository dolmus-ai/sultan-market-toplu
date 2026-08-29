import { mesafeYaz } from "./rota";
import type { Adim } from "./navigasyon";

/**
 * Sesli tarif — tarayıcının kendi konuşma sentezini kullanır.
 * Sunucuya hiçbir şey gitmez, ek bir servis gerekmez.
 */

let secilenSes: SpeechSynthesisVoice | null = null;

// Ses listesi tarayıcıda gecikmeli gelir; geldiğinde önbelleği tazeleriz.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    secilenSes = null;
  });
}

function sesMotoru(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null;
  return window.speechSynthesis;
}

export function sesDestekleniyorMu(): boolean {
  return sesMotoru() !== null;
}

/** Türkçe bir ses varsa onu seçer; yoksa varsayılanla devam eder. */
function turkceSes(motor: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (secilenSes) return secilenSes;
  const sesler = motor.getVoices();
  secilenSes =
    sesler.find((s) => s.lang?.toLowerCase().startsWith("tr")) ?? null;
  return secilenSes;
}

export function konus(metin: string) {
  const motor = sesMotoru();
  if (!motor || !metin) return;

  const soz = new SpeechSynthesisUtterance(metin);
  soz.lang = "tr-TR";
  soz.rate = 1.02;
  soz.pitch = 1;
  const ses = turkceSes(motor);
  if (ses) soz.voice = ses;

  // Üst üste binmesin: yeni yönerge öncekini keser.
  motor.cancel();
  motor.speak(soz);
}

export function sesiKes() {
  sesMotoru()?.cancel();
}

/** "300 metre sonra sola dönün, Kavaklar Caddesi" gibi bir cümle kurar. */
export function adimCumlesi(adim: Adim, mesafeM: number): string {
  const tarif = adim.tarif.replace(" · ", ", ");
  if (adim.manevra === "varis") return "Varış noktasına ulaştınız.";
  if (mesafeM < 60) return `Şimdi ${tarif.toLocaleLowerCase("tr")}`;
  return `${mesafeYaz(mesafeM)} sonra ${tarif.toLocaleLowerCase("tr")}`;
}
