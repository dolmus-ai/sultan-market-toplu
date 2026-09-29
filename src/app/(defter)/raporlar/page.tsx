"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/defter/components/Shell";
import { supabase } from "@/defter/lib/supabase";
import {
  ayOnce,
  bugun,
  gunOnce,
  kartliMi,
  para,
  saatFmt,
  tarihFmt,
  TUR_LABEL,
  YONTEM_LABEL,
} from "@/defter/lib/format";
import type { CariOzet, Hareket, OdemeYontemi } from "@/defter/lib/types";

// Özet toplamları için hareketin yalnızca bu alanları okunur
type OzetHareket = Pick<Hareket, "tur" | "tutar" | "odeme_yontemi"> & {
  kartlar?: { ad: string } | null;
};

type Donem = "gun" | "hafta" | "ay" | "alti_ay";

const DONEMLER: [Donem, string][] = [
  ["gun", "Bugün"],
  ["hafta", "Son 7 Gün"],
  ["ay", "Bu Ay"],
  ["alti_ay", "Son 6 Ay"],
];

const baslangic = (d: Donem) => {
  if (d === "hafta") return gunOnce(6);
  if (d === "alti_ay") return ayOnce(6);
  if (d === "ay") {
    const t = new Date();
    t.setDate(1);
    const ay = String(t.getMonth() + 1).padStart(2, "0");
    return `${t.getFullYear()}-${ay}-01`;
  }
  return bugun();
};

// İşlem geçmişi tek seferde bu kadar satır getirir; "Daha Fazla" ile artar
const SAYFA = 50;

// Özet toplamları sayfa sayfa çekilir: 6 aylık aralıkta sunucunun satır
// sınırına takılıp toplamlar eksik hesaplanmasın
const PARCA = 1000;

