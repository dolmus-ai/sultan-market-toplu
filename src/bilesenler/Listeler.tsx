"use client";

import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  adresYaz,
  gecikmeYaz,
  gunlerYaz,
  miktarYaz,
  para,
  saat,
} from "@/lib/bicim";
import { kayitTutari } from "@/lib/veri";
import type { Abonelik, Sepet, Siparis } from "@/lib/tipler";

/* ------------------------------------------------------------------ */
/* Ortak seçim kutusu                                                  */
/* ------------------------------------------------------------------ */

/** Toplu seçim onay kutusu — üç listede de aynı görünüyor. */
function SecimKutusu({ isaretli }: { isaretli: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        isaretli ? "border-kirmizi bg-kirmizi text-white" : "border-cizgi bg-yuzey"
      }`}
    >
      {isaretli && <span className="text-[10px] font-black">✓</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Teslimat satırı                                                     */
/* ------------------------------------------------------------------ */

export function TeslimatSatiri({
  siparis,
  sira,
  secili,
  secimModu,
  isaretli,
  gecikme,
  binaSayisi,
  onTikla,
  onIslemler,
  hizli,
  sirala,
}: {
  siparis: Siparis;
  sira?: number;
  secili: boolean;
  secimModu: boolean;
  isaretli: boolean;
  /** Planlanan saate göre gecikme (dk); pozitifse gecikmiş. */
  gecikme?: number | null;
  /** Aynı binadaki toplam teslimat sayısı (1'den büyükse rozet çıkar). */
  binaSayisi?: number;
  onTikla: () => void;
  /** Verilirse satırın sağında işlem menüsü düğmesi çıkar. */
  onIslemler?: () => void;
  /** Hızlı liste: açık siparişte ✓ teslim et ve ⤼ atla düğmeleri. */
  hizli?: { onTeslim: () => void; onAtla: () => void };
  /** Sırayı düzenle: ▲ ▼ düğmeleri (uçtakinde biri yok). */
  sirala?: { onYukari?: () => void; onAsagi?: () => void };
}) {
  const konumYok = siparis.adres?.lat == null;
  const acik = ["bekliyor", "hazirlaniyor", "yolda", "basarisiz"].includes(
    siparis.durum,
  );

  return (
    <motion.button
      layout
      onClick={onTikla}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-yuzey2 ${
        secili || isaretli ? "bg-kirmizi-sis" : "bg-yuzey"
      }`}
    >
      {/* Sol: seçim kutusu, rota sırası ya da durum renkli baş harfler */}
      <span className="flex w-9 shrink-0 items-center justify-center">
        {secimModu ? (
          <SecimKutusu isaretli={isaretli} />
        ) : sira ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-kontrast text-[13px] font-black text-white">
            {sira}
          </span>
        ) : (
          <MusteriAvatar ad={siparis.musteri?.ad} durum={siparis.durum} />
        )}
      </span>

      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[13px] font-bold">
            {siparis.musteri?.ad ?? "Müşteri"}
          </span>
          {siparis.oncelik > 0 && <Etiket ton="kirmizi">Acil</Etiket>}
          {gecikme != null && gecikme > 0 && (
            <Etiket ton="kirmizi">{gecikmeYaz(gecikme)}</Etiket>
          )}
          {(binaSayisi ?? 0) > 1 && <Etiket ton="siyah">Bina·{binaSayisi}</Etiket>}
          {konumYok && <Etiket ton="siyah">Konumsuz</Etiket>}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-gri">
          <span
            className="shrink-0 font-bold"
            style={{ color: DURUM_STIL[siparis.durum].background }}
          >
            {DURUM_ETIKET[siparis.durum]}
          </span>
          {siparis.planlanan_saat && (
            <span className="shrink-0">· {saat(siparis.planlanan_saat)}</span>
          )}
          {siparis.kaynak === "abonelik" && <span className="shrink-0">· Abone</span>}
          <span className="truncate">
            · {siparis.adres ? adresYaz(siparis.adres) : "Adres tanımsız"}
          </span>
        </span>
      </span>

      <span className="shrink-0 text-right leading-tight">
        <span className="block whitespace-nowrap text-[13px] font-extrabold">
          {para(siparis.tutar)}
        </span>
        {siparis.odeme_alindi != null && (
          <span
            className={`mt-1 block text-[10px] font-bold ${
              siparis.odeme_alindi === false ? "text-turuncu" : "text-yesil"
            }`}
          >
            {siparis.odeme_alindi === false ? "Alınmadı" : "✓ Tahsil"}
          </span>
        )}
      </span>
      {sirala && !secimModu ? (
        <span className="flex shrink-0 flex-col gap-0.5">
          <KucukDugme etiket="Yukarı taşı" onTikla={sirala.onYukari}>
            ▲
          </KucukDugme>
          <KucukDugme etiket="Aşağı taşı" onTikla={sirala.onAsagi}>
            ▼
          </KucukDugme>
        </span>
      ) : hizli && acik && !secimModu ? (
        <span className="flex shrink-0 gap-1">
          <KucukDugme etiket="Atla" onTikla={hizli.onAtla} ton="atla">
            ⤼
          </KucukDugme>
          <KucukDugme etiket="Teslim edildi" onTikla={hizli.onTeslim} ton="teslim">
            ✓
          </KucukDugme>
        </span>
      ) : (
        onIslemler && !secimModu && <IslemDugmesi onTikla={onIslemler} />
      )}
    </motion.button>
  );
}

