"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aboneleriGrupla,
  siteAnahtari,
  type AboneGrubu,
  type GrupUyesi,
} from "@/lib/abone-grup";
import { haversine, mesafeYaz } from "@/lib/rota";
import {
  adBenzerligi,
  kayitliEsi,
  kayitliyiAdayaCevir,
  konumCoz,
  sadelestir,
  siteAdresMetni,
  siteAra,
  type SiteAdayi,
} from "@/lib/site";
import { siteEkle } from "@/lib/veri";
import type { Abonelik, KayitliSite, Nokta } from "@/lib/tipler";

/**
 * Toplu konum düzeltme — adres bulucunun "Toplu düzelt" sekmesi.
 *
 * Defterden gelen konumsuz abonelikler sitelerine göre gruplanır. Bir siteye
 * tek konum verilince (Google Haritalar'dan yapıştırılan bağlantı ya da
 * listemizdeki site) o sitedeki her abone, sahibinin elle yaptığı gibi
 * yeniden kurulur: yeni adres (site adı + sokak + mahalle + ilçe, konumu
 * doğrulanmış; blok/daire ve kapı şifresi tarif alanında), eski aboneliğin
 * günleri ve saati korunarak yeni abonelik açılır (gün/saat boşsa Pzt–Cum
 * 09:00), eski abonelik silinir. Tek kayıt `aboneligi_yeniden_kur`
 * veritabanı işleviyle, bölünmeden yapılır.
 */

type Props = {
  db: SupabaseClient;
  abonelikler: Abonelik[];
  derleme: SiteAdayi[];
  kayitlilar: KayitliSite[];
  sorgu: string;
  merkez: Nokta;
  onGit: (nokta: Nokta) => void;
  /** Kayıtlar yazıldı; liste tazelensin. */
  onDegisti: () => Promise<void> | void;
};

type Oneri = SiteAdayi & {
  /** onaylı: kurye/sahip daha önce bu konumu onayladı; tahmini: hazır liste. */
  guven: "onayli" | "tahmini";
};

/**
 * Grubun adına en uyan hazır konum. Önce onaylı kaynaklar — haritaya
 * eklenmiş siteler ve aynı sitede daha önce düzeltilmiş aboneler (sahibin
 * Google'dan yapıştırdığı noktalar) — sonra hazır liste. Hazır listedeki
 * nokta Google'dan birkaç yüz metre sapabildiği için "tahmini" işaretlenir.
 */
function oneriBul(
  grup: AboneGrubu<Abonelik>,
  kayitlilar: KayitliSite[],
  duzeltilmisler: SiteAdayi[],
  derleme: SiteAdayi[],
): Oneri | null {
  const uyar = (s: SiteAdayi) =>
    siteAnahtari(s.ad) === grup.anahtar || adBenzerligi(grup.ad, s.ad) >= 1;
  const onayli = [...kayitlilar.map(kayitliyiAdayaCevir), ...duzeltilmisler].find(uyar);
  if (onayli) return { ...onayli, guven: "onayli" };
  const tahmini = siteAra(derleme, grup.ad, {}, 5).find(uyar);
  return tahmini ? { ...tahmini, guven: "tahmini" } : null;
}

/**
 * Konumu doğrulanmış abonelik adreslerinden site adayları: adres metninin
 * ilk parçası site adı ("Teras Trio Evleri, 557. Sokak…").
 */
function duzeltilmisSiteler(abonelikler: Abonelik[]): SiteAdayi[] {
  const gorulen = new Set<string>();
  const sonuc: SiteAdayi[] = [];
  for (const a of abonelikler) {
    const adres = a.adres;
    if (!adres?.konum_dogrulandi || adres.lat == null || adres.lng == null) continue;
    const ad = adres.adres_metni.split(",")[0]?.trim();
    if (!ad || ad.length < 3 || /\d/.test(ad.slice(0, 1))) continue;
    const k = siteAnahtari(ad);
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push({
      anahtar: `abone:${a.id}`,
      ad,
      tur: "site",
      ilce: null,
      mahalle: null,
      adres: null,
      lat: adres.lat,
      lng: adres.lng,
      bloklar: [],
      kaynak: "elle",
      kaynak_id: null,
    });
  }
  return sonuc;
}

