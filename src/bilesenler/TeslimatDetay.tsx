"use client";

import { useState } from "react";
import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  ODEME_ETIKET,
  SEBEP_ETIKET,
  adresYaz,
  gecikmeDk,
  gecikmeYaz,
  para,
  saat,
} from "@/lib/bicim";
import { haversine, mesafeYaz } from "@/lib/rota";
import { KalemListesi, Etiket } from "./Listeler";
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
  onWhatsApp: () => void;
  onNotKaydet: (kuryeNotu: string, kapiKodu: string) => void;
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
  onWhatsApp,
  onNotKaydet,
}: Props) {
  const adres = siparis.adres;
  const konumVar = adres?.lat != null && adres?.lng != null;

  const [notAcik, setNotAcik] = useState(false);
  const [kuryeNotu, setKuryeNotu] = useState(adres?.kurye_notu ?? "");
  const [kapiKodu, setKapiKodu] = useState(adres?.kapi_kodu ?? "");

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="space-y-3 pb-4"
    >
      {/* Başlık */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-extrabold tracking-tight">
              {siparis.musteri?.ad ?? "Müşteri"}
            </h2>
            <span
              className="rounded-hap px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide"
              style={DURUM_STIL[siparis.durum]}
            >
              {DURUM_ETIKET[siparis.durum]}
            </span>
            {siparis.kaynak === "abonelik" && <Etiket>Abonelik</Etiket>}
            {gecikti && (
              <Etiket ton="kirmizi">{gecikmeYaz(gecikme)} gecikti</Etiket>
            )}
          </div>
          <p className="mt-1 text-[13px] text-gri">
            {adres ? adresYaz(adres) : "Adres tanımsız"}
          </p>
          {adres?.tarif && (
            <p className="mt-1.5 rounded-2xl bg-yuzey2 px-3 py-2 text-[13px] font-medium">
              📍 {adres.tarif}
            </p>
          )}
          {adres?.kurye_notu && (
            <p className="mt-1.5 rounded-2xl bg-kirmizi-sis px-3 py-2 text-[13px] font-semibold text-kirmizi-koyu">
              🛵 {adres.kurye_notu}
              {adres.kapi_kodu ? ` · Kapı ${adres.kapi_kodu}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={onKapat}
          aria-label="Kapat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-lg font-bold text-gri transition-colors hover:bg-cizgi"
        >
          ×
        </button>
      </div>

      {/* Önceki deneme başarısızsa */}
      {siparis.durum === "basarisiz" && siparis.basarisizlik_sebebi && (
        <div className="rounded-[20px] border border-turuncu/40 bg-turuncu/10 p-3.5">
          <p className="text-[13px] font-black">
            {SEBEP_ETIKET[siparis.basarisizlik_sebebi]}
            {siparis.deneme_sayisi > 1 && ` · ${siparis.deneme_sayisi}. deneme`}
          </p>
          {siparis.basarisizlik_notu && (
            <p className="mt-1 text-[13px] text-gri">
              {siparis.basarisizlik_notu}
            </p>
          )}
        </div>
      )}

      {/* Hızlı bilgiler */}
      <div className="grid grid-cols-3 gap-2">
        <Kutu ust="Tutar" alt={para(siparis.tutar)} vurgu />
        <Kutu
          ust="Ödeme"
          alt={siparis.odeme_yontemi ? ODEME_ETIKET[siparis.odeme_yontemi] : "—"}
        />
        <Kutu
          ust={mesafe != null ? "Uzaklık" : "Saat"}
          alt={mesafe != null ? mesafeYaz(mesafe) : saat(siparis.planlanan_saat)}
        />
      </div>

      {/* Eylemler */}
      <div className="flex gap-2">
        {konumVar && (
          <button
            onClick={onNavigasyon}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-hap bg-kontrast text-[14px] font-bold text-white active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 11 21 3l-8 18-2-7-8-3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            Navigasyon
          </button>
        )}
        {siparis.musteri?.telefon && (
          <>
            <a
              href={`tel:${siparis.musteri.telefon.replace(/\s/g, "")}`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-hap border border-cizgi bg-yuzey text-[14px] font-bold active:scale-[0.98]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 4h3.5l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              Ara
            </a>
            <button
              onClick={onWhatsApp}
              aria-label="WhatsApp'tan haber ver"
              title="WhatsApp'tan haber ver"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-hap border border-cizgi bg-yuzey text-[#25D366] active:scale-[0.98]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.5 1 2.6c.1.2 1.8 2.8 4.4 3.8 1.6.6 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3Z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Sepet */}
      <div>
        <p className="mb-2 mt-1 text-[11px] font-black uppercase tracking-wider text-gri">
          Sepet · {siparis.kalemler?.length ?? 0} kalem
        </p>
        <KalemListesi kalemler={siparis.kalemler ?? []} />
      </div>

      {/* Kapı bilgisi — kurye kendi yazar, sonraki teslimatta da çıkar */}
      <div className="rounded-[20px] border border-cizgi bg-yuzey p-3.5">
        <button
          onClick={() => setNotAcik(!notAcik)}
          className="flex w-full items-center justify-between text-[13px] font-bold"
        >
          Kapı bilgisi
          <span className="text-gri">{notAcik ? "−" : "+"}</span>
        </button>

        {notAcik && (
          <div className="mt-3 space-y-2">
            <input
              value={kapiKodu}
              onChange={(e) => setKapiKodu(e.target.value)}
              placeholder="Kapı / zil kodu"
              className="h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[14px] font-semibold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
            />
            <textarea
              value={kuryeNotu}
              onChange={(e) => setKuryeNotu(e.target.value)}
              rows={2}
              placeholder="Zil çalışmıyor · asansör yok · köpek var · arka kapıdan…"
              className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[14px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
            />
            <button
              disabled={!notDegisti || islemde}
              onClick={() => onNotKaydet(kuryeNotu.trim(), kapiKodu.trim())}
              className="flex h-11 w-full items-center justify-center rounded-hap bg-kontrast text-[13px] font-black text-white disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
        )}

        {(siparis.notlar || siparis.musteri?.notlar) && (
          <div className="mt-3 space-y-1.5 border-t border-cizgi pt-3 text-[13px] text-gri">
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
          <>
            <Ana
              onClick={() => onTeslimSonucu("teslim")}
              islemde={islemde}
              yesil
            >
              ✓ Teslim ettim
            </Ana>
            <button
              onClick={() => onTeslimSonucu("basarisiz")}
              className="flex h-12 w-full items-center justify-center rounded-hap border border-cizgi bg-yuzey text-[14px] font-bold text-gri active:scale-[0.98]"
            >
              Teslim edilemedi
            </button>
          </>
        )}
        {siparis.durum === "teslim" && (
          <div className="flex h-14 items-center justify-center rounded-hap bg-yesil/10 text-[15px] font-black text-yesil">
            ✓ Teslim edildi
          </div>
        )}

        <button
          onClick={onKonumDuzelt}
          className="flex h-12 w-full items-center justify-center rounded-hap text-[13px] font-bold text-gri"
        >
          Konumu düzelt
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
      className={`flex h-14 w-full items-center justify-center rounded-hap text-[15px] font-black text-white disabled:opacity-60 ${
        yesil ? "bg-yesil" : "bg-kirmizi shadow-kirmizi hover:bg-kirmizi-koyu"
      }`}
    >
      {islemde ? "Kaydediliyor…" : children}
    </motion.button>
  );
}

function Kutu({
  ust,
  alt,
  vurgu,
}: {
  ust: string;
  alt: string;
  vurgu?: boolean;
}) {
  return (
    <div
      className={`rounded-[18px] border p-3 ${
        vurgu ? "border-kirmizi/25 bg-kirmizi-sis" : "border-cizgi bg-yuzey"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-gri">
        {ust}
      </p>
      <p
        className={`mt-0.5 truncate text-[15px] font-black ${
          vurgu ? "text-kirmizi-koyu" : ""
        }`}
      >
        {alt}
      </p>
    </div>
  );
}
