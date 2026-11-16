"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Viewport etiketi: yakınlaştırma kilitli / açık. */
export const VIEWPORT_KILITLI =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
export const VIEWPORT_ACIK =
  "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover";

/** Sayfa ölçeği bu kadarı aşıyorsa "büyütülmüş" sayılır. */
const BUYUK_OLCEK = 1.04;
/** Sıfırlama sonrası sayfa yeniden açılırken adrese eklenen işaret. */
const SIFIRLA_ISARETI = "sifirla";

function sayfaBuyuk() {
  return (window.visualViewport?.scale ?? 1) > BUYUK_OLCEK;
}

/**
 * Arayüzü ilk açılıştaki hâline döndürür: harita ilk konumuna, yakınlığına
 * ve açısına uçar; sayfa iki parmakla büyütülmüşse ölçek 1'e iner.
 *
 * Sayfa ölçeğini koddan değiştirmenin standart bir yolu yok. Android Chrome,
 * viewport etiketinde kısa bir an `maximum-scale=1` görünce ölçeği 1'e
 * çekiyor. iPhone Safari ise erişilebilirlik gereği bu sınırı yok sayıyor;
 * orada ölçek inmezse sayfa aynı adresten yeniden açılıyor (yeni açılış her
 * zaman 1 ölçekle başlar). Bekleyen işlemler cihazda sırada durduğu için
 * yeniden açılışta kaybolmuyor.
 */
export function arayuzuSifirla(zoomKilitli: boolean, haritaSifirla?: () => void) {
  haritaSifirla?.();
  if (!sayfaBuyuk()) return;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = VIEWPORT_KILITLI;
  window.scrollTo(0, 0);
  window.setTimeout(() => {
    window.scrollTo(0, 0);
    if (meta && !zoomKilitli) meta.content = VIEWPORT_ACIK;
    if (!sayfaBuyuk()) return;
    const url = new URL(window.location.href);
    url.searchParams.set(SIFIRLA_ISARETI, String(Date.now()));
    window.location.replace(url.toString());
  }, 400);
}

/** Sıfırlama için yeniden açıldıysak adresteki işareti sessizce temizler. */
export function useSifirlaIsaretiniTemizle() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SIFIRLA_ISARETI)) return;
    url.searchParams.delete(SIFIRLA_ISARETI);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);
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
  onHaritaSifirla,
}: {
  zoomKilitli: boolean;
  onHaritaSifirla?: () => void;
}) {
  useSifirlaIsaretiniTemizle();
  const alan = useGorunenAlan();
  const buyuk = alan != null && alan.olcek > BUYUK_OLCEK;

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
            onClick={() => arayuzuSifirla(zoomKilitli, onHaritaSifirla)}
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