export default function TopluKonum({
  db,
  abonelikler,
  derleme,
  kayitlilar,
  sorgu,
  merkez,
  onGit,
  onDegisti,
}: Props) {
  const konumsuz = useMemo(
    () => abonelikler.filter((a) => a.adres?.lat == null),
    [abonelikler],
  );
  const gruplar = useMemo(
    () => aboneleriGrupla(konumsuz, (a) => a.adres?.adres_metni ?? ""),
    [konumsuz],
  );
  const duzeltilmisler = useMemo(() => duzeltilmisSiteler(abonelikler), [abonelikler]);
  const [acik, setAcik] = useState<string | null>(null);
  const [tarifGoster, setTarifGoster] = useState(false);

  const q = sadelestir(sorgu);
  const suzulmus = gruplar.filter(
    (g) =>
      !q ||
      sadelestir(g.ad).includes(q) ||
      g.uyeler.some(
        (u) =>
          sadelestir(u.ham).includes(q) ||
          sadelestir(u.kayit.musteri?.ad ?? "").includes(q),
      ),
  );
  const siteGruplari = suzulmus.filter((g) => !g.tarifMi);
  const tarifGruplari = suzulmus.filter((g) => g.tarifMi);
  const siteliAbone = gruplar.filter((g) => !g.tarifMi).reduce((t, g) => t + g.uyeler.length, 0);

  if (konumsuz.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <span className="text-3xl">✅</span>
        <p className="text-sm font-semibold text-gri">
          Konumu olmayan abonelik kalmadı.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-2xl bg-yuzey2 px-3 py-2.5 text-[11px] font-semibold leading-snug text-gri">
        <b className="text-metin">{konumsuz.length}</b> konumsuz abonelik ·{" "}
        {gruplar.filter((g) => !g.tarifMi).length} sitede {siteliAbone} abone ·{" "}
        {gruplar.length - gruplar.filter((g) => !g.tarifMi).length} tarif adresi.
        <span className="mt-1 block">
          Siteye bir kez konum verin; o sitedeki herkes yeni konumla yeniden
          kaydedilir. Teslim günleri ve saati aynen kalır.
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {siteGruplari.map((g) => (
          <GrupKarti
            key={g.anahtar}
            grup={g}
            acik={acik === g.anahtar}
            onAc={() => setAcik(acik === g.anahtar ? null : g.anahtar)}
            db={db}
            derleme={derleme}
            duzeltilmisler={duzeltilmisler}
            kayitlilar={kayitlilar}
            merkez={merkez}
            onGit={onGit}
            onDegisti={onDegisti}
          />
        ))}
        {siteGruplari.length === 0 && (
          <p className="px-2 py-3 text-[12px] font-semibold text-gri">
            Aramaya uyan site yok.
          </p>
        )}
      </div>

      {tarifGruplari.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setTarifGoster(!tarifGoster)}
            className="flex w-full items-center justify-between rounded-2xl px-2.5 py-2 text-[10.5px] font-black uppercase tracking-wider text-gri hover:bg-yuzey2"
          >
            <span>Tarif adresleri · {tarifGruplari.length}</span>
            <span>{tarifGoster ? "Gizle" : "Göster"}</span>
          </button>
          {tarifGoster && (
            <>
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold leading-snug text-gri">
                Bir site adı yok; Google&apos;da da bulunmayabilir. Biliyorsanız
                konumu tek tek yapıştırın, yoksa kurye kapıda işaretlesin.
              </p>
              <div className="space-y-1.5">
                {tarifGruplari.slice(0, 150).map((g) => (
                  <GrupKarti
                    key={g.anahtar}
                    grup={g}
                    acik={acik === g.anahtar}
                    onAc={() => setAcik(acik === g.anahtar ? null : g.anahtar)}
                    db={db}
                    derleme={derleme}
                    duzeltilmisler={duzeltilmisler}
                    kayitlilar={kayitlilar}
                    merkez={merkez}
                    onGit={onGit}
                    onDegisti={onDegisti}
                  />
                ))}
              </div>
              {tarifGruplari.length > 150 && (
                <p className="px-2.5 py-2 text-[10.5px] font-semibold text-gri">
                  İlk 150 gösteriliyor — arama kutusuyla daraltın.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Kayit = {
  durum: "bos" | "kaydediliyor" | "bitti" | "hata";
  yapilan: number;
  toplam: number;
  hatalar: string[];
};

function GrupKarti({
  grup,
  acik,
  onAc,
  db,
  derleme,
  duzeltilmisler,
  kayitlilar,
  merkez,
  onGit,
  onDegisti,
}: {
  grup: AboneGrubu<Abonelik>;
  acik: boolean;
  onAc: () => void;
  db: SupabaseClient;
  derleme: SiteAdayi[];
  duzeltilmisler: SiteAdayi[];
  kayitlilar: KayitliSite[];
  merkez: Nokta;
  onGit: (n: Nokta) => void;
  onDegisti: () => Promise<void> | void;
}) {
  const oneri = useMemo(
    () => (grup.tarifMi ? null : oneriBul(grup, kayitlilar, duzeltilmisler, derleme)),
    [grup, kayitlilar, duzeltilmisler, derleme],
  );
  const [ad, setAd] = useState(oneri?.ad ?? grup.ad);
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set(grup.uyeler.map((u) => u.kayit.id)),
  );
  const [nokta, setNokta] = useState<Nokta | null>(null);
  const [metin, setMetin] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [haritayaEkle, setHaritayaEkle] = useState(true);
  const [kayit, setKayit] = useState<Kayit>({
    durum: "bos",
    yapilan: 0,
    toplam: 0,
    hatalar: [],
  });

  const zatenHaritada = nokta
    ? kayitliEsi({ ad, lat: nokta.lat, lng: nokta.lng, kaynak: "elle", kaynak_id: null }, kayitlilar)
    : null;

  function yapistir(girdi: string) {
    const c = konumCoz(girdi);
    if (!c.tamam) {
      setHata(c.hata);
      return;
    }
    setHata(null);
    setMetin("");
    setNokta(c.nokta);
    onGit(c.nokta);
  }

  async function panodan() {
    try {
      yapistir(await navigator.clipboard.readText());
    } catch {
      setHata("Pano okunamadı — kutuya basılı tutup yapıştırın.");
    }
  }

  async function kaydet() {
    if (!nokta) return;
    const uyeler = grup.uyeler.filter((u) => secili.has(u.kayit.id));
    if (uyeler.length === 0) return;
    setKayit({ durum: "kaydediliyor", yapilan: 0, toplam: uyeler.length, hatalar: [] });

    // Sokak, mahalle, ilçe — adres metni için (OpenStreetMap, anahtarsız).
    let ters: SiteAdayi | null = null;
    try {
      const y = await fetch(`/api/site-ara?lat=${nokta.lat}&lng=${nokta.lng}`);
      if (y.ok) ters = ((await y.json()) as { aday: SiteAdayi }).aday;
    } catch {
      /* adres metni sokaksız kalır */
    }
    const yer = {
      adres: ters?.adres ?? null,
      mahalle: ters?.mahalle ?? null,
      ilce: ters?.ilce ?? oneri?.ilce ?? null,
    };

    const hatalar: string[] = [];
    let yapilan = 0;
    for (const u of uyeler) {
      // Tarif adresinde site adı yok: adres metni sokak/mahalle/ilçe olur,
      // tarif metninin tamamı tarif alanında kalır.
      const adresMetni = grup.tarifMi
        ? yer.adres || yer.mahalle
          ? siteAdresMetni({ ad: "", ...yer })
          : u.ham.trim()
        : siteAdresMetni({ ad: ad.trim() || grup.ad, ...yer });
      const { error } = await db.rpc("aboneligi_yeniden_kur", {
        eski_id: u.kayit.id,
        adres_metni: adresMetni,
        lat: nokta.lat,
        lng: nokta.lng,
        bina: u.adres.bina,
        kat: u.adres.kat,
        daire: u.adres.daire,
        tarif: u.adres.tarif,
      });
      if (error) hatalar.push(`${u.kayit.musteri?.ad ?? "Abone"}: ${error.message}`);
      else yapilan++;
      setKayit({ durum: "kaydediliyor", yapilan, toplam: uyeler.length, hatalar });
    }

    // Site de haritaya eklensin (yoksa) — bir dahaki aramada hazır gelsin.
    if (!grup.tarifMi && haritayaEkle && !zatenHaritada && yapilan > 0) {
      try {
        await siteEkle(db, {
          ad: ad.trim() || grup.ad,
          tur: /apartman|\bapt\b/i.test(ad) ? "apartman" : "site",
          ilce: yer.ilce,
          mahalle: yer.mahalle,
          adres: yer.adres,
          lat: nokta.lat,
          lng: nokta.lng,
          bloklar: [],
          kaynak: "elle",
          kaynak_id: null,
        });
      } catch {
        /* site eklenemese de abonelikler kaydedildi */
      }
    }

    setKayit({
      durum: hatalar.length ? "hata" : "bitti",
      yapilan,
      toplam: uyeler.length,
      hatalar,
    });
    await onDegisti();
  }

  const secilenSayi = grup.uyeler.filter((u) => secili.has(u.kayit.id)).length;
  const oneriUzaklik = oneri ? haversine(merkez, oneri) : null;

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        acik ? "border-kontrast bg-yuzey" : "border-cizgi bg-yuzey"
      }`}
    >
      <button
        onClick={onAc}
        aria-expanded={acik}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[11px] px-1.5 text-[12px] font-black ${
            grup.tarifMi ? "bg-yuzey2 text-gri" : "bg-kurum text-white"
          }`}
        >
          {grup.tarifMi ? "📝" : grup.uyeler.length}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-extrabold">
            {grup.tarifMi ? grup.uyeler[0].kayit.musteri?.ad ?? "Abone" : grup.ad}
          </span>
          <span className="block truncate text-[11.5px] font-semibold text-gri">
            {grup.tarifMi
              ? grup.uyeler[0].ham
              : oneri
                ? oneri.guven === "onayli"
                  ? `✓ Onaylı konum var: ${oneri.ad}`
                  : `📍 Listede (doğrulanmamış): ${oneri.ad}`
                : grup.uyeler
                    .slice(0, 3)
                    .map((u) => u.ham)
                    .join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-gri">{acik ? "▴" : "▾"}</span>
      </button>

      <AnimatePresence initial={false}>
        {acik && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 px-3 pb-3">
              {!grup.tarifMi && (
                <label className="block">
                  <span className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-gri">
                    Site adı (adreste böyle yazılır)
                  </span>
                  <input
                    value={ad}
                    onChange={(e) => setAd(e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-cizgi bg-yuzey2 px-3 text-[14px] font-extrabold outline-none focus:border-kirmizi"
                  />
                </label>
              )}

              {/* Üyeler */}
              <div>
                <p className="flex items-center justify-between px-1 text-[10.5px] font-bold uppercase tracking-wider text-gri">
                  <span>
                    Aboneler · {secilenSayi}/{grup.uyeler.length}
                  </span>
                  {grup.uyeler.length > 1 && (
                    <button
                      onClick={() =>
                        setSecili(
                          secilenSayi === grup.uyeler.length
                            ? new Set()
                            : new Set(grup.uyeler.map((u) => u.kayit.id)),
                        )
                      }
                      className="normal-case tracking-normal text-kirmizi"
                    >
                      {secilenSayi === grup.uyeler.length ? "Hiçbiri" : "Tümü"}
                    </button>
                  )}
                </p>
                <div className="ince-kaydirma mt-1 max-h-56 space-y-1 overflow-y-auto">
                  {grup.uyeler.map((u) => (
                    <UyeSatiri
                      key={u.kayit.id}
                      uye={u}
                      secili={secili.has(u.kayit.id)}
                      onDegis={() =>
                        setSecili((o) => {
                          const y = new Set(o);
                          if (y.has(u.kayit.id)) y.delete(u.kayit.id);
                          else y.add(u.kayit.id);
                          return y;
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Konum */}
              {nokta ? (
                <div className="rounded-xl border border-yesil/40 bg-yesil/10 px-3 py-2">
                  <p className="text-[11px] font-bold text-yesil">
                    ✓ Konum: {nokta.lat.toFixed(6)}, {nokta.lng.toFixed(6)}
                  </p>
                  <div className="mt-1 flex gap-3 text-[11px] font-bold">
                    <button onClick={() => onGit(nokta)} className="text-metin">
                      Haritada göster
                    </button>
                    <button onClick={() => setNokta(null)} className="text-gri">
                      Değiştir
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {oneri && (
                    <button
                      onClick={() => {
                        setNokta({ lat: oneri.lat, lng: oneri.lng });
                        onGit(oneri);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-cizgi bg-yuzey px-3 text-left text-[12px] font-bold hover:bg-yuzey2"
                    >
                      📍
                      <span className="min-w-0 flex-1 truncate">
                        {oneri.guven === "onayli"
                          ? `Onaylı konumu kullan: ${oneri.ad}`
                          : `Listedeki konum (doğrulanmamış): ${oneri.ad}`}
                      </span>
                      {oneriUzaklik != null && (
                        <span className="shrink-0 text-[10.5px] text-gri">
                          {mesafeYaz(oneriUzaklik)}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={metin}
                      onChange={(e) => {
                        setMetin(e.target.value);
                        setHata(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") yapistir(metin);
                      }}
                      placeholder="Google Haritalar bağlantısı ya da koordinat"
                      aria-label="Google Haritalar bağlantısı ya da koordinat"
                      autoComplete="off"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-cizgi bg-yuzey2 px-3 text-[14px] font-semibold outline-none focus:border-kirmizi"
                    />
                    <button
                      onClick={() => yapistir(metin)}
                      disabled={!metin.trim()}
                      className="h-11 shrink-0 rounded-xl bg-kontrast px-3.5 text-[12px] font-black text-white disabled:opacity-40"
                    >
                      Uygula
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        grup.tarifMi ? `${grup.uyeler[0].ham} Serdivan Sakarya` : `${ad} Sakarya`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-10 flex-1 items-center justify-center rounded-xl bg-yuzey2 px-3 text-[11px] font-bold hover:bg-cizgi"
                    >
                      Google&apos;da ara ↗
                    </a>
                    <button
                      onClick={() => void panodan()}
                      className="min-h-10 flex-1 rounded-xl bg-yuzey2 px-3 text-[11px] font-bold hover:bg-cizgi"
                    >
                      Panodan yapıştır
                    </button>
                  </div>
                  {hata && (
                    <p role="alert" className="px-1 text-[11px] font-bold leading-snug text-kirmizi">
                      {hata}
                    </p>
                  )}
                </div>
              )}

              {!grup.tarifMi && nokta && (
                <label className="flex items-center gap-2 px-1 text-[11px] font-semibold text-gri">
                  <input
                    type="checkbox"
                    checked={haritayaEkle && !zatenHaritada}
                    disabled={!!zatenHaritada}
                    onChange={(e) => setHaritayaEkle(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-kirmizi)]"
                  />
                  {zatenHaritada
                    ? `Site zaten haritada (${zatenHaritada.ad})`
                    : "Siteyi haritaya da ekle"}
                </label>
              )}

              {/* Kaydet */}
              {kayit.durum === "bos" && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  disabled={!nokta || secilenSayi === 0}
                  onClick={() => void kaydet()}
                  className="h-12 w-full rounded-hap bg-kirmizi text-[12.5px] font-black text-white shadow-kirmizi disabled:opacity-40"
                >
                  {!nokta
                    ? "Önce konum verin"
                    : `✓ ${secilenSayi} aboneyi kaydet`}
                </motion.button>
              )}
              {kayit.durum === "kaydediliyor" && (
                <p className="rounded-xl bg-yuzey2 px-3 py-3 text-center text-[12px] font-bold">
                  Kaydediliyor… {kayit.yapilan}/{kayit.toplam}
                </p>
              )}
              {(kayit.durum === "bitti" || kayit.durum === "hata") && (
                <div
                  className={`rounded-xl px-3 py-2.5 text-[11px] font-bold ${
                    kayit.hatalar.length ? "bg-kirmizi-sis text-kirmizi-koyu" : "bg-yesil/10 text-yesil"
                  }`}
                >
                  {kayit.yapilan}/{kayit.toplam} abone kaydedildi.
                  {kayit.hatalar.slice(0, 5).map((h) => (
                    <span key={h} className="mt-1 block font-semibold">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UyeSatiri({
  uye,
  secili,
  onDegis,
}: {
  uye: GrupUyesi<Abonelik>;
  secili: boolean;
  onDegis: () => void;
}) {
  const a = uye.adres;
  const birim = [a.bina && `No ${a.bina}`, a.kat && `Kat ${a.kat}`, a.daire && `D.${a.daire}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-yuzey2">
      <input
        type="checkbox"
        checked={secili}
        onChange={onDegis}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-kirmizi)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-extrabold">
          {uye.kayit.musteri?.ad ?? "Abone"}
        </span>
        <span className="block text-[11.5px] font-semibold leading-snug text-gri">
          {uye.ham}
          {birim && <span className="text-metin"> → {birim}</span>}
        </span>
      </span>
    </label>
  );
}
