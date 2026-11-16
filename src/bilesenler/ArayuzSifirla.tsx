"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Viewport etiketi: yakınlaştırma kilitli / açık. */
export const VIEWPORT_KILITLI =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
export const VIEWPORT_ACIK =
  "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover";

/**
 * Sayfanın iki parmakla yakınlaştırılmış hâlini ilk açılıştaki ölçeğe döndürür.
 *
 * Tarayıcılar sayfa ölçeğini koddan değiştirmeye izin vermiyor; ama viewport
 * etiketinde `maximum-scale=1` görünce ölçeği 1'e çekiyorlar (iOS Safari ve
 * Android Chrome). Etiket kısa bir an kilitli değere çekilip sonra eski hâline
 * döndürülüyor: yakınlaştırma kilidi kapalıysa kurye yine büyütebiliyor.
 */
export function arayuzuSifirla(zoomKilitli: boolean) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = VIEWPORT_KILITLI;
  window.scrollTo(0, 0);
  window.setTimeout(() => {
    window.scrollTo(0, 0);
    if (meta && !zoomKilitli) meta.content = VIEWPORT_ACIK;
  }, 350);
}

/** Sayfa yakınlaştırılmış mı, ve görünen alanın konumu. */
function useGorunenAlan() {
  const [alan, setAlan] = useState<{
    olcek: number;
    x: number;
    y: number;
    genislik: number;
  } | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const guncelle = () =>
      setAlan({
        olcek: vv.scale,
        x: vv.offsetLeft,
        y: vv.offsetTop,
        genislik: vv.width,
      });
    vv.addEventListener("resize", guncelle);
    vv.addEventListener("scroll", guncelle);
    return () => {
      vv.removeEventListener("resize", guncelle);
      vv.removeEventListener("scroll", guncelle);
    };
  }, []);

  return alan;
}

/**
 * Sayfa büyütülmüşken görünen alanın tepesinde beliren "Arayüzü sıfırla"
 * düğmesi. Büyütülünce haritanın düğmeleri ekran dışında kalabiliyor; bu
 * düğme görünen alana yapışık ve normal boyutunda duruyor.
 */
export function YakinlikSifirlaDugmesi({
  zoomKilitli,
}: {
  zoomKilitli: boolean;
}) {
  const alan = useGorunenAlan();
  const buyuk = alan != null && alan.olcek > 1.04;

  return (
    <AnimatePresence>
      {buyuk && alan && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[90] flex justify-center"
          style={{
            width: alan.genislik * alan.olcek,
            transform: `translate(${alan.x}px, ${alan.y}px) scale(${1 / alan.olcek})`,
            transformOrigin: "0 0",
          }}
        >
          <motion.button
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={() => arayuzuSifirla(zoomKilitli)}
            className="pointer-events-auto mt-[calc(env(safe-area-inset-top)+12px)] flex h-10 items-center gap-2 rounded-hap bg-kontrast px-4 text-[13px] font-black text-white shadow-yuzen active:scale-95"
          >
            <SifirlaSimgesi />
            Arayüzü sıfırla
          </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SifirlaSimgesi({ boyut = 16 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
