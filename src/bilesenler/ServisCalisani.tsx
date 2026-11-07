"use client";

import { useEffect, useState } from "react";

/** Bu sekmede çalışan derlemenin kimliği (next.config.ts). */
const BU_SURUM = process.env.UYGULAMA_SURUM;
/** Sekme açıkken yeni sürüm ne sıklıkla sorulsun. */
const ARALIK_MS = 5 * 60 * 1000;
/** Odak/görünürlük olayları üst üste gelince sunucuyu boğmasın. */
const EN_AZ_ARA_MS = 30 * 1000;

/**
 * Servis çalışanını kaydeder ve yeni sürümün sekmeye gelmesini sağlar.
 *
 * Kayıt, uygulamanın ana ekrana kurulabilmesi ve kabuğunun çevrimdışı
 * açılabilmesi için. Geliştirmede kayıt yapılmaz, yoksa Turbopack'in sıcak
 * yenilemesiyle çakışıyor.
 *
 * Güncelleme iki yoldan geliyor:
 *
 *  1. Servis çalışanı: `sw.js` değişince yeni çalışan devralır, sayfa bir
 *     kez yenilenir. Ama `sw.js` çoğu dağıtımda değişmiyor; tek başına
 *     yetmedi — market yayına alınan değişikliği ekranda görmedi.
 *  2. Sürüm sorgusu: `/api/surum` yayındaki derlemenin kimliğini veriyor.
 *     Sekmedeki kimlikten farklıysa:
 *       - kurye uygulamaya geri döndüğünde (sekme öne geldi) sayfa hemen
 *         yenilenir — o an yarım kalan bir iş yok;
 *       - uygulama açık ve kullanılırken fark edilirse yenileme dayatılmaz,
 *         üstte "Yeni sürüm · Yenile" düğmesi çıkar.
 *
 * Yazma işlemleri IndexedDB kuyruğunda olduğu için yenileme veri
 * kaybettirmiyor.
 */
export default function ServisCalisani() {
  const [yeniSurum, setYeniSurum] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let yenileniyor = false;
    const yenile = () => {
      if (yenileniyor) return;
      yenileniyor = true;
      window.location.reload();
    };

    // ---- 2. sürüm sorgusu ----
    let sonSorgu = 0;
    async function yeniSurumVarMi(): Promise<boolean> {
      if (!BU_SURUM || !navigator.onLine) return false;
      const simdi = Date.now();
      if (simdi - sonSorgu < EN_AZ_ARA_MS) return false;
      sonSorgu = simdi;
      try {
        const yanit = await fetch("/api/surum", { cache: "no-store" });
        if (!yanit.ok) return false; // oturum yok (401) ya da sunucu hatası
        const { surum } = (await yanit.json()) as { surum?: string | null };
        return typeof surum === "string" && surum !== BU_SURUM;
      } catch {
        return false; // ağ yoksa bir sonraki denemede
      }
    }

    // ---- 1. servis çalışanı ----
    const swVar = "serviceWorker" in navigator;
    /*
     * İlk kurulumda da `controllerchange` tetikleniyor (`clients.claim`) ama
     * o an yenilemeye gerek yok: zaten en yeni kod çalışıyor. Ayrım şurada —
     * ilk kurulumda sayfanın hiç kontrolcüsü yoktu, sonraki her olayda
     * *değişen* bir kontrolcü var.
     */
    let kontrolcuVar = swVar && navigator.serviceWorker.controller != null;
    const devralindi = () => {
      if (!kontrolcuVar) {
        kontrolcuVar = true;
        return;
      }
      yenile();
    };
    if (swVar) {
      navigator.serviceWorker.addEventListener("controllerchange", devralindi);
    }

    let kayit: ServiceWorkerRegistration | null = null;
    const kaydet = () => {
      if (!swVar) return;
      void navigator.serviceWorker
        .register("/sw.js")
        .then((k) => {
          kayit = k;
          void k.update().catch(() => {});
        })
        .catch(() => {
          /* kayıt başarısızsa uygulama normal çalışmaya devam eder */
        });
    };
    if (document.readyState === "complete") kaydet();
    else window.addEventListener("load", kaydet, { once: true });

    // Sekme öne geldi: kurye uygulamaya döndü, yenilemek güvenli.
    const oneGeldi = () => {
      if (document.visibilityState !== "visible") return;
      void kayit?.update().catch(() => {});
      void yeniSurumVarMi().then((var_) => var_ && yenile());
    };
    // Uygulama açık ve kullanılıyor: yenilemeyi dayatma, düğme göster.
    const zamanli = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void yeniSurumVarMi().then((var_) => var_ && setYeniSurum(true));
    }, ARALIK_MS);

    document.addEventListener("visibilitychange", oneGeldi);
    window.addEventListener("focus", oneGeldi);
    return () => {
      clearInterval(zamanli);
      if (swVar) {
        navigator.serviceWorker.removeEventListener("controllerchange", devralindi);
      }
      document.removeEventListener("visibilitychange", oneGeldi);
      window.removeEventListener("focus", oneGeldi);
    };
  }, []);

  if (!yeniSurum) return null;
  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0e0e11] px-4 py-2 text-[13px] font-bold text-white shadow-lg active:scale-95"
    >
      <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
      Yeni sürüm hazır · Yenile
    </button>
  );
}
