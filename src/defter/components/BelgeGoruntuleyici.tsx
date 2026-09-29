"use client";

import { useEffect, useRef, useState } from "react";

// Tam ekran belge görüntüleyici: iki parmakla yakınlaştırma (pinch),
// yakınlaşmışken sürükleyerek gezinme, çift dokunuş/çift tıkla
// yakınlaş-uzaklaş, masaüstünde fare tekerleğiyle yakınlaştırma.
type Donusum = { olcek: number; x: number; y: number };

const MIN_OLCEK = 1;
const MAX_OLCEK = 6;
const CIFT_DOKUNUS_OLCEK = 2.5;

// İmzalı adresin sorgu parametrelerini atlayarak PDF olup olmadığına bakar
const pdfMu = (url: string) => /\.pdf(\?|#|$)/i.test(url);

export default function BelgeGoruntuleyici({
  url,
  onKapat,
}: {
  url: string;
  onKapat: () => void;
}) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<Donusum>({ olcek: 1, x: 0, y: 0 });
  // Aktif parmak/imleç konumları (pinch iki kayıt gerektirir)
  const isaretler = useRef(new Map<number, { x: number; y: number }>());
  const oncekiMesafe = useRef(0);
  const sonDokunus = useRef(0);

  // Ekrandaki p noktası sabit kalacak şekilde ölçeği değiştirir
  const noktadaOlcekle = (v: Donusum, p: { x: number; y: number }, yeni: number): Donusum => {
    const olcek = Math.min(MAX_OLCEK, Math.max(MIN_OLCEK, yeni));
    if (olcek === 1) return { olcek: 1, x: 0, y: 0 };
    const oran = olcek / v.olcek;
    return {
      olcek,
      x: p.x - (p.x - v.x) * oran,
      y: p.y - (p.y - v.y) * oran,
    };
  };

  const yerel = (clientX: number, clientY: number) => {
    const r = kutuRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const basildi = (e: React.PointerEvent) => {
    kutuRef.current?.setPointerCapture(e.pointerId);
    isaretler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (isaretler.current.size === 1) {
      const simdi = Date.now();
      if (simdi - sonDokunus.current < 300) {
        // Çift dokunuş: yakınlaşmışsa sıfırla, değilse dokunulan noktaya yakınlaş
        const p = yerel(e.clientX, e.clientY);
        setD((v) =>
          v.olcek > 1.2
            ? { olcek: 1, x: 0, y: 0 }
            : noktadaOlcekle(v, p, CIFT_DOKUNUS_OLCEK)
        );
        sonDokunus.current = 0;
      } else {
        sonDokunus.current = simdi;
      }
    } else if (isaretler.current.size === 2) {
      const [a, b] = [...isaretler.current.values()];
      oncekiMesafe.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const hareket = (e: React.PointerEvent) => {
    const onceki = isaretler.current.get(e.pointerId);
    if (!onceki) return;
    const simdi = { x: e.clientX, y: e.clientY };
    isaretler.current.set(e.pointerId, simdi);

    if (isaretler.current.size === 2) {
      // Pinch: iki parmağın arası açıldıkça orta nokta çevresinde ölçekle
      const [a, b] = [...isaretler.current.values()];
      const mesafe = Math.hypot(a.x - b.x, a.y - b.y);
      const orta = yerel((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (oncekiMesafe.current > 0) {
        const carpan = mesafe / oncekiMesafe.current;
        setD((v) => noktadaOlcekle(v, orta, v.olcek * carpan));
      }
      oncekiMesafe.current = mesafe;
    } else if (isaretler.current.size === 1) {
      // Tek parmak: yalnızca yakınlaşmışken kaydır
      setD((v) =>
        v.olcek === 1
          ? v
          : { ...v, x: v.x + simdi.x - onceki.x, y: v.y + simdi.y - onceki.y }
      );
    }
  };

  const birakildi = (e: React.PointerEvent) => {
    isaretler.current.delete(e.pointerId);
    oncekiMesafe.current = 0;
  };

  // Tekerlek yakınlaştırması: React'in pasif wheel dinleyicisi preventDefault'a
  // izin vermediği için elle, pasif olmayan dinleyici bağlanır.
  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      setD((v) =>
        noktadaOlcekle(v, p, v.olcek * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
      );
    };
    el.addEventListener("wheel", tekerlek, { passive: false });
    return () => el.removeEventListener("wheel", tekerlek);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between gap-2 p-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-white/15 px-3 py-2 text-sm font-bold text-white"
        >
          ⬇️ İndir
        </a>
        <span className="text-[11px] text-white/50">
          {pdfMu(url)
            ? "PDF belge — açılmazsa İndir ile görüntüleyin"
            : "İki parmakla veya çift dokunuşla yakınlaştırın"}
        </span>
        <button
          onClick={onKapat}
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-stone-800"
        >
          ✕ Kapat
        </button>
      </div>
      {pdfMu(url) ? (
        // PDF'te yakınlaştırma tarayıcının kendi görüntüleyicisine bırakılır
        <iframe
          src={url}
          title="Taranan belge"
          className="flex-1 border-0 bg-white"
        />
      ) : (
      <div
        ref={kutuRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={basildi}
        onPointerMove={hareket}
        onPointerUp={birakildi}
        onPointerCancel={birakildi}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${d.x}px, ${d.y}px) scale(${d.olcek})`,
            transformOrigin: "0 0",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Taranan belge"
            draggable={false}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      </div>
      )}
    </div>
  );
}
