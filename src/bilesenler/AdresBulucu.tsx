"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  KAYNAK_ETIKET,
  SAKARYA_ILCELERI,
  derlemeyiCoz,
  kayitliEsi,
  kayitliyiAdayaCevir,
  konumCoz,
  siteAra,
  type SiteAdayi,
} from "@/lib/site";
import { haversine, mesafeYaz } from "@/lib/rota";
import type { SupabaseClient } from "@supabase/supabase-js";

import TopluKonum from "./TopluKonum";
import type { Abonelik, KayitliSite, Nokta, SiteTuru } from "@/lib/tipler";

/**
 * Adres bulucu — soldan açılan yan panel.
 *
 * Akış: ara (derlenmiş OSM listesi anında, canlı arama isteğe bağlı) →
 * adaya dokun → harita oraya uçar, sürüklenebilir pin çıkar → kurye adı,
 * türü, mahalleyi düzeltir, pini kapıya taşır → "Onayla" ile `siteler`
 * tablosuna yazılır ve herkesin haritasında lacivert pin olarak görünür.
 *
 * Telefonda liste tam ekran; aday ya da kayıtlı site açılınca panel alta
 * inip kart olur ki kurye haritayı görerek onaylasın.
 */

type Props = {
  kayitlilar: KayitliSite[];
  /** Sorgu boşken liste bu noktaya yakınlığa göre sıralanır (kurye ya da market). */
  merkez: Nokta;
  /** Onay bekleyen aday — pin haritada. */
  onizleme: SiteAdayi | null;
  onOnizle: (aday: SiteAdayi | null) => void;
  onOnizlemeGuncelle: (yama: Partial<SiteAdayi>) => void;
  /** Haritada dokunulan ya da listeden açılan kayıtlı site. */
  secili: KayitliSite | null;
  onSec: (site: KayitliSite | null) => void;
  /** "Listede yok" — sıradaki harita dokunuşu yeni aday açar. */
  haritadanSecim: boolean;
  onHaritadanSecim: (acik: boolean) => void;
  kullaniciId: string | null;
  islemde: boolean;
  onOnayla: (aday: SiteAdayi) => void;
  onSil: (site: KayitliSite) => void;
  onGit: (nokta: Nokta) => void;
  onKayitAc: (site: SiteAdayi, blok: string | null) => void;
  /** Adayı Google Haritalar'da arayıp pini oraya taşır. */
  onGoogleEsle: (aday: SiteAdayi) => void;
  /** Toplu düzelt sekmesi: konumsuz abonelikleri siteye göre düzeltir. */
  db: SupabaseClient;
  abonelikler: Abonelik[];
  onAboneliklerDegisti: () => Promise<void> | void;
  onKapat: () => void;
};

type Sekme = "bul" | "harita" | "toplu";

type Canli =
  | { durum: "bos" }
  | { durum: "araniyor"; sorgu: string }
  | { durum: "bitti"; sorgu: string; sonuclar: SiteAdayi[]; google: boolean }
  | { durum: "hata"; sorgu: string; mesaj: string };

const SEKMELER: { anahtar: Sekme; ad: string }[] = [
  { anahtar: "bul", ad: "Bul" },
  { anahtar: "harita", ad: "Haritadakiler" },
  { anahtar: "toplu", ad: "Toplu düzelt" },
];

/** Derleme dosyası oturum boyunca bir kez iner. */
let derlemeSozu: Promise<SiteAdayi[]> | null = null;
function derlemeyiYukle() {
  derlemeSozu ??= fetch("/veri/sakarya-siteler.json")
    .then((y) => (y.ok ? y.json() : { kayitlar: [] }))
    .then(derlemeyiCoz)
    .catch(() => {
      derlemeSozu = null;
      return [];
    });
  return derlemeSozu;
}

