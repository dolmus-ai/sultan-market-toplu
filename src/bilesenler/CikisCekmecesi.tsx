"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { SultanAmblem } from "./SultanLogo";

const YAY = { type: "spring", stiffness: 380, damping: 40 } as const;

/**
 * Soldan açılan ekran: sağ kenardan açılan tam ekran listenin ikizi.
 * Ekranın sol kenarından sağa kaydırınca parmakla birlikte gelir; içinde
 * bulanık amblemin önünde kurye bilgisi ve büyük "Çıkış yap" düğmesi var.
 * Sola kaydırmak, karartıya dokunmak ya da "Kapat" kapatır.
 *
 * Haritada yatay sürükleme haritayı kaydırdığı için hareket yalnızca
 * sol kenardaki dar şeritte başlıyor (sağdaki şeridin aynısı). Safari'nin
 * kenardan "geri" hareketi bu şeritte zaten kapalı (KuryeUygulamasi).
 */
export default function CikisCekmecesi({
  kuryeAdi,
  ozet,
  onCikis,
  onAcilis,
}: {
  kuryeAdi: string;
  ozet: string;
  onCikis: () => void;
  /** Açılıp kapanırken (ses için). */
  onAcilis?: (acik: boolean) => void;
}) {
  const [gorunur, setGorunur] = useState(false);
  const [acik, setAcik] = useState(false);
  const cekmece = useRef<HTMLElement>(null);
  /** Çekmecenin genişliği (CSS'te: en çok 340 px, ekranın %84'ü). */
  const genislik = () => cekmece.current?.offsetWidth ?? 320;
  const x = useMotionValue(-2000);
  const kararti = useTransform(x, (v) =>
    Math.max(0, Math.min(0.45, 0.45 * (1 + v / genislik()))),
  );

  function git(son: boolean, hiz = 0) {
    setAcik(son);
    if (son) setGorunur(true);
    onAcilis?.(son);
    void animate(x, son ? 0 : -genislik(), { ...YAY, velocity: hiz }).then(
      () => {
        if (!son && x.get() <= -genislik() + 1) setGorunur(false);
      },
    );
  }

  /* Sol kenardan sağa sürükleme: parmağı izler. */
  const kenar = useRef<{
    x: number;
    y: number;
    sonX: number;
    sonT: number;
    hiz: number;
    basladi: boolean;
  } | null>(null);

  function basla(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* işaretçi zaten bırakılmışsa yakalamadan devam */
    }
    kenar.current = {
      x: e.clientX,
      y: e.clientY,
      sonX: e.clientX,
      sonT: performance.now(),
      hiz: 0,
      basladi: false,
    };
  }

  function surukle(e: React.PointerEvent<HTMLDivElement>) {
    const k = kenar.current;
    if (!k) return;
    const dx = e.clientX - k.x;
    if (!k.basladi) {
      const dy = Math.abs(e.clientY - k.y);
      if (dy > 24 && dy > dx) {
        kenar.current = null;
        return;
      }
      if (dx < 6) return;
      k.basladi = true;
      setGorunur(true);
    }
    const t = performance.now();
    const dt = Math.max(1, t - k.sonT);
    k.hiz = 0.7 * ((e.clientX - k.sonX) / dt) * 1000 + 0.3 * k.hiz;
    k.sonX = e.clientX;
    k.sonT = t;
    x.set(Math.min(0, -genislik() + dx));
  }

  function birak() {
    const k = kenar.current;
    kenar.current = null;
    if (!k?.basladi) return;
    const gidilen = genislik() + x.get();
    const ac = k.hiz > 450 || (k.hiz > -200 && gidilen > genislik() * 0.35);
    git(ac, k.hiz);
  }

  return (
    <>
      {/* Sol kenar şeridi */}
      {!acik && (
        <div
          onPointerDown={basla}
          onPointerMove={surukle}
          onPointerUp={birak}
          onPointerCancel={birak}
          aria-hidden
          className="absolute bottom-20 left-0 top-[18%] z-[25] w-4 touch-none"
        />
      )}

      {/* Karartı */}
      <motion.div
        aria-hidden
        onClick={() => git(false)}
        style={{
          opacity: kararti,
          visibility: gorunur ? "visible" : "hidden",
          pointerEvents: acik ? "auto" : "none",
        }}
        className="absolute inset-0 z-[45] bg-black"
      />

      {/* Çekmece */}
      <motion.aside
        ref={cekmece}
        aria-hidden={!gorunur}
        drag={acik ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0 }}
        dragMomentum={false}
        onDragEnd={(_, b) => {
          if (b.offset.x < -70 || b.velocity.x < -450) git(false, b.velocity.x);
          else git(true, b.velocity.x);
        }}
        style={{
          x,
          touchAction: "pan-y",
          visibility: gorunur ? "visible" : "hidden",
          willChange: "transform",
        }}
        className="absolute inset-y-0 left-0 z-50 flex w-[min(340px,84vw)] flex-col overflow-hidden rounded-r-[28px] bg-yuzey shadow-yuzen"
      >
        {/* Arkada bulanık amblem */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 top-1/2 -translate-y-1/2 opacity-25 blur-2xl"
        >
          <SultanAmblem boyut={300} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-kirmizi/10 via-transparent to-kirmizi/15"
        />

        <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
          <span className="text-[10.5px] font-semibold text-gri">
            Sola kaydırarak da kapanır
          </span>
          <button
            onClick={() => git(false)}
            className="flex h-8 items-center rounded-hap bg-yuzey2 px-3 text-[12px] font-bold text-gri"
          >
            ← Kapat
          </button>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <SultanAmblem boyut={84} />
          <p className="mt-1 text-[20px] font-black leading-tight">{kuryeAdi}</p>
          <p className="text-[12px] font-semibold text-gri">{ozet}</p>
        </div>

        <div className="relative px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <button
            onClick={onCikis}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-br from-kirmizi to-[#9f0710] text-[15px] font-black text-white shadow-yumusak active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 15l4-3-4-3M20 12H10"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Çıkış yap
          </button>
        </div>
      </motion.aside>
    </>
  );
}
