"use client";

import { useEffect } from "react";

/**
 * Servis çalışanını kaydeder ve yeni sürümün devralmasını sağlar.
 *
 * Kayıt, uygulamanın ana ekrana kurulabilmesi ve kabuğunun çevrimdışı
 * açılabilmesi için. Geliştirmede kayıt yapılmaz, yoksa Turbopack'in sıcak
 * yenilemesiyle çakışıyor.
 *
 * Güncelleme kısmı sonradan eklendi: kurye uygulamayı günlerce açık
 * bırakıyor ve tarayıcı açık sekmede yeni sürümü kendiliğinden aramıyordu.
 * Sonuç, yayına alınan bir düzeltmenin ekranda hiç görünmemesiydi — market
 * "değişiklik gelmedi" diye yazdı, oysa dağıtım tamamdı. Üç ekleme:
 *
 *  - Kayıttan hemen sonra bir kez `update()`.
 *  - Sekme öne geldiğinde (`visibilitychange`, `focus`) yine `update()`.
 *  - Yeni servis çalışanı devralınca sayfa bir kez yenileniyor; yoksa yeni
 *    kabuk eski JS ile çalışmaya devam ediyor. Yazma işlemleri IndexedDB
 *    kuyruğunda olduğu için yenileme veri kaybettirmiyor.
 */
export default function ServisCalisani() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    /*
     * İlk kurulumda da `controllerchange` tetikleniyor (`clients.claim`) ama
     * o an yenilemeye gerek yok: zaten en yeni kod çalışıyor. Ayrım şurada —
     * ilk kurulumda sayfanın hiç kontrolcüsü yoktu, sonraki her olayda
     * *değişen* bir kontrolcü var.
     *
     * Bayrak olayın içinde güncelleniyor; sabit tutulsaydı ilk ziyaretin
     * ardından aynı sekmede çıkan güncellemeler hiç yakalanmazdı (ölçüldü:
     * sayfa yenilenmiyordu).
     */
    let kontrolcuVar = navigator.serviceWorker.controller != null;
    let yenileniyor = false;

    const devralindi = () => {
      if (!kontrolcuVar) {
        kontrolcuVar = true;
        return;
      }
      if (yenileniyor) return;
      yenileniyor = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", devralindi);

    let kayit: ServiceWorkerRegistration | null = null;
    const guncelle = () => {
      if (document.visibilityState !== "visible") return;
      void kayit?.update().catch(() => {
        /* ağ yoksa bir sonraki öne gelişte yeniden denenir */
      });
    };

    const kaydet = () => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((k) => {
          kayit = k;
          guncelle();
        })
        .catch(() => {
          /* kayıt başarısızsa uygulama normal çalışmaya devam eder */
        });
    };
    if (document.readyState === "complete") kaydet();
    else window.addEventListener("load", kaydet, { once: true });

    document.addEventListener("visibilitychange", guncelle);
    window.addEventListener("focus", guncelle);
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        devralindi,
      );
      document.removeEventListener("visibilitychange", guncelle);
      window.removeEventListener("focus", guncelle);
    };
  }, []);

  return null;
}