/** Satır içi küçük düğme — satırın kendi tıklamasını tetiklemez. */
function KucukDugme({
  children,
  etiket,
  onTikla,
  ton = "notr",
}: {
  children: React.ReactNode;
  etiket: string;
  onTikla?: () => void;
  ton?: "notr" | "teslim" | "atla";
}) {
  const stil = {
    notr: "h-5 w-7 bg-yuzey2 text-[10px] text-gri",
    teslim: "h-8 w-8 bg-yesil text-white",
    atla: "h-8 w-8 bg-yuzey2 text-turuncu",
  }[ton];
  return (
    <span
      role="button"
      tabIndex={onTikla ? 0 : -1}
      aria-label={etiket}
      aria-disabled={!onTikla}
      onClick={(e) => {
        e.stopPropagation();
        onTikla?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onTikla?.();
        }
      }}
      className={`flex items-center justify-center rounded-full text-[13px] font-black ${stil} ${
        onTikla ? "cursor-pointer active:scale-90" : "opacity-30"
      }`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Abonelik satırı                                                     */
/* ------------------------------------------------------------------ */

export function AbonelikSatiri({
  abonelik,
  bugun,
  secimModu = false,
  isaretli = false,
  onTikla,
  onIslemler,
}: {
  abonelik: Abonelik;
  bugun: boolean;
  secimModu?: boolean;
  isaretli?: boolean;
  onTikla: () => void;
  onIslemler?: () => void;
}) {
  const tutar = kayitTutari(abonelik);
  return (
    // `layout` yok: abonelik listesi binlerce satıra çıkabiliyor ve Motion'ın
    // yerleşim animasyonu her satırı ölçtüğü için telefonda sekme geçişini
    // saniyelere çıkarıyordu. Bu liste zaten yeniden sıralanmıyor.
    <motion.button
      onClick={onTikla}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-yuzey2 ${
        isaretli ? "bg-kirmizi-sis" : "bg-yuzey"
      }`}
    >
      <span className="flex w-9 shrink-0 items-center justify-center">
        {secimModu ? (
          <SecimKutusu isaretli={isaretli} />
        ) : (
          <MusteriAvatar ad={abonelik.musteri?.ad} vurgu={bugun} />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[13px] font-bold">
            {abonelik.musteri?.ad ?? "Müşteri"}
          </span>
          {bugun && <Etiket ton="kirmizi">Bugün</Etiket>}
        </span>
        {/*
          Adres satırın en işe yarar bilgisi: defterden gelen 1200 abonenin
          çoğunda başlık aynı ("Abonelik"), kurye kişiyi adresinden tanıyor.
          Gün, saat ve telefon adresin önünde kısa duruyor.
        */}
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-gri">
          <span className="shrink-0 font-semibold text-metin/70">
            {gunlerYaz(abonelik.gunler)} · {saat(abonelik.teslim_saati)}
          </span>
          {abonelik.musteri?.telefon && (
            <span className="shrink-0">· {abonelik.musteri.telefon}</span>
          )}
          <span className="truncate">
            · {abonelik.adres ? adresYaz(abonelik.adres) : "Adres tanımsız"}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right text-[13px] font-extrabold">
        {para(tutar)}
      </span>
      {onIslemler && !secimModu && <IslemDugmesi onTikla={onIslemler} />}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Sepet satırı                                                        */
/* ------------------------------------------------------------------ */

export function SepetSatiri({
  sepet,
  secimModu = false,
  isaretli = false,
  onTikla,
  onIslemler,
}: {
  sepet: Sepet;
  secimModu?: boolean;
  isaretli?: boolean;
  onTikla: () => void;
  onIslemler?: () => void;
}) {
  return (
    // Abonelik satırıyla aynı sebeple `layout` yok.
    <motion.button
      onClick={onTikla}
      whileTap={{ scale: 0.985 }}
      className={`flex w-full items-center gap-3 rounded-[20px] border p-3 text-left transition-colors ${
        isaretli
          ? "border-kirmizi bg-kirmizi-sis"
          : "border-cizgi bg-yuzey hover:bg-yuzey2"
      }`}
    >
      {secimModu && <SecimKutusu isaretli={isaretli} />}
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
        {sepet.musteri?.ad ?? "Müşteri"}
      </span>
      <Etiket>Açık sepet</Etiket>
      <span className="shrink-0 text-[13.5px] font-black">
        {para(kayitTutari(sepet))}
      </span>
      {onIslemler && !secimModu && <IslemDugmesi onTikla={onIslemler} />}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Liste arama kutusu                                                  */
/* ------------------------------------------------------------------ */

/**
 * Uzun listelerde ad, telefon ya da adresle süzme.
 *
 * Defter yüklendikten sonra abonelik listesi binleri buluyor; kuryenin
 * aradığı kişiyi kaydırarak bulması mümkün değil.
 */
export function ListeArama({
  deger,
  yerTutucu,
  sonuc,
  toplam,
  onDegis,
}: {
  deger: string;
  yerTutucu: string;
  /** Süzmeden sonra kalan kayıt sayısı. */
  sonuc: number;
  toplam: number;
  onDegis: (d: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mt-1 bg-yuzey pb-2 pt-1">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12.5px] text-gri">
          🔎
        </span>
        <input
          value={deger}
          onChange={(e) => onDegis(e.target.value)}
          placeholder={yerTutucu}
          className="h-11 w-full rounded-2xl border border-cizgi bg-yuzey2 pl-10 pr-10 text-[12.5px] font-semibold outline-none placeholder:font-medium placeholder:text-gri focus:border-kirmizi"
        />
        {deger && (
          <button
            onClick={() => onDegis("")}
            aria-label="Aramayı temizle"
            className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[13.5px] font-black text-gri hover:bg-yuzey"
          >
            ×
          </button>
        )}
      </div>
      {toplam > 0 && (
        <p className="mt-1.5 px-1 text-[10.5px] font-bold text-gri">
          {sonuc === toplam
            ? `${toplam} kayıt`
            : `${sonuc} / ${toplam} kayıt`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ortak küçük parçalar                                                */
/* ------------------------------------------------------------------ */

/** Satır sağındaki üç nokta — düzenle / sil menüsünü açar. */
export function IslemDugmesi({ onTikla }: { onTikla: () => void }) {
  return (
    <motion.span
      whileTap={{ scale: 0.9 }}
      role="button"
      tabIndex={0}
      aria-label="Kayıt işlemleri"
      onClick={(e) => {
        e.stopPropagation();
        onTikla();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onTikla();
        }
      }}
      className="flex h-7 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[14px] font-black leading-none text-gri hover:bg-yuzey2"
    >
      ⋯
    </motion.span>
  );
}

export function Etiket({
  children,
  ton = "notr",
}: {
  children: React.ReactNode;
  ton?: "notr" | "kirmizi" | "siyah";
}) {
  // Yumuşak tonlar: dolu kırmızı/siyah rozet listede göz yoruyordu.
  const stiller = {
    notr: "bg-yuzey2 text-gri",
    kirmizi: "bg-kirmizi/12 text-kirmizi",
    siyah: "bg-metin/8 text-metin/80",
  };
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${stiller[ton]}`}
    >
      {children}
    </span>
  );
}

/**
 * Sipariş kalemleri. Kuryenin ürün bilgisine ihtiyacı yok — kapıda teslim
 * ederken önemli olan kaç birim taşıdığı ve satırın tutarı.
 */
export function KalemListesi({
  kalemler,
}: {
  kalemler: {
    id: string;
    miktar: number;
    birim_fiyat?: number;
    urun: { birim: string; fiyat: number } | null;
  }[];
}) {
  return (
    <ul className="divide-y divide-cizgi overflow-hidden rounded-[20px] border border-cizgi bg-yuzey">
      {kalemler.map((k) => {
        const fiyat = k.birim_fiyat ?? k.urun?.fiyat ?? 0;
        return (
          <li
            key={k.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3"
          >
            <span className="text-[12.5px] font-bold">
              {miktarYaz(k.miktar, k.urun?.birim ?? "adet")}
            </span>
            <span className="text-[12.5px] font-black">
              {para(k.miktar * fiyat)}
            </span>
          </li>
        );
      })}
      {kalemler.length === 0 && (
        <li className="px-4 py-6 text-center text-sm text-gri">Kalem yok.</li>
      )}
    </ul>
  );
}

/** Ad soyaddan iki baş harf. */
function basHarfler(ad: string | null | undefined): string {
  const parca = (ad ?? "").trim().split(/\s+/).filter(Boolean);
  if (parca.length === 0) return "?";
  const ilk = parca[0][0] ?? "";
  const son = parca.length > 1 ? (parca[parca.length - 1][0] ?? "") : "";
  return (ilk + son).toLocaleUpperCase("tr");
}

/**
 * Müşteri baş harfleri. Teslimatta zemin ve köşedeki nokta durumun rengini
 * taşıyor; kurye satırı okumadan durumu renginden tanıyor.
 */
export function MusteriAvatar({
  ad,
  durum,
  vurgu = false,
  boyut = 36,
}: {
  ad: string | null | undefined;
  durum?: Siparis["durum"];
  /** Abonelikte "bugün teslimat var". */
  vurgu?: boolean;
  boyut?: number;
}) {
  const renk = durum
    ? DURUM_STIL[durum].background
    : vurgu
      ? "var(--color-kirmizi)"
      : "var(--color-gri)";
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{
        width: boyut,
        height: boyut,
        fontSize: Math.round(boyut * 0.36),
        background: `color-mix(in srgb, ${renk} 14%, transparent)`,
        color: renk,
      }}
    >
      {basHarfler(ad)}
      {durum && (
        <span
          className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2 ring-yuzey"
          style={{ background: renk }}
        />
      )}
    </span>
  );
}