export default function AdresBulucu({
  kayitlilar,
  merkez,
  onizleme,
  onOnizle,
  onOnizlemeGuncelle,
  secili,
  onSec,
  haritadanSecim,
  onHaritadanSecim,
  kullaniciId,
  islemde,
  onOnayla,
  onSil,
  onGit,
  onKayitAc,
  onGoogleEsle,
  db,
  abonelikler,
  onAboneliklerDegisti,
  onKapat,
}: Props) {
  const [sekme, setSekme] = useState<Sekme>("bul");
  const [sorgu, setSorgu] = useState("");
  const [ilce, setIlce] = useState<string | null>(null);
  const [tur, setTur] = useState<SiteTuru | null>(null);
  const [derleme, setDerleme] = useState<SiteAdayi[] | null>(null);
  const [canli, setCanli] = useState<Canli>({ durum: "bos" });
  const girdiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let iptal = false;
    void derlemeyiYukle().then((l) => {
      if (!iptal) setDerleme(l);
    });
    return () => {
      iptal = true;
    };
  }, []);

  const suzgec = { ilce, tur, yakin: merkez };

  const haritadakiler = useMemo(
    () => siteAra(kayitlilar.map(kayitliyiAdayaCevir), sorgu, suzgec, 400),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kayitlilar, sorgu, ilce, tur, merkez],
  );

  /** Önerilenler: derlemeden, haritada zaten olanlar hariç. */
  const onerilenler = useMemo(
    () =>
      siteAra(derleme ?? [], sorgu, suzgec, 80).filter(
        (a) => !kayitliEsi(a, kayitlilar),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derleme, kayitlilar, sorgu, ilce, tur, merkez],
  );

  const canliSonuclar =
    canli.durum === "bitti"
      ? canli.sonuclar.filter(
          (a) =>
            (!ilce || a.ilce === ilce) &&
            (!tur || a.tur === tur) &&
            !onerilenler.some((o) => o.ad === a.ad),
        )
      : [];

  const ilceSayilari = useMemo(() => {
    const say = new Map<string, number>();
    for (const a of derleme ?? []) if (a.ilce) say.set(a.ilce, (say.get(a.ilce) ?? 0) + 1);
    for (const k of kayitlilar) if (k.ilce) say.set(k.ilce, (say.get(k.ilce) ?? 0) + 1);
    return say;
  }, [derleme, kayitlilar]);

  async function canliAra() {
    const q = sorgu.trim();
    if (q.length < 3 || canli.durum === "araniyor") return;
    setCanli({ durum: "araniyor", sorgu: q });
    try {
      const yanit = await fetch(`/api/site-ara?q=${encodeURIComponent(q)}`);
      const veri = (await yanit.json()) as {
        sonuclar?: SiteAdayi[];
        google?: boolean;
        hata?: string;
      };
      if (!yanit.ok) throw new Error(veri.hata ?? "Arama başarısız.");
      setCanli({
        durum: "bitti",
        sorgu: q,
        sonuclar: veri.sonuclar ?? [],
        google: !!veri.google,
      });
    } catch (hata) {
      setCanli({
        durum: "hata",
        sorgu: q,
        mesaj: hata instanceof Error ? hata.message : "Arama başarısız.",
      });
    }
  }

  const kart = onizleme != null || secili != null;
  const konumsuzSayi = useMemo(
    () => abonelikler.filter((a) => a.adres?.lat == null).length,
    [abonelikler],
  );

  return (
    <motion.aside
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className={`pointer-events-none absolute left-0 z-40 flex w-full flex-col sm:inset-y-0 sm:w-[400px] sm:p-3 sm:pt-[calc(env(safe-area-inset-top)+12px)] ${
        kart
          ? "max-sm:bottom-0 max-sm:max-h-[72dvh]"
          : "max-sm:inset-y-0"
      }`}
      aria-label="Adres bulucu"
    >
      <div
        className={`pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden border-cizgi bg-yuzey/95 shadow-yuzen backdrop-blur-2xl sm:rounded-[26px] sm:border ${
          kart
            ? "max-sm:rounded-t-[28px] max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)]"
            : "max-sm:pt-[env(safe-area-inset-top)]"
        }`}
      >
        {/* Başlık */}
        <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-kurum text-white">
            <BinaSimgesi />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-extrabold leading-tight tracking-tight">
              Adres bulucu
            </h2>
            <p className="truncate text-[11px] font-semibold text-gri">
              Sakarya · siteler ve apartmanlar
            </p>
          </div>
          <button
            onClick={onKapat}
            aria-label="Adres bulucuyu kapat"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-yuzey2 text-[18px] leading-none text-gri transition-colors hover:bg-cizgi"
          >
            ×
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {onizleme ? (
            <OnayKarti
              key={`onay-${onizleme.anahtar}`}
              aday={onizleme}
              esi={kayitliEsi(onizleme, kayitlilar)}
              islemde={islemde}
              onGuncelle={onOnizlemeGuncelle}
              onVazgec={() => onOnizle(null)}
              onOnayla={() => onOnayla(onizleme)}
              onEsiniGoster={(s) => {
                onOnizle(null);
                onSec(s);
              }}
              onGit={onGit}
              onGoogleEsle={onGoogleEsle}
            />
          ) : secili ? (
            <SiteDetayi
              key={`detay-${secili.id}`}
              site={secili}
              silebilir={!!kullaniciId && secili.ekleyen === kullaniciId}
              islemde={islemde}
              onGeri={() => onSec(null)}
              onGit={onGit}
              onSil={() => onSil(secili)}
              onKayitAc={(blok) => onKayitAc(kayitliyiAdayaCevir(secili), blok)}
            />
          ) : (
            <motion.div
              key="liste"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Arama */}
              <div className="shrink-0 space-y-2.5 px-4 pb-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    girdiRef.current?.blur();
                    if (sekme === "bul") void canliAra();
                  }}
                  className="relative"
                >
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gri">
                    <AraSimgesi />
                  </span>
                  <input
                    ref={girdiRef}
                    value={sorgu}
                    onChange={(e) => setSorgu(e.target.value)}
                    type="search"
                    enterKeyHint="search"
                    placeholder={
                      sekme === "bul"
                        ? "Site, apartman ya da mahalle ara"
                        : sekme === "toplu"
                          ? "Site, adres ya da müşteri ara"
                          : "Haritadaki sitelerde ara"
                    }
                    className="h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 pl-10 pr-10 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-gri focus:border-kirmizi [&::-webkit-search-cancel-button]:hidden"
                  />
                  {sorgu && (
                    <button
                      type="button"
                      onClick={() => {
                        setSorgu("");
                        setCanli({ durum: "bos" });
                        girdiRef.current?.focus();
                      }}
                      aria-label="Aramayı temizle"
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[18px] text-gri hover:bg-cizgi"
                    >
                      ×
                    </button>
                  )}
                </form>

                {/* Sekmeler + tür */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1 rounded-hap bg-yuzey2 p-1">
                    {SEKMELER.map((s) => (
                      <button
                        key={s.anahtar}
                        onClick={() => setSekme(s.anahtar)}
                        className={`relative flex-1 rounded-hap py-1.5 text-[12px] font-bold transition-colors ${
                          sekme === s.anahtar ? "text-white" : "text-gri"
                        }`}
                      >
                        {sekme === s.anahtar && (
                          <motion.span
                            layoutId="bulucu-sekme"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            className="absolute inset-0 rounded-hap bg-kontrast"
                          />
                        )}
                        <span className="relative">
                          {s.ad}
                          {s.anahtar === "harita" && kayitlilar.length > 0 && (
                            <span className="ml-1 opacity-70">{kayitlilar.length}</span>
                          )}
                          {s.anahtar === "toplu" && konumsuzSayi > 0 && (
                            <span className="ml-1 opacity-70">{konumsuzSayi}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  {sekme !== "toplu" && (
                  <select
                    value={tur ?? ""}
                    onChange={(e) => setTur((e.target.value || null) as SiteTuru | null)}
                    aria-label="Tür"
                    className="h-9 rounded-hap border border-cizgi bg-yuzey px-3 text-[12px] font-bold text-metin outline-none"
                  >
                    <option value="">Hepsi</option>
                    <option value="site">Site</option>
                    <option value="apartman">Apartman</option>
                  </select>
                  )}
                </div>

                {/* İlçeler */}
                {sekme !== "toplu" && (
                <div className="ince-kaydirma -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
                  <IlceCipi
                    ad="Tüm ilçeler"
                    secili={ilce == null}
                    onClick={() => setIlce(null)}
                  />
                  {SAKARYA_ILCELERI.map((i) => (
                    <IlceCipi
                      key={i}
                      ad={i}
                      sayi={ilceSayilari.get(i)}
                      secili={ilce === i}
                      onClick={() => setIlce(ilce === i ? null : i)}
                    />
                  ))}
                </div>
                )}
              </div>

              {/* Sonuçlar */}
              <div className="ince-kaydirma min-h-0 flex-1 overflow-y-auto border-t border-cizgi px-3 pb-6 pt-2">
                {sekme === "toplu" ? (
                  <TopluKonum
                    db={db}
                    abonelikler={abonelikler}
                    derleme={derleme ?? []}
                    kayitlilar={kayitlilar}
                    sorgu={sorgu}
                    merkez={merkez}
                    onGit={onGit}
                    onDegisti={onAboneliklerDegisti}
                  />
                ) : sekme === "harita" ? (
                  <>
                    {haritadakiler.map((a) => {
                      const k = kayitlilar.find((x) => `kayit:${x.id}` === a.anahtar);
                      return (
                        <SiteSatiri merkez={merkez}
                          key={a.anahtar}
                          aday={a}
                          haritada
                          onClick={() => k && onSec(k)}
                        />
                      );
                    })}
                    {haritadakiler.length === 0 && (
                      <Bos
                        mesaj={
                          kayitlilar.length === 0
                            ? "Henüz haritaya site eklenmedi. \"Bul\" sekmesinden arayıp onaylayın."
                            : "Bu aramaya uyan site yok."
                        }
                      />
                    )}
                  </>
                ) : (
                  <>
                    {/* Haritada zaten olanlar da aramada görünsün */}
                    {sorgu.trim() && haritadakiler.length > 0 && (
                      <Bolum baslik="Haritada">
                        {haritadakiler.slice(0, 5).map((a) => {
                          const k = kayitlilar.find((x) => `kayit:${x.id}` === a.anahtar);
                          return (
                            <SiteSatiri merkez={merkez}
                              key={a.anahtar}
                              aday={a}
                              haritada
                              onClick={() => k && onSec(k)}
                            />
                          );
                        })}
                      </Bolum>
                    )}

                    <Bolum
                      baslik={sorgu.trim() ? "Önerilen" : ilce ? `${ilce} · yakından uzağa` : "Yakınındaki siteler"}
                      ek={derleme ? `${onerilenler.length}${onerilenler.length === 80 ? "+" : ""}` : undefined}
                    >
                      {derleme == null &&
                        Array.from({ length: 5 }, (_, i) => (
                          <div key={i} className="iskelet my-1.5 h-[58px] rounded-2xl" />
                        ))}
                      {onerilenler.map((a) => (
                        <SiteSatiri merkez={merkez} key={a.anahtar} aday={a} onClick={() => onOnizle(a)} />
                      ))}
                      {derleme != null && onerilenler.length === 0 && (
                        <p className="px-2 py-3 text-[13px] font-semibold text-gri">
                          Hazır listede eşleşme yok.
                        </p>
                      )}
                    </Bolum>

                    {canli.durum !== "bos" && (
                      <Bolum
                        baslik="Canlı arama"
                        ek={
                          canli.durum === "bitti"
                            ? canli.google
                              ? "Google + OSM"
                              : "OSM"
                            : undefined
                        }
                      >
                        {canli.durum === "araniyor" && (
                          <p className="flex items-center gap-2 px-2 py-3 text-[13px] font-semibold text-gri">
                            <Donen /> “{canli.sorgu}” aranıyor…
                          </p>
                        )}
                        {canli.durum === "hata" && (
                          <p className="px-2 py-3 text-[13px] font-semibold text-kirmizi">
                            {canli.mesaj}
                          </p>
                        )}
                        {canli.durum === "bitti" &&
                          canliSonuclar.map((a) => (
                            <SiteSatiri merkez={merkez} key={a.anahtar} aday={a} onClick={() => onOnizle(a)} />
                          ))}
                        {canli.durum === "bitti" && canliSonuclar.length === 0 && (
                          <p className="px-2 py-3 text-[13px] font-semibold text-gri">
                            “{canli.sorgu}” için Sakarya içinde sonuç yok.
                          </p>
                        )}
                      </Bolum>
                    )}

                    {/* Bulunamadıysa */}
                    <div className="mt-3 space-y-2 rounded-[20px] border border-dashed border-cizgi p-3">
                      <p className="text-[12px] font-bold text-gri">Aradığın listede yok mu?</p>
                      <button
                        onClick={() => void canliAra()}
                        disabled={
                          sorgu.trim().length < 3 ||
                          canli.durum === "araniyor" ||
                          (canli.durum === "bitti" && canli.sorgu === sorgu.trim())
                        }
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-kontrast text-[13px] font-black text-white disabled:opacity-40"
                      >
                        <AraSimgesi /> İnternette ara
                      </button>
                      <button
                        onClick={() => onHaritadanSecim(!haritadanSecim)}
                        className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border text-[13px] font-black transition-colors ${
                          haritadanSecim
                            ? "border-kirmizi bg-kirmizi text-white"
                            : "border-cizgi bg-yuzey text-metin hover:bg-yuzey2"
                        }`}
                      >
                        📍 {haritadanSecim ? "Haritaya dokun… (vazgeç)" : "Haritaya dokunarak ekle"}
                      </button>
                    </div>

                    <p className="mt-3 px-1 text-[10.5px] leading-snug text-gri">
                      Hazır liste © OpenStreetMap katkıcıları ve Overture Maps. Onaylanan her site
                      tüm kuryelerin haritasına eklenir.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ */

function OnayKarti({
  aday,
  esi,
  islemde,
  onGuncelle,
  onVazgec,
  onOnayla,
  onEsiniGoster,
  onGit,
  onGoogleEsle,
}: {
  aday: SiteAdayi;
  esi: KayitliSite | null;
  islemde: boolean;
  onGuncelle: (yama: Partial<SiteAdayi>) => void;
  onVazgec: () => void;
  onOnayla: () => void;
  onEsiniGoster: (s: KayitliSite) => void;
  onGit: (n: Nokta) => void;
  onGoogleEsle: (aday: SiteAdayi) => void;
}) {
  const adGecerli = aday.ad.trim().length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className="ince-kaydirma min-h-0 flex-1 overflow-y-auto px-4 pb-4"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-hap bg-turuncu/15 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-turuncu">
          Onay bekliyor
        </span>
        <span className="truncate text-[11px] font-semibold text-gri">
          {KAYNAK_ETIKET[aday.kaynak]}
        </span>
      </div>

      <label className="mt-3 block">
        <span className="px-1 text-[11px] font-bold uppercase tracking-wider text-gri">
          Ad
        </span>
        <input
          value={aday.ad}
          onChange={(e) => onGuncelle({ ad: e.target.value })}
          placeholder="Örn. Şükür Konakları"
          className="mt-1 h-12 w-full rounded-2xl border border-cizgi bg-yuzey px-3.5 text-[16px] font-extrabold outline-none focus:border-kirmizi"
        />
      </label>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {(["site", "apartman"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onGuncelle({ tur: t })}
            className={`h-10 rounded-2xl border text-[13px] font-black transition-colors ${
              aday.tur === t
                ? "border-kontrast bg-kontrast text-white"
                : "border-cizgi bg-yuzey text-gri"
            }`}
          >
            {t === "site" ? "🏘️ Site" : "🏢 Apartman"}
          </button>
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <select
          value={aday.ilce ?? ""}
          onChange={(e) => onGuncelle({ ilce: e.target.value || null })}
          aria-label="İlçe"
          className="h-11 rounded-2xl border border-cizgi bg-yuzey px-3 text-[13px] font-bold outline-none"
        >
          <option value="">İlçe seç</option>
          {SAKARYA_ILCELERI.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <input
          value={aday.mahalle ?? ""}
          onChange={(e) => onGuncelle({ mahalle: e.target.value || null })}
          placeholder="Mahalle"
          className="h-11 rounded-2xl border border-cizgi bg-yuzey px-3 text-[13px] font-bold outline-none focus:border-kirmizi"
        />
      </div>

      {aday.adres && (
        <p className="mt-2 px-1 text-[12px] font-semibold text-gri">{aday.adres}</p>
      )}

      {aday.bloklar.length > 0 && (
        <div className="mt-3">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gri">
            Bloklar · dokununca pin oraya gider
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {aday.bloklar.map((b) => (
              <button
                key={b.ad}
                onClick={() => {
                  onGuncelle({ lat: b.lat, lng: b.lng });
                  onGit(b);
                }}
                className="rounded-hap border border-cizgi bg-yuzey px-2.5 py-1 text-[12px] font-bold hover:bg-yuzey2"
              >
                {b.ad}
              </button>
            ))}
          </div>
        </div>
      )}

      <KonumYapistir
        aday={aday}
        onUygula={(nokta) => {
          onGuncelle({
            ...nokta,
            eskiKonum: { lat: aday.lat, lng: aday.lng },
            // Elle verilen konum önceki Google sonucunun yerine geçer.
            dogrulama: undefined,
          });
          onGit(nokta);
        }}
        onGeriAl={() => {
          if (!aday.eskiKonum) return;
          onGuncelle({ ...aday.eskiKonum, eskiKonum: undefined });
          onGit(aday.eskiKonum);
        }}
      />

      <GoogleDurumu
        aday={aday}
        onYeniden={() => onGoogleEsle(aday)}
        onEskiKonum={() => {
          if (!aday.eskiKonum) return;
          onGuncelle({ ...aday.eskiKonum, eskiKonum: undefined });
          onGit(aday.eskiKonum);
        }}
      />

      <p className="mt-3 flex items-start gap-2 rounded-2xl bg-yuzey2 px-3 py-2.5 text-[12px] font-semibold leading-snug text-gri">
        <span className="text-[15px] leading-none">✋</span>
        Pini sürükle ya da haritaya dokun — girişin olduğu noktaya taşıyıp öyle
        onayla.
      </p>

      {esi && (
        <div className="mt-2.5 rounded-2xl border border-turuncu bg-turuncu/10 px-3 py-2.5">
          <p className="text-[12px] font-bold text-metin">
            “{esi.ad}” zaten haritada.
          </p>
          <button
            onClick={() => onEsiniGoster(esi)}
            className="mt-1 text-[12px] font-black text-turuncu underline-offset-2 hover:underline"
          >
            Onu göster ›
          </button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onVazgec}
          className="h-12 flex-1 rounded-hap bg-yuzey2 text-[14px] font-bold text-gri"
        >
          Vazgeç
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!adGecerli || islemde}
          onClick={onOnayla}
          className="h-12 flex-[2] rounded-hap bg-kirmizi text-[14px] font-black text-white shadow-kirmizi disabled:opacity-50"
        >
          {islemde ? "Ekleniyor…" : "✓ Onayla, haritaya ekle"}
        </motion.button>
      </div>
    </motion.div>
  );
}

/**
 * Google Haritalar'dan elle kopyalanan konumu pine uygular — anahtar
 * gerektirmez. Kişi Google'da siteyi açıp haritaya sağ tıklar, en üstteki
 * koordinata dokunup kopyalar (ya da adres çubuğundaki bağlantıyı) ve buraya
 * yapıştırır.
 */
function KonumYapistir({
  aday,
  onUygula,
  onGeriAl,
}: {
  aday: SiteAdayi;
  onUygula: (nokta: Nokta) => void;
  onGeriAl: () => void;
}) {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ fark: number } | null>(null);
  const [panoVar] = useState(
    () => typeof navigator !== "undefined" && !!navigator.clipboard?.readText,
  );

  function uygula(girdi: string) {
    const c = konumCoz(girdi);
    if (!c.tamam) {
      setHata(c.hata);
      setSonuc(null);
      return;
    }
    setHata(null);
    setSonuc({ fark: haversine(aday, c.nokta) });
    setMetin("");
    setAcik(false);
    onUygula(c.nokta);
  }

  async function panodan() {
    try {
      const pano = await navigator.clipboard.readText();
      setMetin(pano);
      uygula(pano);
    } catch {
      // İzin verilmediyse kurye kutuya elle yapıştırır.
      setAcik(true);
      setHata("Pano okunamadı — kutuya uzun basıp yapıştırın.");
    }
  }

  return (
    <div className="mt-3">
      {sonuc && aday.eskiKonum && !acik && (
        <div className="mb-2 rounded-2xl border border-yesil/40 bg-yesil/10 px-3 py-2.5">
          <p className="text-[12px] font-bold text-yesil">
            ✓ Pin yapıştırılan konuma taşındı · {mesafeYaz(sonuc.fark)}
          </p>
          <button
            onClick={() => {
              setSonuc(null);
              onGeriAl();
            }}
            className="mt-1 text-[12px] font-bold text-gri underline-offset-2 hover:underline"
          >
            Eski konuma dön
          </button>
        </div>
      )}

      {!acik ? (
        <button
          onClick={() => {
            setAcik(true);
            setHata(null);
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cizgi bg-yuzey text-[13px] font-black hover:bg-yuzey2"
        >
          📋 Google Haritalar&apos;dan konum yapıştır
        </button>
      ) : (
        <div className="rounded-2xl border border-cizgi bg-yuzey p-2.5">
          <p className="px-1 text-[11px] font-semibold leading-snug text-gri">
            Google Haritalar&apos;da siteyi açın, girişine sağ tıklayın (telefonda
            basılı tutun), çıkan koordinata dokunup kopyalayın. Adres
            çubuğundaki bağlantı da olur.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={metin}
              onChange={(e) => {
                setMetin(e.target.value);
                setHata(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") uygula(metin);
              }}
              placeholder="40.7745487, 30.3439116"
              inputMode="text"
              autoComplete="off"
              aria-label="Konum ya da Google Haritalar bağlantısı"
              className="h-11 min-w-0 flex-1 rounded-xl border border-cizgi bg-yuzey2 px-3 text-[16px] font-semibold outline-none focus:border-kirmizi"
            />
            <button
              onClick={() => uygula(metin)}
              disabled={!metin.trim()}
              className="h-11 shrink-0 rounded-xl bg-kontrast px-4 text-[13px] font-black text-white disabled:opacity-40"
            >
              Uygula
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            {panoVar && (
              <button
                onClick={() => void panodan()}
                className="min-h-10 flex-1 rounded-xl bg-yuzey2 px-3 text-[12px] font-bold text-metin hover:bg-cizgi"
              >
                Panodan yapıştır
              </button>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [aday.ad, aday.mahalle, aday.ilce, "Sakarya"].filter(Boolean).join(" "),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-10 flex-1 items-center justify-center rounded-xl bg-yuzey2 px-3 text-[12px] font-bold text-metin hover:bg-cizgi"
            >
              Google&apos;da aç ↗
            </a>
            <button
              onClick={() => {
                setAcik(false);
                setHata(null);
              }}
              className="min-h-10 rounded-xl px-3 text-[12px] font-bold text-gri"
            >
              Kapat
            </button>
          </div>
          {hata && (
            <p role="alert" className="mt-2 px-1 text-[12px] font-bold leading-snug text-kirmizi">
              {hata}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Adayın Google Haritalar'la eşleşme durumu. Eşleşince pin zaten Google'daki
 * noktaya taşınmış oluyor; kurye isterse eski noktaya dönebiliyor.
 */
function GoogleDurumu({
  aday,
  onYeniden,
  onEskiKonum,
}: {
  aday: SiteAdayi;
  onYeniden: () => void;
  onEskiKonum: () => void;
}) {
  const d = aday.dogrulama;
  if (!d && aday.kaynak === "google") return null;
  const adVar = aday.ad.trim().length >= 2;

  // Düğme anahtar yokken de duruyor: anahtar tanımlandığı gün kod
  // değişmeden çalışmaya başlıyor.
  if (!d || d.durum === "anahtarsiz") {
    return adVar ? (
      <div className="mt-3">
        <button
          onClick={onYeniden}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cizgi bg-yuzey text-[13px] font-black hover:bg-yuzey2"
        >
          <GoogleIsareti /> Konumu Google Haritalar&apos;la eşle
        </button>
        {d?.durum === "anahtarsiz" && (
          <p className="mt-1.5 px-1 text-[11px] font-semibold leading-snug text-gri">
            Google anahtarı henüz tanımlı değil; tanımlanınca bu düğme
            çalışır. Şimdilik konumu yukarıdan yapıştırabilirsiniz.
          </p>
        )}
      </div>
    ) : null;
  }

  if (d.durum === "sorguluyor") {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-yuzey2 px-3 py-2.5 text-[12px] font-semibold text-gri">
        <Donen /> Google Haritalar&apos;da aranıyor…
      </p>
    );
  }

  if (d.durum === "eslesti") {
    return (
      <div className="mt-3 rounded-2xl border border-yesil/40 bg-yesil/10 px-3 py-2.5">
        <p className="flex items-start gap-2 text-[12px] font-bold leading-snug text-yesil">
          <GoogleIsareti />
          <span>
            Google Haritalar&apos;la eşleşti
            {aday.eskiKonum
              ? ` · pin ${mesafeYaz(d.fark)} taşındı`
              : " · konum zaten doğru"}
            <span className="block font-semibold text-metin">
              {d.ad}
              {d.adres ? ` — ${d.adres}` : ""}
            </span>
          </span>
        </p>
        {aday.eskiKonum && (
          <button
            onClick={onEskiKonum}
            className="mt-1.5 text-[12px] font-bold text-gri underline-offset-2 hover:underline"
          >
            Eski konuma dön
          </button>
        )}
      </div>
    );
  }

  const metin =
    d.durum === "bulunamadi"
      ? "Google Haritalar'da bu adla bulunamadı — pini girişe siz taşıyın."
      : "Google'a ulaşılamadı.";
  return (
    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-yuzey2 px-3 py-2.5">
      <p className="flex-1 text-[12px] font-semibold leading-snug text-gri">{metin}</p>
      {adVar && (
        <button
          onClick={onYeniden}
          className="shrink-0 rounded-hap bg-yuzey px-3 py-1.5 text-[12px] font-black"
        >
          Tekrar ara
        </button>
      )}
    </div>
  );
}

function GoogleIsareti() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="mt-px shrink-0">
      <path
        d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SiteDetayi({
  site,
  silebilir,
  islemde,
  onGeri,
  onGit,
  onSil,
  onKayitAc,
}: {
  site: KayitliSite;
  silebilir: boolean;
  islemde: boolean;
  onGeri: () => void;
  onGit: (n: Nokta) => void;
  onSil: () => void;
  onKayitAc: (blok: string | null) => void;
}) {
  const [blok, setBlok] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.18 }}
      className="ince-kaydirma min-h-0 flex-1 overflow-y-auto px-4 pb-4"
    >
      <button
        onClick={onGeri}
        className="-ml-1 mb-1 flex items-center gap-1 rounded-hap px-1.5 py-1 text-[12px] font-bold text-gri hover:bg-yuzey2"
      >
        ‹ Listeye dön
      </button>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[26px] leading-none">
          {site.tur === "site" ? "🏘️" : "🏢"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[19px] font-extrabold leading-tight tracking-tight">
            {site.ad}
          </h3>
          <p className="mt-0.5 text-[13px] font-semibold text-gri">
            {[site.mahalle, site.ilce].filter(Boolean).join(" · ") || "Sakarya"}
          </p>
          {site.adres && (
            <p className="text-[12px] font-semibold text-gri">{site.adres}</p>
          )}
        </div>
      </div>

      {site.bloklar.length > 0 && (
        <div className="mt-3">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-gri">
            Bloklar
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {site.bloklar.map((b) => (
              <button
                key={b.ad}
                onClick={() => {
                  setBlok(blok === b.ad ? null : b.ad);
                  onGit(b);
                }}
                className={`rounded-hap border px-2.5 py-1 text-[12px] font-bold transition-colors ${
                  blok === b.ad
                    ? "border-kontrast bg-kontrast text-white"
                    : "border-cizgi bg-yuzey hover:bg-yuzey2"
                }`}
              >
                {b.ad}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onGit(site)}
          className="h-12 rounded-2xl border border-cizgi bg-yuzey text-[13px] font-black hover:bg-yuzey2"
        >
          🎯 Haritada göster
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onKayitAc(blok)}
          className="h-12 rounded-2xl bg-kirmizi text-[13px] font-black text-white shadow-kirmizi"
        >
          ＋ Buraya kayıt aç
        </motion.button>
      </div>

      <p className="mt-3 px-1 text-[11px] font-semibold text-gri">
        {KAYNAK_ETIKET[site.kaynak]} ·{" "}
        {new Date(site.created_at).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        tarihinde eklendi
      </p>

      {silebilir && (
        <AnimatePresence mode="wait" initial={false}>
          {silOnay ? (
            <motion.div
              key="onay"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-3 rounded-2xl border border-kirmizi bg-kirmizi-sis p-3"
            >
              <p className="text-[13px] font-bold text-kirmizi-koyu">
                Site tüm kuryelerin haritasından kalkacak. Adres kayıtları
                etkilenmez.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => setSilOnay(false)}
                  className="flex-1 rounded-hap bg-yuzey py-2.5 text-[13px] font-bold text-gri"
                >
                  Vazgeç
                </button>
                <button
                  disabled={islemde}
                  onClick={onSil}
                  className="flex-[2] rounded-hap bg-kirmizi py-2.5 text-[13px] font-black text-white disabled:opacity-60"
                >
                  {islemde ? "Kaldırılıyor…" : "Evet, kaldır"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="sil"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSilOnay(true)}
              className="mt-2 h-10 w-full rounded-2xl text-[13px] font-bold text-kirmizi hover:bg-kirmizi-sis"
            >
              Haritadan kaldır
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function SiteSatiri({
  aday,
  merkez,
  haritada,
  onClick,
}: {
  aday: SiteAdayi;
  merkez: Nokta;
  haritada?: boolean;
  onClick: () => void;
}) {
  const yer = [aday.mahalle, aday.ilce].filter(Boolean).join(" · ");
  const uzaklik = mesafeYaz(haversine(merkez, aday));
  return (
    <motion.button
      layout="position"
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-yuzey2"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[18px] ${
          haritada ? "bg-kurum text-white" : "bg-yuzey2"
        }`}
      >
        {aday.tur === "site" ? "🏘️" : "🏢"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold">{aday.ad}</span>
        <span className="block truncate text-[12px] font-semibold text-gri">
          {yer || aday.adres || "Sakarya"}
          {aday.bloklar.length > 0 && ` · ${aday.bloklar.length} blok`}
          {` · ${uzaklik}`}
        </span>
      </span>
      {haritada ? (
        <span className="shrink-0 rounded-hap bg-yesil/12 px-2 py-0.5 text-[10.5px] font-black text-yesil">
          ✓ Haritada
        </span>
      ) : aday.kaynak === "google" ? (
        <span className="shrink-0 rounded-hap bg-yuzey2 px-2 py-0.5 text-[10.5px] font-black text-gri">
          Google
        </span>
      ) : (
        <span className="shrink-0 text-gri">›</span>
      )}
    </motion.button>
  );
}

function Bolum({
  baslik,
  ek,
  children,
}: {
  baslik: string;
  ek?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-1.5">
      <p className="flex items-baseline justify-between px-2.5 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-gri">
        <span>{baslik}</span>
        {ek && <span className="font-bold normal-case tracking-normal">{ek}</span>}
      </p>
      {children}
    </section>
  );
}

function IlceCipi({
  ad,
  sayi,
  secili,
  onClick,
}: {
  ad: string;
  sayi?: number;
  secili: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-hap border px-3 py-1.5 text-[12px] font-bold transition-colors ${
        secili
          ? "border-kirmizi bg-kirmizi text-white"
          : "border-cizgi bg-yuzey text-metin hover:bg-yuzey2"
      }`}
    >
      {ad}
      {sayi != null && (
        <span className={`ml-1 ${secili ? "text-white/75" : "text-gri"}`}>{sayi}</span>
      )}
    </button>
  );
}

function Bos({ mesaj }: { mesaj: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="text-3xl opacity-40">🏘️</span>
      <p className="text-sm font-semibold text-gri">{mesaj}</p>
    </div>
  );
}

function Donen() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="inline-block h-4 w-4 rounded-full border-2 border-cizgi border-t-kirmizi"
    />
  );
}

export function BinaSimgesi({ boyut = 18 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21M14 10h4.5a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 8h3M7.5 11.5h3M7.5 15h3M16.5 14h.01M16.5 17.5h.01"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AraSimgesi() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
