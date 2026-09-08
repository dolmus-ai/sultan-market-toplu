"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import Harita, { type HaritaApi, type Katmanlar } from "./Harita";
import HaritaKontrolleri from "./HaritaKontrolleri";
import AltPanel, { type PanelDurumu } from "./AltPanel";
import TeslimatDetay from "./TeslimatDetay";
import TeslimSonucu, { type TeslimSonuc } from "./TeslimSonucu";
import VardiyaOzeti from "./VardiyaOzeti";
import NavigasyonPaneli, { type NavigasyonDurumu } from "./NavigasyonPaneli";
import {
  AbonelikSatiri,
  SepetSatiri,
  TeslimatSatiri,
} from "./Listeler";
import { SultanAmblem } from "./SultanLogo";

import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { haversine, mesafeYaz, sureYaz } from "@/lib/rota";
import { MARKET, marketAcikMi } from "@/lib/market";
import {
  kalanlar,
  siradakiAdim,
  type RotaSecenegi,
} from "@/lib/navigasyon";
import { adimCumlesi, konus, sesiKes } from "@/lib/ses";
import {
  abonelikBugunMu,
  acikVardiyaGetir,
  kuryeKonumlariGetir,
  vardiyaTahsilatlari,
} from "@/lib/veri";
import { binaAnahtari, gecikmeDk, para } from "@/lib/bicim";
import { bekleyenler, kuyruguIsle, kuyrukVeyaGonder } from "@/lib/cevrimdisi";
import type {
  Abonelik,
  Kurye,
  KuryeKonumu,
  Nokta,
  RotaSonucu,
  Sepet,
  Siparis,
  SiparisDurumu,
  Tahsilat,
  Vardiya,
} from "@/lib/tipler";

type Sekme = "teslimatlar" | "abonelikler" | "sepetler";

const SEKMELER: { anahtar: Sekme; ad: string }[] = [
  { anahtar: "teslimatlar", ad: "Teslimatlar" },
  { anahtar: "abonelikler", ad: "Abonelikler" },
  { anahtar: "sepetler", ad: "Sepetler" },
];

const AKTIF_DURUMLAR: SiparisDurumu[] = ["bekliyor", "hazirlaniyor", "yolda"];

const TERCIH_ANAHTARI = "sultan-tercih";

/**
 * Kayıtlı tercihler. Sunucuda boş döner; bu değerler yalnızca açılışta
 * kapalı olan panellerde kullanıldığı için hidrasyon uyuşmazlığı doğurmaz.
 */
function tercihOku(): { karanlik?: boolean; ses?: boolean } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TERCIH_ANAHTARI) ?? "{}");
  } catch {
    return {};
  }
}

type Props = {
  kurye: Kurye | null;
  baslangicTeslimatlar: Siparis[];
  baslangicAbonelikler: Abonelik[];
  baslangicSepetler: Sepet[];
};

