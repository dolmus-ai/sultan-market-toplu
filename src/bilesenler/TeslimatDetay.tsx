"use client";

import { useState } from "react";
import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  odemeAdi,
  SEBEP_ETIKET,
  adresYaz,
  gecikmeDk,
  gecikmeYaz,
  para,
  saat,
} from "@/lib/bicim";
import { haversine, mesafeYaz } from "@/lib/rota";
import { Etiket, MusteriAvatar } from "./Listeler";
import { waAc, waNumarasi } from "@/lib/whatsapp";
import type { Nokta, Siparis, SiparisDurumu } from "@/lib/tipler";

type Props = {
  siparis: Siparis;
  kuryeKonumu: Nokta | null;
  islemde: boolean;
  onKapat: () => void;
  onDurum: (durum: SiparisDurumu) => void;
  onTeslimSonucu: (mod: "teslim" | "basarisiz") => void;
  onNavigasyon: () => void;
  onKonumDuzelt: () => void;
  onNotKaydet: (kuryeNotu: string, kapiKodu: string) => void;
  /** Teslim fotoğrafının imzalı bağlantısı; yoksa null. */
  onFotoGetir?: () => Promise<string | null>;
};

export default function TeslimatDetay({
  siparis,
  kuryeKonumu,
  islemde,
  onKapat,
  onDurum,
  onTeslimSonucu,
  onNavigasyon,
  onKonumDuzelt,
  onNotKaydet,
  onFotoGetir,
}: Props) {
  const adres = siparis.adres;
  const konumVar = adres?.lat != null && adres?.lng != null;

  const [notAcik, setNotAcik] = useState(false);
  const [kuryeNotu, setKuryeNotu] = useState(adres?.kurye_notu ?? "");
  const [kapiKodu, setKapiKodu] = useState(adres?.kapi_kodu ?? "");
  const [foto, setFoto] = useState<
    { durum: "yok" } | { durum: "yukleniyor" } | { durum: "var"; url: string } | null
  >(null);

  async function fotoGoster() {
    if (!onFotoGetir) return;
    setFoto({ durum: "yukleniyor" });
    try {
      const url = await onFotoGetir();
      setFoto(url ? { durum: "var", url } : { durum: "yok" });
    } catch {
      setFoto({ durum: "yok" });
    }
  }

  const waVar = waNumarasi(siparis.musteri?.telefon) != null;
  const kapanmis = ["teslim", "basarisiz", "iptal"].includes(siparis.durum);

  const mesafe =
    kuryeKonumu && konumVar
      ? haversine(kuryeKonumu, { lat: adres!.lat!, lng: adres!.lng! })
      : null;

  const gecikme = gecikmeDk(siparis.planlanan_saat, siparis.planlanan_tarih);
  const gecikti =
    gecikme != null &&
    gecikme > 0 &&
    !["teslim", "iptal"].includes(siparis.durum);

  const notDegisti =
    kuryeNotu !== (adres?.kurye_notu ?? "") ||
    kapiKodu !== (adres?.kapi_kodu ?? "");

  const odemeEtiketi =
    siparis.odeme_alindi === false ? "Alınamadı" : odemeAdi(siparis.odeme_yontemi);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="space-y-2.5 pb-4"
    >
      {/* Başlık: baş harfler, ad, durum */}
      <div className="flex items-center gap-3">
        <MusteriAvatar ad={siparis.musteri?.ad} durum={siparis.durum} boyut={42} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-[17px] font-extrabold leading-tight tracking-tight">
              {siparis.musteri?.ad ?? "Müşteri"}
            </h2>
            {/* Telefon adın yanında: dokununca arar */}
            {siparis.musteri?.telefon && (
              <a
                href={`tel:${siparis.musteri.telefon.replace(/\s/g, "")}`}
                className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-gri underline-offset-2 active:underline"
              >
                {siparis.musteri.telefon}
              </a>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            <span
              className="font-bold"
              style={{ color: DURUM_STIL[siparis.durum].background }}
            >
              ● {DURUM_ETIKET[siparis.durum]}
            </span>
            {siparis.planlanan_saat && (
              <span className="text-gri">· {saat(siparis.planlanan_saat)}</span>
            )}
            {siparis.kaynak === "abonelik" && <Etiket>Abonelik</Etiket>}
            {gecikti && <Etiket ton="kirmizi">{gecikmeYaz(gecikme)} gecikti</Etiket>}
          </div>
        </div>
        <button
          onClick={onKapat}
          aria-label="Kapat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[16px] font-bold text-gri active:scale-90"
        >
          ×
        </button>
      </div>

      {/* Adres kartı */}
      <div className="space-y-1.5 rounded-2xl bg-yuzey2 p-3">
        <p className="flex gap-2 text-[12.5px] font-semibold leading-snug">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-kirmizi">
            <path
              d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          {adres ? adresYaz(adres) : "Adres tanımsız"}
        </p>
        {adres?.tarif && (
          <p className="pl-[23px] text-[12px] leading-snug text-gri">{adres.tarif}</p>
        )}
        {adres?.kurye_notu && (
          <p className="rounded-xl bg-kirmizi/10 px-2.5 py-1.5 text-[12px] font-semibold text-kirmizi-koyu">
            🛵 {adres.kurye_notu}
            {adres.kapi_kodu ? ` · Kapı ${adres.kapi_kodu}` : ""}
          </p>
        )}
      </div>

      {/* Önceki deneme başarısızsa */}
      {siparis.durum === "basarisiz" && siparis.basarisizlik_sebebi && (
        <div className="rounded-2xl bg-turuncu/10 px-3 py-2.5">
          <p className="text-[12px] font-bold">
            {SEBEP_ETIKET[siparis.basarisizlik_sebebi]}
            {siparis.deneme_sayisi > 1 && ` · ${siparis.deneme_sayisi}. deneme`}
          </p>
          {siparis.basarisizlik_notu && (
            <p className="mt-0.5 text-[12px] text-gri">{siparis.basarisizlik_notu}</p>
          )}
        </div>
      )}

      {/* Teslimde girilen ödeme: yöntem, tutar, ödeyen */}
      {siparis.odeme_alindi === true && (
        <div
          className={`rounded-2xl px-3 py-2.5 ${
            siparis.odeme_yontemi === "veresiye" ? "bg-turuncu/10" : "bg-yesil/10"
          }`}
        >
          <p
            className={`text-[11px] font-bold ${
              siparis.odeme_yontemi === "veresiye" ? "text-turuncu" : "text-yesil"
            }`}
          >
            {siparis.odeme_yontemi === "veresiye" ? "Veresiye yazıldı" : "✓ Ödeme alındı"}
          </p>
          <p className="mt-0.5 text-[12.5px] font-bold">
            {[
              siparis.odeme_tutari != null ? para(siparis.odeme_tutari) : null,
              odemeAdi(siparis.odeme_yontemi),
              siparis.odeme_yapan,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      {/* Ödeme alınamadıysa kimden alınamadığı burada duruyor */}
      {siparis.odeme_alindi === false && (
        <div className="rounded-2xl bg-turuncu/10 px-3 py-2.5">
          <p className="text-[11px] font-bold text-turuncu">Ödeme alınamadı</p>
          <p className="mt-0.5 text-[12.5px] font-bold">
            {siparis.odeme_alinmayan_kisi || siparis.musteri?.ad || "—"} ·{" "}
            {para(siparis.tutar)}
          </p>
          {siparis.odeme_notu && (
            <p className="mt-0.5 text-[12px] text-gri">{siparis.odeme_notu}</p>
          )}
        </div>
      )}

      {/* Bilgi şeridi: tek kart, üç sütun */}
      <div className="grid grid-cols-3 divide-x divide-cizgi rounded-2xl border border-cizgi bg-yuzey py-2">
        <Kutu ust="Tutar" alt={para(siparis.tutar)} vurgu />
        <Kutu ust="Ödeme" alt={odemeEtiketi} />
        <Kutu
          ust={mesafe != null ? "Uzaklık" : "Saat"}
          alt={mesafe != null ? mesafeYaz(mesafe) : saat(siparis.planlanan_saat)}
        />
      </div>

      {/* Eylemler: simge üstte, yazı altta — başparmakla kolay */}
      <div className="flex gap-2">
        {konumVar && (
          <Eylem onClick={onNavigasyon} etiket="Yol tarifi" koyu>
            <path
              d="M3 11 21 3l-8 18-2-7-8-3Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </Eylem>
        )}
        {siparis.musteri?.telefon && (
          <Eylem
            href={`tel:${siparis.musteri.telefon.replace(/\s/g, "")}`}
            etiket="Ara"
          >
            <path
              d="M5 4h3.5l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </Eylem>
        )}
        {/* Müşteriye WhatsApp — wa.me ile hazır mesaj, gönderen kurye */}
        {waVar && !kapanmis && (
          <>
            <Eylem
              onClick={() => waAc(siparis.musteri?.telefon, "yolda", siparis.musteri?.ad)}
              etiket="Yoldayım"
              wa
            >
              <WaSimge />
            </Eylem>
            <Eylem
              onClick={() => waAc(siparis.musteri?.telefon, "kapida", siparis.musteri?.ad)}
              etiket="Kapıdayım"
              wa
            >
              <WaSimge />
            </Eylem>
          </>
        )}
      </div>

      {/* Teslim fotoğrafı */}
      {onFotoGetir && kapanmis && (
        <div>
          {foto?.durum === "var" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto.url}
              alt="Teslim fotoğrafı"
              className="max-h-64 w-full rounded-2xl object-cover"
            />
          ) : (
            <button
              onClick={() => void fotoGoster()}
              disabled={foto?.durum === "yukleniyor"}
              className="flex h-10 w-full items-center justify-center rounded-2xl bg-yuzey2 text-[12px] font-bold text-gri disabled:opacity-60"
            >
              📷{" "}
              {foto?.durum === "yukleniyor"
                ? "Yükleniyor…"
                : foto?.durum === "yok"
                  ? "Bu teslim için fotoğraf yok"
                  : "Teslim fotoğrafını göster"}
            </button>
          )}
        </div>
      )}

      {/* Kapı bilgisi ve notlar — kurye kendi yazar, sonraki teslimatta da çıkar */}
      <div className="overflow-hidden rounded-2xl border border-cizgi bg-yuzey">
        <button
          onClick={() => setNotAcik(!notAcik)}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-yuzey2"
        >
          <span className="text-[14px]">🚪</span>
          <span className="flex-1 text-[12.5px] font-bold">
            Kapı bilgisi
            {!notAcik && (adres?.kapi_kodu || adres?.kurye_notu) && (
              <span className="ml-1 font-semibold text-gri">· kayıtlı</span>
            )}
          </span>
          <motion.span
            animate={{ rotate: notAcik ? 90 : 0 }}
            className="text-[14px] text-gri"
          >
            ›
          </motion.span>
        </button>

        {notAcik && (
          <div className="space-y-2 border-t border-cizgi p-3">
            <input
              value={kapiKodu}
              onChange={(e) => setKapiKodu(e.target.value)}
              placeholder="Kapı / zil kodu"
              className="h-10 w-full rounded-xl border border-cizgi bg-yuzey2 px-3 text-[12.5px] font-semibold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
            />
            <textarea
              value={kuryeNotu}
              onChange={(e) => setKuryeNotu(e.target.value)}
              rows={2}
              placeholder="Zil çalışmıyor · asansör yok · köpek var · arka kapıdan…"
              className="w-full resize-none rounded-xl border border-cizgi bg-yuzey2 px-3 py-2 text-[12.5px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
            />
            <button
              disabled={!notDegisti || islemde}
              onClick={() => onNotKaydet(kuryeNotu.trim(), kapiKodu.trim())}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-kontrast text-[12px] font-black text-white disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
        )}

        {(siparis.notlar || siparis.musteri?.notlar) && (
          <div className="space-y-1 border-t border-cizgi px-3 py-2.5 text-[12px] text-gri">
            {siparis.notlar && <p>🧾 {siparis.notlar}</p>}
            {siparis.musteri?.notlar && <p>👤 {siparis.musteri.notlar}</p>}
          </div>
        )}
      </div>

      {/* Durum ilerletme */}
      <div className="space-y-2 pt-1">
        {siparis.durum === "bekliyor" && (
          <Ana onClick={() => onDurum("hazirlaniyor")} islemde={islemde}>
            Hazırlığa aldım
          </Ana>
        )}
        {siparis.durum === "hazirlaniyor" && (
          <Ana onClick={() => onDurum("yolda")} islemde={islemde}>
            Yola çıktım
          </Ana>
        )}
        {(siparis.durum === "yolda" || siparis.durum === "basarisiz") && (
          <div className="flex gap-2">
            <button
              onClick={() => onTeslimSonucu("basarisiz")}
              className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-yuzey2 text-[12.5px] font-bold text-gri active:scale-[0.98]"
            >
              Edilemedi
            </button>
            <div className="flex-[2]">
              <Ana onClick={() => onTeslimSonucu("teslim")} islemde={islemde} yesil>
                ✓ Teslim ettim
              </Ana>
            </div>
          </div>
        )}
        {siparis.durum === "teslim" && (
          <div className="flex h-12 items-center justify-center rounded-2xl bg-yesil/10 text-[13px] font-black text-yesil">
            ✓ Teslim edildi
          </div>
        )}

        <button
          onClick={onKonumDuzelt}
          className="flex h-9 w-full items-center justify-center rounded-xl text-[11.5px] font-bold text-gri"
        >
          📍 Konumu düzelt
        </button>
      </div>
    </motion.div>
  );
}

function Ana({
  children,
  onClick,
  islemde,
  yesil,
}: {
  children: React.ReactNode;
  onClick: () => void;
  islemde: boolean;
  yesil?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={islemde}
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-center rounded-2xl text-[13.5px] font-black text-white disabled:opacity-60 ${
        yesil ? "bg-yesil" : "bg-kirmizi shadow-kirmizi hover:bg-kirmizi-koyu"
      }`}
    >
      {islemde ? "Kaydediliyor…" : children}
    </motion.button>
  );
}

/** Bilgi şeridinin tek sütunu. */
function Kutu({ ust, alt, vurgu }: { ust: string; alt: string; vurgu?: boolean }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <p className="text-[10px] font-semibold text-gri">{ust}</p>
      <p
        className={`mt-0.5 truncate text-[13.5px] font-extrabold ${
          vurgu ? "text-kirmizi-koyu" : ""
        }`}
      >
        {alt}
      </p>
    </div>
  );
}

/** Kare eylem düğmesi: simge üstte, kısa yazı altta. */
function Eylem({
  children,
  etiket,
  onClick,
  href,
  koyu,
  wa,
}: {
  children: React.ReactNode;
  etiket: string;
  onClick?: () => void;
  href?: string;
  koyu?: boolean;
  wa?: boolean;
}) {
  const sinif = `flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold active:scale-[0.96] ${
    koyu
      ? "bg-kontrast text-white"
      : wa
        ? "bg-[#25d366]/12 text-[#128c4a]"
        : "bg-yuzey2 text-metin"
  }`;
  const simge = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {children}
    </svg>
  );
  return href ? (
    <a href={href} className={sinif}>
      {simge}
      {etiket}
    </a>
  ) : (
    <button onClick={onClick} className={sinif}>
      {simge}
      {etiket}
    </button>
  );
}

function WaSimge() {
  return (
    <path
      d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}