export default function RaporlarPage() {
  const [donem, setDonem] = useState<Donem>("gun");
  // Tarihe göre arama: doldurulan alanlar dönem düğmelerinin yerine geçer
  const [ozelBas, setOzelBas] = useState("");
  const [ozelBit, setOzelBit] = useState("");
  const [hareketler, setHareketler] = useState<OzetHareket[]>([]);
  const [bakiyeler, setBakiyeler] = useState<CariOzet[]>([]);
  const [audit, setAudit] = useState<Hareket[]>([]);
  const [limit, setLimit] = useState(SAYFA);
  const [devamVar, setDevamVar] = useState(false);

  const ozelMi = Boolean(ozelBas || ozelBit);
  const bas = ozelMi ? ozelBas : baslangic(donem);
  const bit = ozelMi ? ozelBit : "";

  // Seçili aralık (dönem düğmesi veya tarih araması) tüm listelere uygulanır
  const araliktaSorgula = useCallback(
    (secim: string) => {
      let q = supabase.from("hareketler").select(secim);
      if (bas) q = q.gte("tarih", bas);
      if (bit) q = q.lte("tarih", bit);
      return q;
    },
    [bas, bit]
  );

  useEffect(() => {
    let iptal = false;
    (async () => {
      const hepsi: OzetHareket[] = [];
      for (let bastan = 0; ; bastan += PARCA) {
        const { data, error } = await araliktaSorgula(
          "tur,tutar,odeme_yontemi,kartlar(ad)"
        )
          .order("tarih", { ascending: true })
          .order("id", { ascending: true })
          .range(bastan, bastan + PARCA - 1);
        const parca = (data as unknown as OzetHareket[]) ?? [];
        hepsi.push(...parca);
        if (error || parca.length < PARCA) break;
      }
      if (!iptal) setHareketler(hepsi);
    })();
    return () => {
      iptal = true;
    };
  }, [araliktaSorgula]);

  // Aralık değişince işlem geçmişi baştan başlar
  useEffect(() => {
    setLimit(SAYFA);
  }, [araliktaSorgula]);

  useEffect(() => {
    araliktaSorgula("*, cariler(unvan,tip), profiles(full_name), kartlar(ad)")
      .order("created_at", { ascending: false })
      // Bir fazlasını isteyip "devamı var mı" sorusunu tek sorguda yanıtlarız
      .limit(limit + 1)
      .then(({ data }) => {
        const liste = (data as unknown as Hareket[]) ?? [];
        setDevamVar(liste.length > limit);
        setAudit(liste.slice(0, limit));
      });
  }, [araliktaSorgula, limit]);

  useEffect(() => {
    supabase
      .from("cari_ozet")
      .select("*")
      .eq("aktif", true)
      .gt("kalan_bakiye", 0)
      .order("kalan_bakiye", { ascending: false })
      .then(({ data }) => setBakiyeler((data as CariOzet[]) ?? []));
  }, []);

  const toplamlar = useMemo(() => {
    const t = { gelen_odeme: 0, yapilan_odeme: 0, veresiye: 0, fatura: 0 };
    const yontemler: Record<OdemeYontemi, number> = {
      nakit: 0,
      kredi_karti: 0,
      yemek_karti: 0,
    };
    // Kartla yapılan ödemelerin kart adına göre dökümü (gelen / yapılan ayrı)
    const kartGelen = new Map<string, number>();
    const kartYapilan = new Map<string, number>();
    for (const h of hareketler) {
      t[h.tur] += Number(h.tutar);
      if (h.tur === "gelen_odeme" && h.odeme_yontemi)
        yontemler[h.odeme_yontemi] += Number(h.tutar);
      if (h.odeme_yontemi && kartliMi(h.odeme_yontemi)) {
        const hedef = h.tur === "gelen_odeme" ? kartGelen : kartYapilan;
        const ad = h.kartlar?.ad ?? "KART BELİRTİLMEMİŞ";
        hedef.set(ad, (hedef.get(ad) ?? 0) + Number(h.tutar));
      }
    }
    const sirala = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      t,
      yontemler,
      kartGelen: sirala(kartGelen),
      kartYapilan: sirala(kartYapilan),
    };
  }, [hareketler]);

  const borcluMusteriler = bakiyeler.filter((c) => c.tip === "alici").slice(0, 5);
  const borcluToptancilar = bakiyeler
    .filter((c) => c.tip === "satici")
    .slice(0, 5);

  return (
    <Shell title="Raporlar">
      <div className="grid grid-cols-4 gap-2">
        {DONEMLER.map(([d, l]) => (
          <button
            key={d}
            onClick={() => {
              setDonem(d);
              setOzelBas("");
              setOzelBit("");
            }}
            className={`rounded-xl px-1 py-2.5 text-xs font-bold ${
              !ozelMi && donem === d
                ? "bg-green-700 text-white"
                : "bg-white text-stone-600 shadow-sm"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Tarihe göre arama: aralık girilince dönem düğmeleri devre dışı kalır */}
      <div className="mt-2 rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">
          Tarihe Göre Ara
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-[11px] text-stone-400">
            Başlangıç
            <input
              type="date"
              value={ozelBas}
              max={ozelBit || undefined}
              onChange={(e) => setOzelBas(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-2 py-2 text-sm text-stone-800"
            />
          </label>
          <label className="flex-1 text-[11px] text-stone-400">
            Bitiş
            <input
              type="date"
              value={ozelBit}
              min={ozelBas || undefined}
              onChange={(e) => setOzelBit(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-2 py-2 text-sm text-stone-800"
            />
          </label>
          {ozelMi && (
            <button
              onClick={() => {
                setOzelBas("");
                setOzelBit("");
              }}
              className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600"
            >
              Temizle
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-stone-400">
          {ozelMi
            ? `Aralık: ${bas ? tarihFmt(bas) : "en baştan"} — ${
                bit ? tarihFmt(bit) : "bugüne kadar"
              }`
            : `Seçili dönem: ${
                DONEMLER.find(([d]) => d === donem)?.[1]
              } (${tarihFmt(bas)} sonrası)`}
        </p>
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">Özet</div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          {(Object.keys(TUR_LABEL) as (keyof typeof TUR_LABEL)[]).map((k) => (
            <div key={k} className="contents">
              <div className="text-stone-500">{TUR_LABEL[k]}</div>
              <div className="text-right font-semibold">
                {para(toplamlar.t[k])}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-stone-100 pt-2">
          <div className="mb-1 text-xs font-bold text-stone-400">
            Gelen Ödeme Dağılımı
          </div>
          <div className="grid grid-cols-3 text-center text-xs">
            {(Object.keys(YONTEM_LABEL) as OdemeYontemi[]).map((y) => (
              <div key={y}>
                <div className="text-stone-400">{YONTEM_LABEL[y]}</div>
                <div className="font-bold">{para(toplamlar.yontemler[y])}</div>
              </div>
            ))}
          </div>
        </div>
        {(
          [
            ["Kart Dağılımı — Gelen Ödeme", toplamlar.kartGelen],
            ["Kart Dağılımı — Yapılan Ödeme", toplamlar.kartYapilan],
          ] as const
        ).map(
          ([baslik, satirlar]) =>
            satirlar.length > 0 && (
              <div
                key={baslik}
                className="mt-3 border-t border-stone-100 pt-2"
              >
                <div className="mb-1 text-xs font-bold text-stone-400">
                  {baslik}
                </div>
                <ul className="text-sm">
                  {satirlar.map(([ad, tutar]) => (
                    <li key={ad} className="flex justify-between py-0.5">
                      <span className="text-stone-500">💳 {ad}</span>
                      <span className="font-semibold">{para(tutar)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            En Borçlu Müşteriler
          </div>
          {borcluMusteriler.length === 0 && (
            <p className="text-xs text-stone-400">Borçlu müşteri yok. 🎉</p>
          )}
          {borcluMusteriler.map((c) => (
            <Link
              key={c.id}
              href={`/cariler/${c.id}`}
              className="flex justify-between py-1.5 text-sm"
            >
              <span>{c.unvan}</span>
              <span className="font-bold text-red-600">
                {para(Number(c.kalan_bakiye))}
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            En Çok Borçlu Olduğumuz Toptancılar
          </div>
          {borcluToptancilar.length === 0 && (
            <p className="text-xs text-stone-400">Toptancı borcu yok. 🎉</p>
          )}
          {borcluToptancilar.map((c) => (
            <Link
              key={c.id}
              href={`/cariler/${c.id}`}
              className="flex justify-between py-1.5 text-sm"
            >
              <span>{c.unvan}</span>
              <span className="font-bold text-red-600">
                {para(Number(c.kalan_bakiye))}
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <div className="text-sm font-bold text-stone-700">
              İşlem Geçmişi (kim, ne zaman, ne girdi)
            </div>
            <span className="shrink-0 text-xs text-stone-400">
              {audit.length} kayıt
            </span>
          </div>
          {audit.length === 0 && (
            <p className="text-xs text-stone-400">
              Seçili tarih aralığında işlem yok.
            </p>
          )}
          <ul className="divide-y divide-stone-100">
            {audit.map((h) => (
              <li key={h.id} className="py-2 text-xs">
                <span className="font-bold">{h.profiles?.full_name}</span>{" "}
                <span className="text-stone-500">
                  {saatFmt(h.created_at)} —
                </span>{" "}
                {h.cariler?.unvan}: {TUR_LABEL[h.tur]}{" "}
                <span className="font-bold">{para(Number(h.tutar))}</span>
                {h.kartlar?.ad && (
                  <span className="text-stone-400"> · 💳 {h.kartlar.ad}</span>
                )}
              </li>
            ))}
          </ul>
          {/* Liste sayfa sayfa uzar: geçmiş aşağıya doğru açılır */}
          {devamVar && (
            <button
              onClick={() => setLimit((n) => n + SAYFA)}
              className="mt-3 w-full rounded-xl bg-stone-100 py-3 text-sm font-bold text-stone-600"
            >
              ↓ Daha Fazla Göster
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