export default function KuryeUygulamasi({
  kurye,
  baslangicTeslimatlar,
  baslangicAbonelikler,
  baslangicSepetler,
}: Props) {
  const yonlendir = useRouter();
  const db = useMemo(() => tarayiciIstemcisi(), []);
  const haritaApi = useRef<HaritaApi>(null);

  const [teslimatlar, setTeslimatlar] = useState(baslangicTeslimatlar);
  const [abonelikler] = useState(baslangicAbonelikler);
  const [sepetler] = useState(baslangicSepetler);

  const [sekme, setSekme] = useState<Sekme>("teslimatlar");
  const [panel, setPanel] = useState<PanelDurumu>("yari");
  const [seciliId, setSeciliId] = useState<string | null>(null);

  const [secimModu, setSecimModu] = useState(false);
  const [secilenler, setSecilenler] = useState<string[]>([]);
  const [rota, setRota] = useState<RotaSonucu | null>(null);
  const [rotaHesapla, setRotaHesapla] = useState(false);

  const [katmanlar, setKatmanlar] = useState<Katmanlar>(() => ({
    abonelikler: true,
    teslimEdilenler: false,
    ucBoyut: true,
    isiHaritasi: false,
    karanlik: tercihOku().karanlik ?? false,
  }));
  const [katmanPaneli, setKatmanPaneli] = useState(false);

  const [kuryeKonumu, setKuryeKonumu] = useState<Nokta | null>(null);
  const [kuryeYonu, setKuryeYonu] = useState<number | null>(null);
  const [konumTakibi, setKonumTakibi] = useState(false);
  const [aci, setAci] = useState({ bearing: -12, pitch: 45 });

  const [navHedef, setNavHedef] = useState<Siparis | null>(null);
  const [navDurum, setNavDurum] = useState<NavigasyonDurumu>("secim");
  const [navSecenekler, setNavSecenekler] = useState<RotaSecenegi[]>([]);
  const [navSeciliId, setNavSeciliId] = useState<string | null>(null);
  const [navYukleniyor, setNavYukleniyor] = useState(false);
  const [navAdimIndeks, setNavAdimIndeks] = useState(0);
  const [navTakip, setNavTakip] = useState(true);
  const [sesAcik, setSesAcik] = useState(() => tercihOku().ses ?? true);

  // Konum geri çağırımı içinden güncel navigasyon durumuna erişmek için.
  const navRef = useRef<{
    durum: NavigasyonDurumu;
    secenek: RotaSecenegi | null;
    takip: boolean;
  }>({ durum: "secim", secenek: null, takip: true });
  /** Hangi adım için hangi uyarının seslendirildiğini tutar. */
  const seslendirilenRef = useRef<{ adim: number; yakin: boolean }>({
    adim: -1,
    yakin: false,
  });
  const navAdimRef = useRef(0);
  const sesRef = useRef(true);

  const [vardiya, setVardiya] = useState<Vardiya | null>(null);
  const [tahsilatlar, setTahsilatlar] = useState<Tahsilat[]>([]);
  const [vardiyaOzeti, setVardiyaOzeti] = useState(false);
  const [teslimModu, setTeslimModu] = useState<"teslim" | "basarisiz" | null>(
    null,
  );
  const [bekleyenSayisi, setBekleyenSayisi] = useState(0);
  const [digerKuryeler, setDigerKuryeler] = useState<
    (KuryeKonumu & { ad: string })[]
  >([]);

  const [konumDuzeltme, setKonumDuzeltme] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);

  /**
   * Saate bağlı her şey yalnızca istemcide hesaplanır.
   *
   * Sunucu Vercel'de UTC, tarayıcı ise yerel saatte (UTC+3) çalışıyor; gecikme
   * rozetleri ve "geciken" sayacı iki tarafta farklı metin üretince React
   * hidrasyonu bozuluyordu (#418). Hidrasyon bozulunca React ağacı baştan
   * kuruyor, MapLibre'ın canvas'ı sayfadan kopuyor ve harita bomboş kalıyordu.
   * Bu yüzden ilk render'da saat bilgisi yok; bağlandıktan sonra doluyor ve
   * 30 saniyede bir tazeleniyor.
   */
  const simdi = useSyncExternalStore(
    (bildir) => {
      const sayac = setInterval(bildir, 30_000);
      return () => clearInterval(sayac);
    },
    // 30 saniyelik kovaya yuvarlanıyor; aynı render turunda aynı değeri
    // döndürmesi gerekiyor.
    () => Math.floor(Date.now() / 30_000) * 30_000,
    () => null,
  );
  const saatHazir = simdi != null;

  const secili = useMemo(
    () => teslimatlar.find((s) => s.id === seciliId) ?? null,
    [teslimatlar, seciliId],
  );

  const bugunAbonelikler = useMemo(() => {
    if (!saatHazir) return [];
    const bugun = new Date();
    return abonelikler.filter((a) => abonelikBugunMu(a, bugun));
  }, [abonelikler, saatHazir]);

  const aktifTeslimatlar = useMemo(
    () => teslimatlar.filter((s) => AKTIF_DURUMLAR.includes(s.durum)),
    [teslimatlar],
  );

  const kasaToplami = useMemo(
    () => tahsilatlar.reduce((t, x) => t + x.tutar, 0),
    [tahsilatlar],
  );

  const marketAcik = saatHazir ? marketAcikMi() : true;

  const gecikenSayisi = useMemo(
    () =>
      simdi == null
        ? 0
        : aktifTeslimatlar.filter((s) => {
            const g = gecikmeDk(s.planlanan_saat, s.planlanan_tarih);
            return g != null && g > 0;
          }).length,
    [aktifTeslimatlar, simdi],
  );

  /** Aynı binadaki açık teslimat sayısı. */
  const binaSayilari = useMemo(() => {
    const say = new Map<string, number>();
    for (const s of teslimatlar) {
      if (s.durum === "teslim" || s.durum === "iptal") continue;
      const k = binaAnahtari(s.adres);
      if (k) say.set(k, (say.get(k) ?? 0) + 1);
    }
    return say;
  }, [teslimatlar]);

  const rotaSirasi = useMemo(
    () => new Map(rota?.sira.map((id, i) => [id, i + 1]) ?? []),
    [rota],
  );

  const siraliTeslimatlar = useMemo(() => {
    const liste = katmanlar.teslimEdilenler
      ? teslimatlar
      : teslimatlar.filter((s) => s.durum !== "teslim");
    if (rotaSirasi.size === 0) return liste;
    return [...liste].sort(
      (a, b) =>
        (rotaSirasi.get(a.id) ?? 999) - (rotaSirasi.get(b.id) ?? 999),
    );
  }, [teslimatlar, katmanlar.teslimEdilenler, rotaSirasi]);

  /* Temayı belgeye yansıt ve tercihleri sakla. */
  useEffect(() => {
    document.documentElement.dataset.tema = katmanlar.karanlik
      ? "karanlik"
      : "aydinlik";
    try {
      localStorage.setItem(
        TERCIH_ANAHTARI,
        JSON.stringify({ karanlik: katmanlar.karanlik, ses: sesAcik }),
      );
    } catch {
      /* depolama kapalıysa yok say */
    }
  }, [katmanlar.karanlik, sesAcik]);

  /* ------------------------- Bildirim ------------------------- */
  const uyar = useCallback((mesaj: string) => {
    setBildirim(mesaj);
    setTimeout(() => setBildirim(null), 3200);
  }, []);

  /* ------------------------- Çevrimdışı kuyruk ------------------------- */
  useEffect(() => {
    void bekleyenler().then((b) => setBekleyenSayisi(b.length));

    // Sinyal geldiğinde ve düzenli aralıkla kuyruğu boşalt.
    const dene = () => void kuyruguIsle(db).then(setBekleyenSayisi);
    dene();
    window.addEventListener("online", dene);
    const sayac = setInterval(dene, 30_000);
    return () => {
      window.removeEventListener("online", dene);
      clearInterval(sayac);
    };
  }, [db]);

  /* ------------------------- Vardiya ------------------------- */
  useEffect(() => {
    if (!kurye) return;
    let iptal = false;

    void acikVardiyaGetir(db, kurye.id).then(async (v) => {
      if (iptal) return;
      setVardiya(v);
      const t = v ? await vardiyaTahsilatlari(db, v.id) : [];
      if (!iptal) setTahsilatlar(t);
    });

    return () => {
      iptal = true;
    };
  }, [db, kurye]);

  /* ------------------------- Diğer kuryeler ------------------------- */
  useEffect(() => {
    if (!kurye) return;
    const yukle = () =>
      void kuryeKonumlariGetir(db, kurye.id).then(setDigerKuryeler);
    yukle();

    const kanal = db
      .channel("kurye-konumlari")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kurye_konumlari" },
        yukle,
      )
      .subscribe();
    return () => {
      void db.removeChannel(kanal);
    };
  }, [db, kurye]);

  /* ------------------------- Veri tazeleme ------------------------- */
  const teslimatlariTazele = useCallback(async () => {
    const { data } = await db
      .from("siparisler")
      .select(
        `id, musteri_id, adres_id, kaynak, abonelik_id, kurye_id, durum, oncelik,
         planlanan_tarih, planlanan_saat, teslim_zamani, odeme_yontemi, tutar, notlar, created_at,
         musteri:musteriler ( id, ad, telefon, notlar ),
         adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, lat, lng, konum_dogrulandi ),
         kalemler:siparis_kalemleri ( id, urun_id, miktar, birim_fiyat, urun:urunler ( id, ad, birim, emoji, fiyat ) )`,
      )
      .order("oncelik", { ascending: false })
      .limit(400);
    if (data) setTeslimatlar(data as unknown as Siparis[]);
  }, [db]);

  useEffect(() => {
    const kanal = db
      .channel("siparis-akisi")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "siparisler" },
        () => void teslimatlariTazele(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(kanal);
    };
  }, [db, teslimatlariTazele]);

  /* ------------------------- Sesli tarif ------------------------- */
  useEffect(() => {
    sesRef.current = sesAcik;
    if (!sesAcik) sesiKes();
  }, [sesAcik]);

  const seslendir = useCallback(
    (
      secenek: RotaSecenegi,
      indeks: number,
      konum: Nokta,
      adimDegisti: boolean,
    ) => {
      if (!sesRef.current) return;
      const adim = secenek.adimlar[indeks];
      if (!adim) return;

      const mesafe = haversine(konum, adim.nokta);
      const onceki = seslendirilenRef.current;

      // Yeni manevraya geçildiğinde bir kez, manevraya yaklaşınca bir kez daha.
      if (adimDegisti || onceki.adim !== indeks) {
        seslendirilenRef.current = { adim: indeks, yakin: mesafe < 90 };
        konus(adimCumlesi(adim, mesafe));
        return;
      }
      if (!onceki.yakin && mesafe < 90) {
        seslendirilenRef.current = { adim: indeks, yakin: true };
        konus(adimCumlesi(adim, mesafe));
      }
    },
    [],
  );

  /* ------------------------- Canlı konum ------------------------- */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let sonYazma = 0;

    const izleyici = navigator.geolocation.watchPosition(
      (konum) => {
        const nokta = {
          lat: konum.coords.latitude,
          lng: konum.coords.longitude,
        };
        setKuryeKonumu(nokta);
        const yon =
          konum.coords.heading != null && !Number.isNaN(konum.coords.heading)
            ? konum.coords.heading
            : null;
        if (yon != null) setKuryeYonu(yon);

        // Sürüş modunda sıradaki manevraya geç ve kamerayı kuryeye kilitle.
        const { durum: navD, secenek, takip } = navRef.current;
        if (navD === "surus" && secenek) {
          const yeniAdim = siradakiAdim(
            secenek.adimlar,
            navAdimRef.current,
            nokta,
          );
          const adimDegisti = yeniAdim !== navAdimRef.current;
          navAdimRef.current = yeniAdim;
          setNavAdimIndeks(yeniAdim);
          seslendir(secenek, yeniAdim, nokta, adimDegisti);
          if (takip) haritaApi.current?.surusKamerasi(nokta, yon ?? 0);
        }

        const simdi = Date.now();
        if (kurye && simdi - sonYazma > 15_000) {
          sonYazma = simdi;
          void db.from("kurye_konumlari").upsert(
            {
              kurye_id: kurye.id,
              lat: nokta.lat,
              lng: nokta.lng,
              yon: konum.coords.heading,
              hiz: konum.coords.speed,
              dogruluk: konum.coords.accuracy,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "kurye_id" },
          );
        }
      },
      () => setKonumTakibi(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(izleyici);
  }, [db, kurye, seslendir]);

  /* İlk açılışta teslimatlara odaklan */
  const ilkOdakRef = useRef(false);
  const haritaHazir = useCallback(() => {
    if (ilkOdakRef.current) return;
    const noktalar = aktifTeslimatlar
      .filter((s) => s.adres?.lat != null)
      .map((s) => ({ lat: s.adres!.lat!, lng: s.adres!.lng! }));
    if (noktalar.length > 0) {
      ilkOdakRef.current = true;
      setTimeout(() => haritaApi.current?.hepsiniSigdir(noktalar), 400);
    }
  }, [aktifTeslimatlar]);

  /* ------------------------- Navigasyon ------------------------- */
  const navSecili = useMemo(
    () => navSecenekler.find((s) => s.id === navSeciliId) ?? navSecenekler[0] ?? null,
    [navSecenekler, navSeciliId],
  );

  const navAdim = navSecili?.adimlar[navAdimIndeks] ?? null;
  const navSonraki = navSecili?.adimlar[navAdimIndeks + 1] ?? null;

  useEffect(() => {
    navRef.current = { durum: navDurum, secenek: navSecili, takip: navTakip };
  });

  const navHedefNokta = useMemo<Nokta | null>(
    () =>
      navHedef?.adres?.lat != null
        ? { lat: navHedef.adres.lat, lng: navHedef.adres.lng! }
        : null,
    [navHedef],
  );

  const navVardi =
    !!kuryeKonumu && !!navHedefNokta && haversine(kuryeKonumu, navHedefNokta) < 70;

  const navKalan = useMemo(
    () =>
      navSecili
        ? kalanlar(navSecili, navAdimIndeks, kuryeKonumu)
        : { mesafeM: 0, sureSn: 0 },
    [navSecili, navAdimIndeks, kuryeKonumu],
  );

  const navAdimaKalanM =
    kuryeKonumu && navAdim ? haversine(kuryeKonumu, navAdim.nokta) : 0;

  async function navigasyonuAc(siparis: Siparis) {
    if (siparis.adres?.lat == null) {
      uyar("Bu adresin konumu tanımlı değil.");
      return;
    }
    const hedef = { lat: siparis.adres.lat, lng: siparis.adres.lng! };
    const baslangic = kuryeKonumu ?? MARKET.nokta;

    setNavHedef(siparis);
    setNavDurum("secim");
    setNavAdimIndeks(0);
    navAdimRef.current = 0;
    seslendirilenRef.current = { adim: -1, yakin: false };
    setNavTakip(true);
    setNavSecenekler([]);
    setNavSeciliId(null);
    setNavYukleniyor(true);
    setPanel("kapali");

    try {
      const yanit = await fetch("/api/navigasyon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baslangic, hedef }),
      });
      if (!yanit.ok) throw new Error("navigasyon");
      const { secenekler } = (await yanit.json()) as {
        secenekler: RotaSecenegi[];
      };
      setNavSecenekler(secenekler);
      setNavSeciliId(secenekler[0]?.id ?? null);
      if (secenekler[0]) {
        haritaApi.current?.geometriyiSigdir(secenekler[0].geometri, 320);
      }
    } catch {
      uyar("Rota alınamadı.");
      setNavHedef(null);
    } finally {
      setNavYukleniyor(false);
    }
  }

  function navigasyonuKapat() {
    sesiKes();
    setNavHedef(null);
    setNavSecenekler([]);
    setNavSeciliId(null);
    setNavDurum("secim");
    setNavAdimIndeks(0);
    navAdimRef.current = 0;
    setNavTakip(true);
  }

  function surusuBaslat() {
    if (!navSecili) return;
    setNavDurum("surus");
    setNavAdimIndeks(0);
    navAdimRef.current = 0;
    seslendirilenRef.current = { adim: -1, yakin: false };
    setNavTakip(true);

    const nokta = kuryeKonumu ?? {
      lat: navSecili.geometri[0][1],
      lng: navSecili.geometri[0][0],
    };
    haritaApi.current?.surusKamerasi(nokta, kuryeYonu ?? aci.bearing);

    // İlk yönergeyi hemen söyle — kullanıcı dokunuşu sesi de yetkilendirir.
    if (sesRef.current && navSecili.adimlar[0]) {
      konus(adimCumlesi(navSecili.adimlar[0], navSecili.adimlar[0].mesafeM));
      seslendirilenRef.current = { adim: 0, yakin: false };
    }
  }

  /** Kamerayı yeniden kuryeye kilitler. */
  function takibeDon() {
    setNavTakip(true);
    if (kuryeKonumu) haritaApi.current?.surusKamerasi(kuryeKonumu, kuryeYonu ?? 0);
  }

  function hariciNavigasyon() {
    if (!navHedefNokta) return;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const adres = iOS
      ? `maps://?daddr=${navHedefNokta.lat},${navHedefNokta.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${navHedefNokta.lat},${navHedefNokta.lng}&travelmode=driving`;
    window.open(adres, "_blank", "noreferrer");
  }

  /* ------------------------- Etkileşimler ------------------------- */
  function pinSecildi(id: string) {
    if (secimModu) {
      secimDegistir(id);
      return;
    }
    setSeciliId(id);
    setPanel("yari");
    const s = teslimatlar.find((t) => t.id === id);
    if (s?.adres?.lat != null)
      haritaApi.current?.ucur({ lat: s.adres.lat, lng: s.adres.lng! });
  }

  function secimDegistir(id: string) {
    setSecilenler((onceki) =>
      onceki.includes(id) ? onceki.filter((x) => x !== id) : [...onceki, id],
    );
  }

  async function rotayiOlustur() {
    const duraklar = secilenler
      .map((id) => teslimatlar.find((s) => s.id === id))
      .filter((s): s is Siparis => !!s && s.adres?.lat != null)
      .map((s) => ({
        id: s.id,
        nokta: { lat: s.adres!.lat!, lng: s.adres!.lng! },
      }));

    if (duraklar.length < 2) {
      uyar("En az 2 konumu belli teslimat seçin.");
      return;
    }

    const baslangic = kuryeKonumu ?? MARKET.nokta;
    setRotaHesapla(true);
    try {
      const yanit = await fetch("/api/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baslangic, duraklar }),
      });
      if (!yanit.ok) throw new Error("rota");
      const sonuc = (await yanit.json()) as RotaSonucu;
      setRota(sonuc);
      setSecimModu(false);
      setPanel("kapali");
      haritaApi.current?.hepsiniSigdir([baslangic, ...duraklar.map((d) => d.nokta)]);
    } catch {
      uyar("Rota hesaplanamadı, tekrar deneyin.");
    } finally {
      setRotaHesapla(false);
    }
  }

  async function rotayiUstlen() {
    if (!rota || !kurye) return;
    setIslemde(true);
    try {
      const { data: yeniRota } = await db
        .from("rotalar")
        .insert({
          kurye_id: kurye.id,
          durum: "basladi",
          siparis_sirasi: rota.sira,
          toplam_mesafe_m: Math.round(rota.toplamMesafeM),
          toplam_sure_sn: Math.round(rota.toplamSureSn),
          baslangic_lat: kuryeKonumu?.lat ?? null,
          baslangic_lng: kuryeKonumu?.lng ?? null,
        })
        .select("id")
        .single();

      await db
        .from("siparisler")
        .update({ kurye_id: kurye.id, rota_id: yeniRota?.id ?? null })
        .in("id", rota.sira);

      await teslimatlariTazele();
      uyar(`${rota.sira.length} teslimat üstlenildi.`);
    } catch {
      uyar("Rota kaydedilemedi.");
    } finally {
      setIslemde(false);
    }
  }

  /** Siparişi hem yerelde hem sunucuda günceller; ağ yoksa kuyruğa yazar. */
  async function siparisGuncelle(
    id: string,
    yama: Record<string, unknown>,
    yereleUygula: (s: Siparis) => Siparis,
  ) {
    setIslemde(true);
    setTeslimatlar((onceki) =>
      onceki.map((s) => (s.id === id ? yereleUygula(s) : s)),
    );

    const gonderildi = await kuyrukVeyaGonder(db, {
      tur: "siparis-guncelle",
      veri: { siparisId: id, yama },
    });
    if (!gonderildi) setBekleyenSayisi((b) => b + 1);
    setIslemde(false);
    return gonderildi;
  }

  async function durumDegistir(id: string, durum: SiparisDurumu) {
    const yama: Record<string, unknown> = { durum };
    if (kurye) yama.kurye_id = kurye.id;
    await siparisGuncelle(id, yama, (s) => ({
      ...s,
      durum,
      kurye_id: kurye?.id ?? s.kurye_id,
    }));
  }

  /** Teslim ettim / teslim edilemedi akışının sonucu. */
  async function teslimSonucuUygula(sonuc: TeslimSonuc) {
    if (!secili) return;
    const id = secili.id;

    if (sonuc.tur === "teslim") {
      const zaman = new Date().toISOString();
      const yama: Record<string, unknown> = {
        durum: "teslim",
        teslim_zamani: zaman,
        kurye_id: kurye?.id ?? null,
      };
      if (sonuc.tahsilat) yama.odeme_yontemi = sonuc.tahsilat.yontem;

      await siparisGuncelle(id, yama, (s) => ({
        ...s,
        durum: "teslim",
        teslim_zamani: zaman,
        odeme_yontemi: sonuc.tahsilat?.yontem ?? s.odeme_yontemi,
      }));

      if (sonuc.tahsilat && kurye) {
        const kayit = {
          siparis_id: id,
          kurye_id: kurye.id,
          vardiya_id: vardiya?.id ?? null,
          tutar: sonuc.tahsilat.tutar,
          yontem: sonuc.tahsilat.yontem,
        };
        const gonderildi = await kuyrukVeyaGonder(db, {
          tur: "tahsilat-ekle",
          veri: kayit,
        });
        if (!gonderildi) setBekleyenSayisi((b) => b + 1);
        // Kasa toplamı anında güncellensin.
        setTahsilatlar((o) => [
          {
            ...kayit,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
          } as Tahsilat,
          ...o,
        ]);
      }

      uyar("Teslimat tamamlandı 🎉");
    } else {
      const yarin = new Date();
      yarin.setDate(yarin.getDate() + 1);
      const yama: Record<string, unknown> = {
        durum: "basarisiz",
        basarisizlik_sebebi: sonuc.sebep,
        basarisizlik_notu: sonuc.not || null,
        deneme_sayisi: (secili.deneme_sayisi ?? 0) + 1,
        kurye_id: kurye?.id ?? null,
      };
      if (sonuc.yarinTekrar) {
        yama.durum = "bekliyor";
        yama.planlanan_tarih = yarin.toISOString().slice(0, 10);
      }

      await siparisGuncelle(id, yama, (s) => ({
        ...s,
        durum: (sonuc.yarinTekrar ? "bekliyor" : "basarisiz") as SiparisDurumu,
        basarisizlik_sebebi: sonuc.sebep,
        basarisizlik_notu: sonuc.not || null,
        deneme_sayisi: (s.deneme_sayisi ?? 0) + 1,
      }));

      uyar(
        sonuc.yarinTekrar
          ? "Kaydedildi · yarına aktarıldı"
          : "Teslim edilemedi olarak kaydedildi",
      );
    }

    setTeslimModu(null);
    setSeciliId(null);
  }

  /** Kuryenin kapı bilgisi — adres kaydında kalıcı. */
  async function kapiBilgisiKaydet(kuryeNotu: string, kapiKodu: string) {
    const adresId = secili?.adres?.id;
    if (!adresId) return;

    setIslemde(true);
    const yama = {
      kurye_notu: kuryeNotu || null,
      kapi_kodu: kapiKodu || null,
    };
    setTeslimatlar((onceki) =>
      onceki.map((s) =>
        s.adres?.id === adresId ? { ...s, adres: { ...s.adres, ...yama } } : s,
      ),
    );

    const gonderildi = await kuyrukVeyaGonder(db, {
      tur: "adres-guncelle",
      veri: { adresId, yama },
    });
    if (!gonderildi) setBekleyenSayisi((b) => b + 1);
    setIslemde(false);
    uyar("Kapı bilgisi kaydedildi");
  }

  async function konumuKaydet(nokta: Nokta) {
    if (!konumDuzeltme) return;
    const hedef = teslimatlar.find((s) => s.id === konumDuzeltme);
    if (!hedef?.adres) return;

    const { error } = await db
      .from("adresler")
      .update({ lat: nokta.lat, lng: nokta.lng, konum_dogrulandi: true })
      .eq("id", hedef.adres.id);

    if (error) {
      uyar("Konum kaydedilemedi.");
      return;
    }
    setTeslimatlar((onceki) =>
      onceki.map((s) =>
        s.adres?.id === hedef.adres!.id
          ? {
              ...s,
              adres: {
                ...s.adres,
                lat: nokta.lat,
                lng: nokta.lng,
                konum_dogrulandi: true,
              },
            }
          : s,
      ),
    );
    setKonumDuzeltme(null);
    uyar("Konum güncellendi.");
  }

  /** Vardiyaya gir; zaten vardiyadaysa kasa özetini aç. */
  async function vardiyaDegistir() {
    if (!kurye) return;

    if (kurye.vardiyada) {
      setVardiyaOzeti(true);
      return;
    }

    setIslemde(true);
    const { data } = await db
      .from("vardiyalar")
      .insert({ kurye_id: kurye.id })
      .select("id, kurye_id, baslangic, bitis, durum, teslim_edilen_nakit, notlar")
      .single();
    await db.from("kuryeler").update({ vardiyada: true }).eq("id", kurye.id);
    setVardiya((data as Vardiya) ?? null);
    setTahsilatlar([]);
    setIslemde(false);
    uyar("Vardiya başladı");
    yonlendir.refresh();
  }

  /** Kasayı teslim et ve vardiyayı kapat. */
  async function vardiyayiKapat(nakit: number, notlar: string) {
    if (!kurye) return;
    setIslemde(true);

    if (vardiya) {
      await db
        .from("vardiyalar")
        .update({
          bitis: new Date().toISOString(),
          durum: "kapali",
          teslim_edilen_nakit: nakit,
          notlar: notlar || null,
        })
        .eq("id", vardiya.id);
    }
    await db.from("kuryeler").update({ vardiyada: false }).eq("id", kurye.id);

    setVardiya(null);
    setTahsilatlar([]);
    setVardiyaOzeti(false);
    setIslemde(false);
    uyar("Vardiya kapandı · kasa teslim edildi");
    yonlendir.refresh();
  }

  async function cikis() {
    await db.auth.signOut();
    yonlendir.replace("/giris");
    yonlendir.refresh();
  }

  /* ------------------------- Görünüm ------------------------- */
  const toplamTahsilat = aktifTeslimatlar.reduce((t, s) => t + s.tutar, 0);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-yuzey2">
      <Harita
        ref={haritaApi}
        teslimatlar={teslimatlar}
        abonelikler={bugunAbonelikler}
        seciliId={seciliId}
        secimModu={secimModu}
        secilenler={secilenler}
        rota={rota}
        navigasyonSecenekleri={navSecenekler}
        seciliSecenekId={navSeciliId}
        katmanlar={katmanlar}
        kuryeKonumu={kuryeKonumu}
        kuryeYonu={kuryeYonu}
        digerKuryeler={digerKuryeler}
        onSecim={pinSecildi}
        onSecenekSec={setNavSeciliId}
        onKullaniciHareketi={() => {
          if (navRef.current.durum === "surus") setNavTakip(false);
          setKonumTakibi(false);
        }}
        onHaritaTikla={konumDuzeltme ? konumuKaydet : undefined}
        onAciDegisti={(bearing, pitch) => setAci({ bearing, pitch })}
        onHazir={haritaHazir}
      />

      {/* Üst çubuk */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[calc(env(safe-area-inset-top)+12px)]"
      >
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-[22px] border border-cizgi bg-yuzey/85 p-2 pr-3 shadow-yumusak backdrop-blur-2xl">
          <SultanAmblem boyut={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold leading-tight">
              {kurye?.ad || "Kurye"}
              <span className="ml-1.5 font-bold text-gri">
                · {aktifTeslimatlar.length} teslimat
              </span>
            </p>
            <p className="truncate text-[11px] font-semibold text-gri">
              {para(kasaToplami)} kasada · {para(toplamTahsilat)} kalan
              {!marketAcik ? (
                <span className="text-turuncu">
                  {" "}
                  · market {MARKET.acilis}&apos;da açılıyor
                </span>
              ) : (
                gecikenSayisi > 0 && (
                  <span className="text-kirmizi">
                    {" "}
                    · {gecikenSayisi} geciken
                  </span>
                )
              )}
            </p>
          </div>
          {bekleyenSayisi > 0 && (
            <span
              title="Sinyal gelince gönderilecek"
              className="flex shrink-0 items-center gap-1 rounded-hap bg-turuncu/15 px-2 py-1 text-[11px] font-black text-turuncu"
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-turuncu"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              {bekleyenSayisi}
            </span>
          )}
          <button
            onClick={vardiyaDegistir}
            className={`rounded-hap px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
              kurye?.vardiyada
                ? "bg-kirmizi text-white"
                : "bg-yuzey2 text-gri hover:bg-cizgi"
            }`}
          >
            {kurye?.vardiyada ? "Vardiyada" : "Mola"}
          </button>
          <button
            onClick={cikis}
            aria-label="Çıkış"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-yuzey2 text-gri transition-colors hover:bg-cizgi"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 15l4-3-4-3M20 12H10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </motion.header>

      <HaritaKontrolleri
        bearing={aci.bearing}
        pitch={aci.pitch}
        katmanlar={katmanlar}
        katmanPaneli={katmanPaneli}
        konumTakibi={konumTakibi}
        onPusula={() => haritaApi.current?.pusulaSifirla()}
        onEgim={() => haritaApi.current?.egimDegistir()}
        onYakinlastir={(yon) => haritaApi.current?.yakinlastir(yon)}
        onKonum={() => {
          if (kuryeKonumu) {
            haritaApi.current?.ucur(kuryeKonumu, 17);
            setKonumTakibi(true);
          } else {
            uyar("Konum alınamadı. Tarayıcı izinlerini kontrol edin.");
          }
        }}
        onKatmanPaneli={setKatmanPaneli}
        onKatman={(k) => setKatmanlar((o) => ({ ...o, [k]: !o[k] }))}
      />

      {/* Rota özeti */}
      <AnimatePresence>
        {rota && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+80px)] z-20 flex items-center gap-3 rounded-[20px] border border-kontrast/10 bg-kontrast/92 p-3 text-white shadow-yuzen backdrop-blur-xl"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kirmizi text-sm font-black">
              {rota.sira.length}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold">
                {mesafeYaz(rota.toplamMesafeM)} · {sureYaz(rota.toplamSureSn)}
              </p>
              <p className="text-[11px] font-semibold text-white/60">
                {rota.motor === "osrm"
                  ? "Gerçek yol ağı üzerinde optimize edildi"
                  : "Kuş uçuşu + 2-opt ile optimize edildi"}
              </p>
            </div>
            <button
              onClick={rotayiUstlen}
              disabled={islemde}
              className="rounded-hap bg-kirmizi px-3.5 py-2 text-[12px] font-black disabled:opacity-60"
            >
              Üstlen
            </button>
            <button
              onClick={() => setRota(null)}
              aria-label="Rotayı kapat"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-yuzey/10 text-white/70"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Konum düzeltme uyarısı */}
      <AnimatePresence>
        {konumDuzeltme && (
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+80px)] z-30 flex items-center gap-3 rounded-[20px] bg-kirmizi p-3 text-white shadow-kirmizi"
          >
            <span className="text-lg">📍</span>
            <p className="flex-1 text-[13px] font-bold">
              Doğru konumu haritada işaretleyin.
            </p>
            <button
              onClick={() => setKonumDuzeltme(null)}
              className="rounded-hap bg-yuzey/20 px-3 py-1.5 text-[12px] font-black"
            >
              Vazgeç
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toplu seçim eylem çubuğu */}
      <AnimatePresence>
        {secimModu && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="absolute inset-x-3 bottom-4 z-40 flex items-center gap-2 rounded-[22px] bg-kontrast p-2 pl-4 text-white shadow-yuzen"
          >
            <p className="flex-1 text-[13px] font-extrabold">
              {secilenler.length} durak seçildi
            </p>
            <button
              onClick={() => {
                setSecimModu(false);
                setSecilenler([]);
              }}
              className="rounded-hap bg-yuzey/10 px-3.5 py-2.5 text-[12px] font-bold"
            >
              Vazgeç
            </button>
            <button
              onClick={rotayiOlustur}
              disabled={rotaHesapla || secilenler.length < 2}
              className="rounded-hap bg-kirmizi px-4 py-2.5 text-[12px] font-black disabled:opacity-50"
            >
              {rotaHesapla ? "Hesaplanıyor…" : "En kısa yolu bul"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bildirim */}
      <AnimatePresence>
        {bildirim && (
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.95 }}
            className="pointer-events-none absolute inset-x-0 bottom-32 z-50 mx-auto w-fit rounded-hap bg-kontrast px-4 py-2.5 text-[13px] font-bold text-white shadow-yuzen"
          >
            {bildirim}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teslim sonucu ve kasa */}
      <AnimatePresence>
        {teslimModu && secili && (
          <TeslimSonucu
            key="teslim-sonucu"
            siparis={secili}
            mod={teslimModu}
            islemde={islemde}
            onKapat={() => setTeslimModu(null)}
            onOnay={teslimSonucuUygula}
          />
        )}
        {vardiyaOzeti && vardiya && (
          <VardiyaOzeti
            key="vardiya-ozeti"
            vardiya={vardiya}
            tahsilatlar={tahsilatlar}
            teslimEdilen={
              teslimatlar.filter((s) => s.durum === "teslim").length
            }
            basarisiz={
              teslimatlar.filter(
                (s) => s.durum === "basarisiz" || s.deneme_sayisi > 0,
              ).length
            }
            toplamMesafeM={rota?.toplamMesafeM ?? 0}
            toplamSureSn={rota?.toplamSureSn ?? 0}
            islemde={islemde}
            onKapat={() => setVardiyaOzeti(false)}
            onVardiyayiKapat={vardiyayiKapat}
          />
        )}
      </AnimatePresence>

      {/* Navigasyon */}
      <AnimatePresence>
        {navHedef && (
          <NavigasyonPaneli
            key="navigasyon"
            durum={navDurum}
            hedef={navHedef}
            secenekler={navSecenekler}
            seciliId={navSeciliId}
            yukleniyor={navYukleniyor}
            adim={navAdim}
            sonrakiAdim={navSonraki}
            adimaKalanM={navAdimaKalanM}
            kalanMesafeM={navKalan.mesafeM}
            kalanSureSn={navKalan.sureSn}
            vardi={navVardi}
            takipAcik={navTakip}
            sesAcik={sesAcik}
            onTakip={takibeDon}
            onSes={() => setSesAcik((o) => !o)}
            onSecenek={setNavSeciliId}
            onBasla={surusuBaslat}
            onBitir={navigasyonuKapat}
            onTeslim={() => {
              void durumDegistir(navHedef.id, "teslim");
              navigasyonuKapat();
            }}
            onHariciAc={hariciNavigasyon}
          />
        )}
      </AnimatePresence>

      {/* Alt panel */}
      {!navHedef && (
      <AltPanel
        durum={panel}
        onDurum={setPanel}
        baslik={
          <div className="flex items-center gap-2">
            <div className="ince-kaydirma flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_88%,transparent)]">
              {SEKMELER.map((s) => (
                <button
                  key={s.anahtar}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSekme(s.anahtar);
                    setSeciliId(null);
                    if (panel === "kapali") setPanel("yari");
                  }}
                  className={`relative shrink-0 rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                    sekme === s.anahtar ? "text-white" : "text-gri hover:bg-yuzey2"
                  }`}
                >
                  {sekme === s.anahtar && (
                    <motion.span
                      layoutId="sekme-arka"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-hap bg-kontrast"
                    />
                  )}
                  <span className="relative">{s.ad}</span>
                </button>
              ))}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSecimModu((o) => !o);
                setSecilenler([]);
                setSeciliId(null);
                setSekme("teslimatlar");
                setPanel("yari");
              }}
              className={`shrink-0 rounded-hap px-3 py-2 text-[12px] font-black transition-colors ${
                secimModu
                  ? "bg-kirmizi text-white"
                  : "bg-kirmizi-sis text-kirmizi-koyu"
              }`}
            >
              Toplu rota
            </button>
          </div>
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {secili && !secimModu ? (
            <TeslimatDetay
              key={`detay-${secili.id}`}
              siparis={secili}
              kuryeKonumu={kuryeKonumu}
              islemde={islemde}
              onKapat={() => setSeciliId(null)}
              onDurum={(d) => durumDegistir(secili.id, d)}
              onTeslimSonucu={setTeslimModu}
              onNotKaydet={kapiBilgisiKaydet}
              onNavigasyon={() => navigasyonuAc(secili)}
              onKonumDuzelt={() => {
                setKonumDuzeltme(secili.id);
                setPanel("kapali");
              }}
            />
          ) : (
            <motion.div
              key={sekme}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-2 pb-6 pt-1"
            >
              {sekme === "teslimatlar" && (
                <>
                  {siraliTeslimatlar.map((s) => (
                    <TeslimatSatiri
                      key={s.id}
                      siparis={s}
                      sira={rotaSirasi.get(s.id)}
                      secili={seciliId === s.id}
                      secimModu={secimModu}
                      isaretli={secilenler.includes(s.id)}
                      gecikme={
                        saatHazir
                          ? gecikmeDk(s.planlanan_saat, s.planlanan_tarih)
                          : null
                      }
                      binaSayisi={binaSayilari.get(binaAnahtari(s.adres))}
                      onTikla={() => pinSecildi(s.id)}
                    />
                  ))}
                  {siraliTeslimatlar.length === 0 && (
                    <Bos mesaj="Bugün için teslimat yok." />
                  )}
                </>
              )}

              {sekme === "abonelikler" && (
                <>
                  {abonelikler.map((a) => (
                    <AbonelikSatiri
                      key={a.id}
                      abonelik={a}
                      bugun={bugunAbonelikler.some((b) => b.id === a.id)}
                      onTikla={() => {
                        if (a.adres?.lat != null) {
                          haritaApi.current?.ucur({
                            lat: a.adres.lat,
                            lng: a.adres.lng!,
                          });
                          setPanel("kapali");
                        }
                      }}
                    />
                  ))}
                  {abonelikler.length === 0 && (
                    <Bos mesaj="Aktif abonelik yok." />
                  )}
                </>
              )}

              {sekme === "sepetler" && (
                <>
                  {sepetler.map((s) => (
                    <SepetSatiri
                      key={s.id}
                      sepet={s}
                      onTikla={() => {
                        if (s.adres?.lat != null) {
                          haritaApi.current?.ucur({
                            lat: s.adres.lat,
                            lng: s.adres.lng!,
                          });
                          setPanel("kapali");
                        }
                      }}
                    />
                  ))}
                  {sepetler.length === 0 && <Bos mesaj="Açık sepet yok." />}
                </>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </AltPanel>
      )}
    </main>
  );
}

function Bos({ mesaj }: { mesaj: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="text-3xl opacity-40">🗺️</span>
      <p className="text-sm font-semibold text-gri">{mesaj}</p>
    </div>
  );
}
