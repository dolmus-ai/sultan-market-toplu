"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "motion/react";

export type PanelDurumu = "kapali" | "yari" | "acik";

type Props = {
  durum: PanelDurumu;
  onDurum: (d: PanelDurumu) => void;
  /** Liste tam ekran mı (sağdan sola güçlü kaydırmayla açılır). */
  tamEkran: boolean;
  onTamEkran: (acik: boolean) => void;
  baslik: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Alt panelin en çok açıldığı yükseklik (ekranın oranı). Yukarı kaydırınca
 * panel buraya kadar çıkar; üstte harita görünmeye devam eder.
 */
const ACIK_ORANI = 0.62;
/** Pin ya da teslimat ayrıntısı açılınca kullanılan ara yükseklik. */
const YARI_ORANI = 0.46;
/** Kapalıyken görünen şerit: tutamak + sekme satırı. */
const KAPALI_GORUNEN_PX = 64;
/** Tam ekran listenin açılıp kapanma yayı. */
const TAM_YAY = { type: "spring", stiffness: 380, damping: 40 } as const;

/**
 * Bir içeriği React ağacında yerinde tutup DOM'da iki yuva arasında
 * taşımak için sabit bir kap. Liste alt panelden tam ekrana geçerken
 * yeniden kurulmuyor; yalnızca kabı yer değiştiriyor. Önceden yüzlerce
 * satır geçişin ilk karesinde baştan kuruluyor, kayma kasıyordu.
 */
function useTasinanKap() {
  const [kap] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  // Sunucu çiziminde ve hidrasyonda kap yok sayılır; ikisi aynı kalsın.
  const istemcide = useSyncExternalStore(
    abonelikYok,
    () => true,
    () => false,
  );
  return istemcide ? kap : null;
}
const abonelikYok = () => () => {};

/**
 * Sağdan sola güçlü kaydırma: yeterince uzun, yatay ve hızlı bir hareket.
 * Instagram/Snapchat'teki sohbet ekranını açan hareket gibi.
 */
function useSolaKaydirma(onAc: () => void) {
  const bas = useRef<{ x: number; y: number; t: number } | null>(null);
  const onAcRef = useRef(onAc);
  useEffect(() => {
    onAcRef.current = onAc;
  });

  return {
    onPointerDown(e: React.PointerEvent) {
      bas.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      const bitti = (b: PointerEvent) => {
        window.removeEventListener("pointerup", bitti);
        window.removeEventListener("pointercancel", bitti);
        const ilk = bas.current;
        bas.current = null;
        if (!ilk) return;
        // Sola doğru hareket pozitif sayılır.
        const dx = ilk.x - b.clientX;
        const dy = b.clientY - ilk.y;
        const sure = Math.max(1, performance.now() - ilk.t);
        const yatay = dx > 1.4 * Math.abs(dy);
        const guclu = dx > 110 || (dx > 55 && dx / sure > 0.45);
        if (yatay && guclu) onAcRef.current();
      };
      window.addEventListener("pointerup", bitti);
      window.addEventListener("pointercancel", bitti);
    },
  };
}

export default function AltPanel({
  durum,
  onDurum,
  tamEkran,
  onTamEkran,
  baslik,
  children,
}: Props) {
  const kontrol = useDragControls();
  const tutamakKaydirma = useSolaKaydirma(() => onTamEkran(true));
  const [ekran, setEkran] = useState({ h: 800, w: 400 });

  useEffect(() => {
    const olc = () =>
      setEkran({ h: window.innerHeight, w: window.innerWidth });
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, []);

  const { yukseklik, duraklar } = useMemo(() => {
    const h = Math.round(ekran.h * ACIK_ORANI);
    return {
      yukseklik: h,
      duraklar: {
        acik: 0,
        yari: Math.round(h - ekran.h * YARI_ORANI),
        kapali: Math.round(h - KAPALI_GORUNEN_PX),
      } as Record<PanelDurumu, number>,
    };
  }, [ekran.h]);

  function birakildi(_: unknown, bilgi: PanInfo) {
    const su = duraklar[durum] + bilgi.offset.y;
    const hiz = bilgi.velocity.y;
    const tahmin = su + hiz * 0.18;

    // Sürüklerken iki durak var: aşağıda (harita) ya da açık (harita üstte
    // görünmeye devam eder). Hızlı fiske yönü belirler.
    if (Math.abs(hiz) > 400) {
      onDurum(hiz < 0 ? "acik" : "kapali");
      return;
    }
    const secenekler = (Object.entries(duraklar) as [PanelDurumu, number][]).filter(
      ([ad]) => ad !== "yari" || durum === "yari",
    );
    const en = secenekler.reduce(
      (iyi, [ad, y]) =>
        Math.abs(y - tahmin) < Math.abs(duraklar[iyi] - tahmin) ? ad : iyi,
      durum,
    );
    onDurum(en);
  }

  /* ---------------- Tam ekran liste ---------------- */

  /*
   * Katman hep kurulu duruyor, kapalıyken ekranın sağında gizli. Konumu bir
   * motion değeri: parmak sürüklerken React yeniden çizilmeden doğrudan
   * güncelleniyor, katman parmağı birebir izliyor.
   */
  const x = useMotionValue(tamEkran ? 0 : 10000);
  const genislikRef = useRef(ekran.w);
  /** Katman görünür mü (kayarken ya da açıkken). */
  const [katmanGorunur, setKatmanGorunur] = useState(tamEkran);
  /** Başlık ve liste şu an hangi yuvada. */
  const [icerikTamda, setIcerikTamda] = useState(tamEkran);
  /** Son istenen durum; prop'tan gelen değişiklikle çakışmasın. */
  const hedef = useRef<"acik" | "kapali">(tamEkran ? "acik" : "kapali");
  const animRef = useRef<ReturnType<typeof animate> | null>(null);

  const kaydir = useCallback(
    (son: "acik" | "kapali", hiz = 0) => {
      hedef.current = son;
      animRef.current?.stop();
      if (son === "acik") {
        setKatmanGorunur(true);
        setIcerikTamda(true);
      }
      animRef.current = animate(x, son === "acik" ? 0 : genislikRef.current, {
        ...TAM_YAY,
        velocity: hiz,
      });
      if (son === "kapali") {
        // Liste, katman ekrandan çıktıktan sonra alt panele döner; kayarken
        // katman boşalmasın.
        animRef.current.then(() => {
          if (hedef.current !== "kapali") return;
          setKatmanGorunur(false);
          setIcerikTamda(false);
        });
      }
    },
    [x],
  );

  // Düğmeyle (Tam ekran ⤢, Harita →) ya da dışarıdan gelen değişiklik.
  useEffect(() => {
    const son = tamEkran ? "acik" : "kapali";
    if (hedef.current !== son) kaydir(son);
  }, [tamEkran, kaydir]);

  // Kapalıyken ekran genişliği değişirse katman yine tam dışarıda dursun.
  useEffect(() => {
    genislikRef.current = ekran.w;
    if (hedef.current === "kapali" && !x.isAnimating()) {
      x.set(ekran.w);
    }
  }, [ekran.w, x]);

  /** Sağ kenardan sola sürükleme: katman parmağı izler. */
  const kenar = useRef<{
    x: number;
    y: number;
    sonX: number;
    sonT: number;
    hiz: number;
    basladi: boolean;
  } | null>(null);

  function kenarBasla(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = performance.now();
    kenar.current = {
      x: e.clientX,
      y: e.clientY,
      sonX: e.clientX,
      sonT: t,
      hiz: 0,
      basladi: false,
    };
  }

  function kenarSurukle(e: React.PointerEvent<HTMLDivElement>) {
    const k = kenar.current;
    if (!k) return;
    const dx = k.x - e.clientX;
    if (!k.basladi) {
      // Dikey kaymayı yanlışlıkla açılış sanmayalım.
      if (Math.abs(e.clientY - k.y) > 24 && Math.abs(e.clientY - k.y) > dx) {
        kenar.current = null;
        return;
      }
      if (dx < 6) return;
      k.basladi = true;
      animRef.current?.stop();
      hedef.current = "acik";
      setKatmanGorunur(true);
      setIcerikTamda(true);
    }
    const t = performance.now();
    const dt = Math.max(1, t - k.sonT);
    // Sola hız (px/sn), yumuşatılmış.
    k.hiz = 0.7 * ((k.sonX - e.clientX) / dt) * 1000 + 0.3 * k.hiz;
    k.sonX = e.clientX;
    k.sonT = t;
    x.set(Math.max(0, genislikRef.current - dx));
  }

  function kenarBirak() {
    const k = kenar.current;
    kenar.current = null;
    if (!k?.basladi) return;
    const gidilen = genislikRef.current - x.get();
    const ac = k.hiz > 450 || (k.hiz > -200 && gidilen > genislikRef.current * 0.35);
    // Yay, parmağın hızıyla devam etsin (x azalırken hız negatif).
    kaydir(ac ? "acik" : "kapali", -k.hiz);
    if (ac) onTamEkran(true);
  }

  // Başlık ve liste tek kez kuruluyor; kapları iki yuva arasında taşınıyor.
  const baslikKap = useTasinanKap();
  const icerikKap = useTasinanKap();
  const altBaslikYuva = useRef<HTMLDivElement>(null);
  const altIcerikYuva = useRef<HTMLDivElement>(null);
  const tamBaslikYuva = useRef<HTMLDivElement>(null);
  const tamIcerikYuva = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const b = (icerikTamda ? tamBaslikYuva : altBaslikYuva).current;
    const i = (icerikTamda ? tamIcerikYuva : altIcerikYuva).current;
    if (baslikKap && b && baslikKap.parentElement !== b) b.appendChild(baslikKap);
    if (icerikKap && i && icerikKap.parentElement !== i) i.appendChild(icerikKap);
  }, [icerikTamda, baslikKap, icerikKap]);

  return (
    <>
      {baslikKap && createPortal(baslik, baslikKap)}
      {icerikKap && createPortal(children, icerikKap)}

      {/*
        Sağ kenar şeridi: haritada yatay sürükleme haritayı kaydırdığı için
        tam ekran listeyi ekranın sağ kenarından sola kaydırarak açıyoruz.
        Şerit dar (12 px): sağdaki harita düğmeleri kenardan 12 px içeride.
      */}
      {!tamEkran && (
        <div
          onPointerDown={kenarBasla}
          onPointerMove={kenarSurukle}
          onPointerUp={kenarBirak}
          onPointerCancel={kenarBirak}
          aria-hidden
          className="absolute bottom-20 right-0 top-[18%] z-[25] w-3 touch-none"
        />
      )}

      <motion.section
        drag="y"
        dragListener={false}
        dragControls={kontrol}
        dragConstraints={{ top: 0, bottom: duraklar.kapali }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={birakildi}
        animate={{ y: duraklar[durum] }}
        transition={{ type: "spring", stiffness: 420, damping: 42, mass: 0.9 }}
        style={{ height: yukseklik }}
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[24px] border-t border-cizgi bg-yuzey/92 shadow-[0_-14px_50px_-16px_rgba(14,14,17,0.28)] backdrop-blur-2xl"
      >
        {/* Tutamak + başlık: yukarı/aşağı sürüklenir, sola güçlü kaydırma tam ekran açar */}
        <div
          onPointerDown={(e) => {
            tutamakKaydirma.onPointerDown(e);
            kontrol.start(e);
          }}
          onClick={() => onDurum(durum === "kapali" ? "acik" : durum)}
          className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2 active:cursor-grabbing"
        >
          <div className="relative mb-2 flex items-center justify-center">
            <div className="h-1.5 w-10 rounded-full bg-cizgi" />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTamEkran(true);
              }}
              aria-label="Listeyi tam ekran aç"
              title="Tam ekran liste (ya da sola kaydır)"
              className="absolute -top-1 right-0 flex h-6 items-center gap-1 rounded-hap px-2 text-[10px] font-bold text-gri hover:bg-yuzey2"
            >
              Tam ekran ⤢
            </button>
          </div>
          <div ref={altBaslikYuva} />
        </div>

        <div
          ref={altIcerikYuva}
          className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        />
      </motion.section>

      {/* Tam ekran liste: sağdan kayarak gelir, sağa kaydırınca kapanır. */}
      <motion.section
        aria-hidden={!katmanGorunur}
        drag={tamEkran ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.9 }}
        dragMomentum={false}
        onDragEnd={(_, b) => {
          if (b.offset.x > 90 || b.velocity.x > 450) {
            kaydir("kapali", b.velocity.x);
            onTamEkran(false);
          } else {
            kaydir("acik", b.velocity.x);
          }
        }}
        style={{
          x,
          touchAction: "pan-y",
          visibility: katmanGorunur ? "visible" : "hidden",
          pointerEvents: katmanGorunur ? "auto" : "none",
          willChange: "transform",
        }}
        className="absolute inset-0 z-40 flex flex-col bg-yuzey shadow-yuzen"
      >
        <div className="shrink-0 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
          <div className="mb-2 flex items-center justify-end gap-2">
            <span className="text-[10.5px] font-semibold text-gri">
              Sağa kaydırarak da kapanır
            </span>
            <button
              onClick={() => onTamEkran(false)}
              className="flex h-8 items-center gap-1 rounded-hap bg-yuzey2 px-3 text-[12px] font-bold text-gri"
            >
              Harita →
            </button>
          </div>
          <div ref={tamBaslikYuva} />
        </div>
        <div
          ref={tamIcerikYuva}
          className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        />
      </motion.section>
    </>
  );
}
