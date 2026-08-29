"use client";

import { useEffect } from "react";

/**
 * Servis çalışanını kaydeder — uygulamanın ana ekrana kurulabilmesi ve
 * kabuğunun çevrimdışı açılabilmesi için. Geliştirmede kayıt yapılmaz,
 * yoksa Turbopack'in sıcak yenilemesiyle çakışıyor.
 */
export default function ServisCalisani() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const kaydet = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* kayıt başarısızsa uygulama normal çalışmaya devam eder */
      });
    };
    if (document.readyState === "complete") kaydet();
    else window.addEventListener("load", kaydet, { once: true });
  }, []);

  return null;
}
