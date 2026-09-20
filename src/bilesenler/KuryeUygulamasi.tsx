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
import KayitEkle, {
  type DuzenlenenKayit,
  type EklenenKayit,
} from "./KayitEkle";
import HaritaBalonu, { type BalonKayit } from "./HaritaBalonu";
import KonumTamamla from "./KonumTamamla";
import TopluYukleme from "./TopluYukleme";
import VardiyaOzeti from "./VardiyaOzeti";
import NavigasyonPaneli, { type NavigasyonDurumu } from "./NavigasyonPaneli";
import {
  AbonelikSatiri,
  ListeArama,
  SepetSatiri,
  TeslimatSatiri,
} from "./Listeler";
import { SultanAmblem } from "./SultanLogo";

import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { haversine, mesafeYaz, sureYaz } from "@/lib/rota";
import { MARKET, marketAcikMi } from "@/lib/market";
import {
  SAPMA_ESIGI_M,
  kalanlar,
  rotayaUzaklik,
  siradakiAdim,
  type RotaSecenegi,
} from "@/lib/navigasyon";
import { adimCumlesi, konus, sesiKes } from "@/lib/ses";
import {
  abonelikBugunMu,
  abonelikleriGetir,
  abonelikSil,
  odemeYontemiEkle,
  sepetiSiparise,
  sepetleriGetir,
  odemeYontemiKaldir,
  sepetSil,
  siparisSil,
  acikVardiyaGetir,
  kuryeKonumlariGetir,
  vardiyaTahsilatlari,
} from "@/lib/veri";
import { binaAnahtari, bugununTarihi, gecikmeDk, para } from "@/lib/bicim";
import { bekleyenler, kuyruguIsle, kuyrukVeyaGonder } from "@/lib/cevrimdisi";
import type {
  Abonelik,
  Kurye,
  KuryeKonumu,
  Nokta,
  RotaSonucu,
  Adres,
  OdemeYontemiTanimi,
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

/**
 * Tek seferde çizilen en fazla satır.
 *
 * Market defterindeki abone sayısı binleri buluyor; hepsini birden çizmek
 * telefonda sekme geçişini saniyelere çıkarıyordu. Aranan kayda arama
 * kutusundan ulaşılıyor, liste kısa kalıyor.
 */
const AZAMI_SATIR = 100;

/**
 * Bu hata payından kötü konum diğer kuryelerle paylaşılmıyor.
 *
 * Telefonun GPS'i ~10 m, Wi-Fi ~50-200 m veriyor. Masaüstünde ya da VPN
 * arkasında tarayıcı IP'den tahmin yürütüyor ve pay kilometrelere çıkıyor;
 * o konum kimseye yaramıyor.
 */
const PAYLASILIR_DOGRULUK_M = 500;

/** Bundan kötü paya "konum güvenilmez" uyarısı çıkıyor. */
const SUPHELI_DOGRULUK_M = 300;

/**
 * Bu paydan iyi ölçüm gerçek GPS sayılıyor.
 *
 * Elle işaretlenmiş konumu yalnızca böyle bir ölçüm ezebiliyor: kurye
 * telefonu cebinden çıkarıp dışarı adım attığında cihaz onun elle koyduğu
 * noktadan daha iyisini biliyor, ama masaüstünün IP tahmini bilmiyor.
 */
const IYI_DOGRULUK_M = 100;

/** Ad, telefon ya da adres metninde arama. */
function kayitAra(
  kayit: {
    musteri: { ad: string; telefon: string | null } | null;
    adres: { adres_metni: string } | null;
  },
  anahtar: string,
): boolean {
  const icerir = (m: string | null | undefined) =>
    (m ?? "").toLocaleLowerCase("tr").includes(anahtar);
  return (
    icerir(kayit.musteri?.ad) ||
    icerir(kayit.musteri?.telefon) ||
    icerir(kayit.adres?.adres_metni)
  );
}

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
  /** Listede gösterilecek aktif ödeme yöntemleri. */
  baslangicYontemler: OdemeYontemiTanimi[];
};

export default function KuryeUygulamasi({
  kurye,
  baslangicTeslimatlar,
  baslangicAbonelikler,
  baslangicSepetler,
  baslangicYontemler,
}: Props) {
  const yonlendir = useRouter();
  const db = useMemo(() => tarayiciIstemcisi(), []);
  const haritaApi = useRef<HaritaApi>(null);

  const [teslimatlar, setTeslimatlar] = useState(baslangicTeslimatlar);
  const [abonelikler, setAbonelikler] = useState(baslangicAbonelikler);
  const [sepetler, setSepetler] = useState(baslangicSepetler);
  const [yontemler, setYontemler] = useState(baslangicYontemler);

  const [ekleMenu, setEkleMenu] = useState(false);
  const [kayitEkle, setKayitEkle] = useState(false);
  const [topluYukleme, setTopluYukleme] = useState(false);
  const [konumTamamla, setKonumTamamla] = useState(false);
  /** Satır menüsü açık olan kayıt. */
  const [islemKayit, setIslemKayit] = useState<EklenenKayit | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<DuzenlenenKayit | null>(null);
  const [silOnay, setSilOnay] = useState(false);
  /** Teslim ekranı hangi seçenekle açılsın — haritadan "Alınamadı" gelebiliyor. */
  const [teslimBaslangic, setTeslimBaslangic] = useState<"alindi" | "alinmadi">(
    "alindi",
  );
  /**
   * Haritadan teslim işaretlenenler: kimlik → önceki durum. Aynı pine tekrar
   * uzun basıldığında bu durumuna (çoğunlukla kırmızı "bekliyor") dönüyor.
   */
  const [sonTeslimler, setSonTeslimler] = useState<
    Record<string, SiparisDurumu>
  >({});
  /** Haritada açık balon — kayıt listeden tazelensin diye yalnızca kimlik tutuluyor. */
  const [balonSecim, setBalonSecim] = useState<{
    tur: "teslimat" | "abonelik" | "sepet";
    id: string;
  } | null>(null);

  const [sekme, setSekme] = useState<Sekme>("teslimatlar");
  const [panel, setPanel] = useState<PanelDurumu>("yari");
  const [seciliId, setSeciliId] = useState<string | null>(null);

  const [secimModu, setSecimModu] = useState(false);
  const [secilenler, setSecilenler] = useState<string[]>([]);
  const [indiriliyor, setIndiriliyor] = useState(false);
  /** Abonelik ve sepet listelerinde ad/telefon/adres araması. */
  const [arama, setArama] = useState("");
  const [rota, setRota] = useState<RotaSonucu | null>(null);
  const [rotaHesapla, setRotaHesapla] = useState(false);

  const [katmanlar, setKatmanlar] = useState<Katmanlar>(() => ({
    abonelikler: true,
    sepetler: true,
    teslimEdilenler: false,
    ucBoyut: true,
    isiHaritasi: false,
    karanlik: tercihOku().karanlik ?? false,
  }));
  const [katmanPaneli, setKatmanPaneli] = useState(false);

  const [kuryeKonumu, setKuryeKonumu] = useState<Nokta | null>(null);
  /** Konumun hata payı (metre); tarayıcı her ölçümle birlikte veriyor. */
  const [kuryeDogrulugu, setKuryeDogrulugu] = useState<number | null>(null);
  /** Kurye kendi konumunu haritadan işaretliyor. */
  const [kendiKonumSec, setKendiKonumSec] = useState(false);
  /*
   * Konum elle konulduysa tarayıcının kaba tahmini onu ezmesin. Ref, çünkü
   * `watchPosition` geri çağırımı bir kez kuruluyor ve state'in eski hâlini
   * görürdü. Gerçek GPS devreye girerse kilit kendiliğinden açılıyor:
   * o noktada cihaz elle konulan noktadan daha iyisini biliyor.
   */
  const elleAyarliRef = useRef(false);
  const [elleAyarli, setElleAyarli] = useState(false);
  /** Artınca konum izleyicisi söküp yeniden kuruluyor. */
  const [konumTazeleme, setKonumTazeleme] = useState(0);
  /** Yeniden ölçümden sonra gelen ilk konuma kamera uçsun. */
  const konumaUcRef = useRef(false);
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
    hedef: Nokta | null;
  }>({ durum: "secim", secenek: null, takip: true, hedef: null });
  // Rotadan sapma: art arda kaç konum çizgiden uzak düştü.
  const sapmaSayaciRef = useRef(0);
  const sonYenidenRotaRef = useRef(0);
  const yenidenRotalaniyorRef = useRef(false);
  const yenidenRotalaRef = useRef<(konum: Nokta) => Promise<void>>(
    async () => {},
  );
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
  const [bildirim, setBildirim] = useState<{
    mesaj: string;
    eylem?: { etiket: string; calistir: () => void };
  } | null>(null);
  const bildirimSayacRef = useRef<number | null>(null);

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
    // İptaller hiçbir katmanda görünmüyor; kapanmış kayıt teslimat listesini
    // şişiriyordu.
    const acik = teslimatlar.filter((s) => s.durum !== "iptal");
    const liste = katmanlar.teslimEdilenler
      ? acik
      : acik.filter((s) => s.durum !== "teslim");
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
  const uyar = useCallback(
    (mesaj: string, eylem?: { etiket: string; calistir: () => void }) => {
      if (bildirimSayacRef.current) window.clearTimeout(bildirimSayacRef.current);
      setBildirim({ mesaj, eylem });
      // Geri alınabilir işlemlerde kurye okuyup karar versin diye daha uzun.
      bildirimSayacRef.current = window.setTimeout(
        () => setBildirim(null),
        eylem ? 6000 : 3200,
      );
    },
    [],
  );

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

  /**
   * Abonelik ve sepet listelerini baştan okur.
   *
   * Teslimatların canlı akışı var, bu ikisinin yok: toplu yüklemeden sonra
   * yeni kayıtların görünmesi için elle tazeleniyor.
   */
  const listeleriTazele = useCallback(async () => {
    const [yeniAbonelikler, yeniSepetler] = await Promise.all([
      abonelikleriGetir(db),
      sepetleriGetir(db),
    ]);
    setAbonelikler(yeniAbonelikler);
    setSepetler(yeniSepetler);
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

  /**
   * Konumu yeniden ölçtürür.
   *
   * Ayrı bir `getCurrentPosition` işe yaramıyor: `watchPosition` açıkken
   * `maximumAge: 0` isteği cihazın yeni ölçüm üretmesini bekliyor ve konum
   * IP'den geliyorsa o ölçüm hiç gelmiyor — düğme sessizce asılı kalıyordu.
   * Bunun yerine izleyici söküp yeniden kuruluyor; tarayıcı yeni izleyiciye
   * elindeki en iyi ölçümü hemen veriyor. Elle işaretlenmiş konumun kilidi
   * de açılıyor: kurye "yeniden bul" dediyse ölçümü istiyor demektir.
   */
  function konumuYenidenBul() {
    if (!("geolocation" in navigator)) {
      uyar("Tarayıcı konum vermiyor.");
      return;
    }
    elleAyarliRef.current = false;
    setElleAyarli(false);
    konumaUcRef.current = true;
    setKonumTakibi(true);
    uyar("Konum yeniden aranıyor…");
    setKonumTazeleme((n) => n + 1);
  }

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
        const dogruluk =
          konum.coords.accuracy != null && !Number.isNaN(konum.coords.accuracy)
            ? konum.coords.accuracy
            : null;

        // Elle işaretlenmiş konum, ancak gerçekten iyi bir ölçümle değişir.
        if (elleAyarliRef.current) {
          if ((dogruluk ?? Infinity) > IYI_DOGRULUK_M) return;
          elleAyarliRef.current = false;
          setElleAyarli(false);
        }

        setKuryeKonumu(nokta);
        setKuryeDogrulugu(dogruluk);

        if (konumaUcRef.current) {
          konumaUcRef.current = false;
          haritaApi.current?.ucur(nokta, 17);
          uyar(
            dogruluk != null && dogruluk > SUPHELI_DOGRULUK_M
              ? `Konum ±${
                  dogruluk >= 1000
                    ? `${(dogruluk / 1000).toFixed(1)} km`
                    : `${Math.round(dogruluk)} m`
                } payla bulundu`
              : "Konum güncellendi",
          );
        }
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

          // Rotadan sapma: iyi doğruluklu iki konum art arda çizgiden
          // uzaksa bulunduğu yerden en hızlı rotayı yeniden iste. Kuş
          // uçuşu "yerel" rotada anlamı yok — zaten yol değil.
          if (
            secenek.motor === "osrm" &&
            (dogruluk ?? Infinity) <= 60 &&
            rotayaUzaklik(secenek.geometri, nokta) > SAPMA_ESIGI_M
          ) {
            sapmaSayaciRef.current += 1;
            if (
              sapmaSayaciRef.current >= 2 &&
              Date.now() - sonYenidenRotaRef.current > 15_000
            ) {
              sapmaSayaciRef.current = 0;
              void yenidenRotalaRef.current(nokta);
            }
          } else {
            sapmaSayaciRef.current = 0;
          }
        }

        /*
         * Kaba konum paylaşılmıyor. Masaüstünde ya da VPN arkasında tarayıcı
         * IP'den kilometrelerce şaşan bir tahmin veriyor; onu tabloya yazmak
         * diğer kuryeye "arkadaş şurada" diye yalan söylemek olurdu. Kendi
         * ekranında yine görünüyor, yanında hata payı çemberiyle.
         */
        const simdi = Date.now();
        if (
          kurye &&
          (dogruluk ?? Infinity) <= PAYLASILIR_DOGRULUK_M &&
          simdi - sonYazma > 15_000
        ) {
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
    // `konumTazeleme` artınca izleyici söküp yeniden kuruluyor; tarayıcı yeni
    // izleyiciye elindeki ölçümü hemen veriyor. "Yeniden bul" bunun üzerine
    // kurulu.
  }, [db, kurye, seslendir, konumTazeleme, uyar]);

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

  /* ------------------------- Liste süzme ------------------------- */
  const aramaAnahtari = arama.trim().toLocaleLowerCase("tr");

  const suzulmusAbonelikler = useMemo(() => {
    if (!aramaAnahtari) return abonelikler;
    return abonelikler.filter((a) => kayitAra(a, aramaAnahtari));
  }, [abonelikler, aramaAnahtari]);

  const suzulmusSepetler = useMemo(() => {
    if (!aramaAnahtari) return sepetler;
    return sepetler.filter((s) => kayitAra(s, aramaAnahtari));
  }, [sepetler, aramaAnahtari]);

  /* ------------------------- Navigasyon ------------------------- */
  const navSecili = useMemo(
    () => navSecenekler.find((s) => s.id === navSeciliId) ?? navSecenekler[0] ?? null,
    [navSecenekler, navSeciliId],
  );

  const navAdim = navSecili?.adimlar[navAdimIndeks] ?? null;
  const navSonraki = navSecili?.adimlar[navAdimIndeks + 1] ?? null;

  const navHedefNokta = useMemo<Nokta | null>(
    () =>
      navHedef?.adres?.lat != null
        ? { lat: navHedef.adres.lat, lng: navHedef.adres.lng! }
        : null,
    [navHedef],
  );

  /**
   * Kurye rotadan çıktı: bulunduğu yerden hedefe yeniden, en hızlı rotayı
   * iste. Sürüş modu bozulmaz; adımlar yeni rotanın başından sayılır.
   * Ağ yoksa eldeki rota kalır, bir sonraki sapmada yine denenir.
   */
  async function yenidenRotala(konum: Nokta) {
    const hedef = navRef.current.hedef;
    if (!hedef || yenidenRotalaniyorRef.current) return;
    yenidenRotalaniyorRef.current = true;
    sonYenidenRotaRef.current = Date.now();
    try {
      const yanit = await fetch("/api/navigasyon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baslangic: konum, hedef }),
      });
      if (!yanit.ok) throw new Error("navigasyon");
      const { secenekler } = (await yanit.json()) as {
        secenekler: RotaSecenegi[];
      };
      const enHizli = secenekler[0];
      if (!enHizli || navRef.current.durum !== "surus") return;
      setNavSecenekler(secenekler);
      setNavSeciliId(enHizli.id);
      navAdimRef.current = 0;
      setNavAdimIndeks(0);
      seslendirilenRef.current = { adim: -1, yakin: false };
      sapmaSayaciRef.current = 0;
      if (sesRef.current) konus("Rota yeniden hesaplandı");
    } catch {
      /* eldeki rota kalır */
    } finally {
      yenidenRotalaniyorRef.current = false;
    }
  }

  useEffect(() => {
    navRef.current = {
      durum: navDurum,
      secenek: navSecili,
      takip: navTakip,
      hedef: navHedefNokta,
    };
    yenidenRotalaRef.current = yenidenRotala;
  });

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
    // Seçim kimlikleri sekmeye özel; abonelik listesi açıkken haritadan
    // teslimat işaretlemek listeyle uyuşmayan bir seçim üretirdi.
    if (secimModu && sekme === "teslimatlar") {
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

  /**
   * Açık sekmenin listesini Excel'e indirir.
   *
   * Seçim modunda işaretli kayıtlar, değilse listenin tamamı gidiyor.
   * Dosyayı sunucu yazıyor: exceljs istemci paketini kabartmasın diye.
   */
  async function excelIndir() {
    const secili = secimModu && secilenler.length > 0;
    const suz = <T extends { id: string }>(liste: T[]) =>
      secili ? liste.filter((k) => secilenler.includes(k.id)) : liste;

    // Arama açıksa ekranda görünen liste iniyor; seçim her zaman öncelikli.
    const kayitlar =
      sekme === "teslimatlar"
        ? suz(siraliTeslimatlar)
        : sekme === "abonelikler"
          ? suz(suzulmusAbonelikler)
          : suz(suzulmusSepetler);

    if (kayitlar.length === 0) {
      uyar("İndirilecek kayıt yok.");
      return;
    }

    setIndiriliyor(true);
    try {
      const yanit = await fetch("/api/disa-aktar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tur: sekme, kayitlar }),
      });
      if (!yanit.ok) throw new Error("indir");
      const bag = URL.createObjectURL(await yanit.blob());
      const a = document.createElement("a");
      a.href = bag;
      a.download = `sultan-market-${sekme}-${bugununTarihi()}.xlsx`;
      a.click();
      URL.revokeObjectURL(bag);
      uyar(`${kayitlar.length} kayıt indirildi`);
    } catch {
      uyar("Excel dosyası indirilemedi.");
    } finally {
      setIndiriliyor(false);
    }
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
      const alindi = sonuc.odemeAlindi;
      const yama: Record<string, unknown> = {
        durum: "teslim",
        teslim_zamani: zaman,
        kurye_id: kurye?.id ?? null,
        odeme_alindi: alindi,
        odeme_alinmayan_kisi: alindi ? null : sonuc.alinmayanKisi,
        odeme_notu: alindi ? null : sonuc.not || null,
      };
      if (alindi) yama.odeme_yontemi = sonuc.tahsilat.yontem;

      await siparisGuncelle(id, yama, (s) => ({
        ...s,
        durum: "teslim",
        teslim_zamani: zaman,
        odeme_alindi: alindi,
        odeme_alinmayan_kisi: alindi ? null : sonuc.alinmayanKisi,
        odeme_notu: alindi ? null : sonuc.not || null,
        odeme_yontemi: alindi ? sonuc.tahsilat.yontem : s.odeme_yontemi,
      }));

      // Kasa yalnızca gerçekten para alındığında hareket eder.
      if (alindi && sonuc.tahsilat.tutar > 0 && kurye) {
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

      uyar(
        alindi
          ? "Teslimat tamamlandı 🎉"
          : "Teslim edildi — ödeme alınamadı olarak kaydedildi",
      );
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

  /**
   * Haritaya dokunulan noktayı adrese yazar. `konumDuzeltme` adres kimliği
   * tutuyor: aynı adres teslimatta da abonelikte de sepette de geçebiliyor,
   * üçünü birden tazeliyoruz.
   */
  async function konumuKaydet(nokta: Nokta) {
    const adresId = konumDuzeltme;
    if (!adresId) return;

    const { error } = await db
      .from("adresler")
      .update({ lat: nokta.lat, lng: nokta.lng, konum_dogrulandi: true })
      .eq("id", adresId);

    if (error) {
      uyar("Konum kaydedilemedi.");
      return;
    }

    const yeniAdres = <T extends { adres: Adres | null }>(kayit: T): T =>
      kayit.adres?.id === adresId
        ? {
            ...kayit,
            adres: {
              ...kayit.adres,
              lat: nokta.lat,
              lng: nokta.lng,
              konum_dogrulandi: true,
            },
          }
        : kayit;

    setTeslimatlar((o) => o.map(yeniAdres));
    setAbonelikler((o) => o.map(yeniAdres));
    setSepetler((o) => o.map(yeniAdres));
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

  /* ---------------- Ödeme yöntemleri ---------------- */

  async function yontemEkle(ad: string) {
    try {
      const yeni = await odemeYontemiEkle(db, ad);
      setYontemler((o) =>
        o.some((y) => y.kod === yeni.kod)
          ? o.map((y) => (y.kod === yeni.kod ? yeni : y))
          : [...o, yeni],
      );
    } catch {
      uyar("Ödeme yöntemi eklenemedi");
    }
  }

  async function yontemKaldir(kod: string) {
    try {
      await odemeYontemiKaldir(db, kod);
      setYontemler((o) => o.filter((y) => y.kod !== kod));
    } catch {
      uyar("Ödeme yöntemi kaldırılamadı");
    }
  }

  /* ---------------- Yeni kayıt ---------------- */

  /** Listeye ekler ya da aynı id varsa yerine yazar. */
  function birlestir<T extends { id: string }>(liste: T[], kayit: T): T[] {
    return liste.some((x) => x.id === kayit.id)
      ? liste.map((x) => (x.id === kayit.id ? kayit : x))
      : [kayit, ...liste];
  }

  function kayitEklendi(kayit: EklenenKayit, mesaj: string) {
    if (kayit.tur === "teslimat") {
      setTeslimatlar((o) => birlestir(o, kayit.siparis));
      setSekme("teslimatlar");
    } else if (kayit.tur === "abonelik") {
      setAbonelikler((o) => birlestir(o, kayit.abonelik));
      setSekme("abonelikler");
    } else {
      setSepetler((o) => birlestir(o, kayit.sepet));
      setSekme("sepetler");
    }
    setKayitEkle(false);
    setDuzenlenen(null);
    setPanel("yari");
    uyar(mesaj);
  }

  /** Satır menüsündeki kaydın müşteri adı ve adresi. */
  function kayitBilgisi(kayit: EklenenKayit) {
    const ortak =
      kayit.tur === "teslimat"
        ? kayit.siparis
        : kayit.tur === "abonelik"
          ? kayit.abonelik
          : kayit.sepet;
    return {
      ad: ortak.musteri?.ad ?? "Müşteri",
      adresId: ortak.adres?.id ?? null,
      konumVar: ortak.adres?.lat != null,
      teslimEdildi: kayit.tur === "teslimat" && kayit.siparis.durum === "teslim",
    };
  }

  async function kayitSil(kayit: EklenenKayit) {
    setIslemde(true);
    try {
      if (kayit.tur === "teslimat") {
        await siparisSil(db, kayit.siparis.id);
        setTeslimatlar((o) => o.filter((x) => x.id !== kayit.siparis.id));
      } else if (kayit.tur === "abonelik") {
        await abonelikSil(db, kayit.abonelik.id);
        setAbonelikler((o) => o.filter((x) => x.id !== kayit.abonelik.id));
      } else {
        await sepetSil(db, kayit.sepet.id);
        setSepetler((o) => o.filter((x) => x.id !== kayit.sepet.id));
      }
      setIslemKayit(null);
      setSilOnay(false);
      setBalonSecim(null);
      if (seciliId) setSeciliId(null);
      uyar("Kayıt silindi");
    } catch {
      uyar(
        kayit.tur === "teslimat"
          ? "Teslim edilmiş sipariş silinemez — tahsilat kaydı ona bağlı."
          : "Silinemedi",
      );
    } finally {
      setIslemde(false);
    }
  }

  /* ---------------- Haritadan hızlı işlemler ---------------- */

  /**
   * Uzun basışla teslim işaretleme. Pin yeşile dönüyor ve öyle kalıyor;
   * aynı pine tekrar uzun basılırsa eski durumuna (kırmızı) dönüyor.
   */
  async function teslimIsaretle(siparis: Siparis) {
    const oncekiDurum = siparis.durum;
    const zaman = new Date().toISOString();

    setSonTeslimler((o) => ({ ...o, [siparis.id]: oncekiDurum }));
    // Teslim edilenler katmanı kapalıysa yeşile dönen pin gözden kaybolur;
    // tekrar basıp geri alabilmek için katmanı açıyoruz.
    setKatmanlar((k) =>
      k.teslimEdilenler ? k : { ...k, teslimEdilenler: true },
    );

    await siparisGuncelle(
      siparis.id,
      { durum: "teslim", teslim_zamani: zaman, kurye_id: kurye?.id ?? null },
      (s) => ({ ...s, durum: "teslim", teslim_zamani: zaman }),
    );
    setBalonSecim(null);

    uyar("Teslim edildi", {
      etiket: "Geri al",
      calistir: () => void teslimGeriAl(siparis.id),
    });
  }

  /** Teslim işaretini geri alır: pin eski rengine döner. */
  async function teslimGeriAl(id: string) {
    const durum = sonTeslimler[id] ?? "bekliyor";
    setSonTeslimler((o) => {
      const kalan = { ...o };
      delete kalan[id];
      return kalan;
    });
    setBalonSecim(null);
    await siparisGuncelle(
      id,
      { durum, teslim_zamani: null },
      (s) => ({ ...s, durum, teslim_zamani: null }),
    );
    uyar("Teslim işareti kaldırıldı");
  }

  function uzunBasis(
    tur: "teslimat" | "abonelik" | "sepet",
    id: string,
  ) {
    if (tur === "sepet") {
      const sp = sepetler.find((x) => x.id === id);
      return haritaPini(
        "sepet",
        id,
        sp?.adres?.lat != null
          ? { lat: sp.adres.lat, lng: sp.adres.lng! }
          : null,
      );
    }

    const siparis =
      tur === "teslimat"
        ? teslimatlar.find((x) => x.id === id)
        : (() => {
            const a = abonelikler.find((x) => x.id === id);
            if (!a) return undefined;
            const bugun = bugununTarihi();
            return (
              teslimatlar.find(
                (x) => x.abonelik_id === a.id && x.planlanan_tarih === bugun,
              ) ??
              teslimatlar.find(
                (x) => x.adres_id === a.adres_id && x.planlanan_tarih === bugun,
              )
            );
          })();

    if (!siparis) return uyar("Bugün için teslimat yok");
    // Yeşile dönmüş pine tekrar uzun basmak işareti kaldırıyor.
    if (siparis.durum === "teslim") return void teslimGeriAl(siparis.id);
    void teslimIsaretle(siparis);
  }

  /** Sepeti güne ait teslimata çevirir — sepetin tek çıkış kapısı. */
  async function sepetiCevir(sepet: Sepet) {
    setIslemde(true);
    try {
      const siparis = await sepetiSiparise(db, sepet);
      setSepetler((o) => o.filter((x) => x.id !== sepet.id));
      setTeslimatlar((o) => [siparis, ...o]);
      setBalonSecim(null);
      setIslemKayit(null);
      setSekme("teslimatlar");
      uyar(`${sepet.musteri?.ad ?? "Sepet"} teslimata çevrildi`);
    } catch {
      uyar("Sepet çevrilemedi");
    } finally {
      setIslemde(false);
    }
  }

  async function cikis() {
    await db.auth.signOut();
    yonlendir.replace("/giris");
    yonlendir.refresh();
  }

  /* ------------------------- Harita balonu ------------------------- */

  const balonKayit: BalonKayit | null = useMemo(() => {
    if (!balonSecim) return null;
    if (balonSecim.tur === "teslimat") {
      const s = teslimatlar.find((x) => x.id === balonSecim.id);
      return s ? { tur: "teslimat", siparis: s } : null;
    }
    if (balonSecim.tur === "abonelik") {
      const a = abonelikler.find((x) => x.id === balonSecim.id);
      if (!a) return null;
      // Abonelikten bugün üretilmiş sipariş varsa ödeme bilgisi ondan geliyor.
      // Bağ kurulmamışsa (elle açılmış sipariş) aynı adresteki bugünkü
      // teslimata düşüyoruz.
      const bugun = bugununTarihi();
      const bugunku =
        teslimatlar.find(
          (s) => s.abonelik_id === a.id && s.planlanan_tarih === bugun,
        ) ??
        teslimatlar.find(
          (s) => s.adres_id === a.adres_id && s.planlanan_tarih === bugun,
        ) ??
        null;
      return { tur: "abonelik", abonelik: a, bugunku };
    }
    const sp = sepetler.find((x) => x.id === balonSecim.id);
    return sp ? { tur: "sepet", sepet: sp } : null;
  }, [balonSecim, teslimatlar, abonelikler, sepetler]);

  const balonNoktasi = useMemo(() => {
    if (!balonKayit) return null;
    const adres =
      balonKayit.tur === "teslimat"
        ? balonKayit.siparis.adres
        : balonKayit.tur === "abonelik"
          ? balonKayit.abonelik.adres
          : balonKayit.sepet.adres;
    if (adres?.lat == null || adres.lng == null) return null;
    return { lat: adres.lat, lng: adres.lng };
  }, [balonKayit]);

  /** Haritadaki bir pine dokunuldu: balonu aç, paneli kapat, oraya uç. */
  function haritaPini(
    tur: "teslimat" | "abonelik" | "sepet",
    id: string,
    nokta: Nokta | null,
  ) {
    if (secimModu && tur === "teslimat") return secimDegistir(id);
    setBalonSecim({ tur, id });
    if (tur === "teslimat") setSeciliId(id);
    setPanel("kapali");
    if (nokta) haritaApi.current?.ucur(nokta);
  }

  /* ------------------------- Görünüm ------------------------- */
  const toplamTahsilat = aktifTeslimatlar.reduce((t, s) => t + s.tutar, 0);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-yuzey2">
      <Harita
        ref={haritaApi}
        teslimatlar={teslimatlar}
        abonelikler={bugunAbonelikler}
        sepetler={sepetler}
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
        onSecim={(id) => {
          const s = teslimatlar.find((x) => x.id === id);
          haritaPini(
            "teslimat",
            id,
            s?.adres?.lat != null
              ? { lat: s.adres.lat, lng: s.adres.lng! }
              : null,
          );
        }}
        onAbonelikSecim={(id) => {
          const a = abonelikler.find((x) => x.id === id);
          haritaPini(
            "abonelik",
            id,
            a?.adres?.lat != null
              ? { lat: a.adres.lat, lng: a.adres.lng! }
              : null,
          );
        }}
        onSepetSecim={(id) => {
          const sp = sepetler.find((x) => x.id === id);
          haritaPini(
            "sepet",
            id,
            sp?.adres?.lat != null
              ? { lat: sp.adres.lat, lng: sp.adres.lng! }
              : null,
          );
        }}
        onUzunBasis={uzunBasis}
        balon={
          balonKayit && balonNoktasi
            ? {
                ...balonNoktasi,
                icerik: (
                  <HaritaBalonu
                    kayit={balonKayit}
                    yontemler={yontemler}
                    islemde={islemde}
                    onKapat={() => setBalonSecim(null)}
                    onOdemeAl={(siparis) => {
                      setSeciliId(siparis.id);
                      setBalonSecim(null);
                      setTeslimBaslangic("alindi");
                      setTeslimModu("teslim");
                    }}
                    onOdemeAlinmadi={(siparis) => {
                      setSeciliId(siparis.id);
                      setBalonSecim(null);
                      setTeslimBaslangic("alinmadi");
                      setTeslimModu("teslim");
                    }}
                    onSiparise={(sepet) => void sepetiCevir(sepet)}
                    onSil={() => {
                      const kayit: EklenenKayit =
                        balonKayit.tur === "teslimat"
                          ? { tur: "teslimat", siparis: balonKayit.siparis }
                          : balonKayit.tur === "abonelik"
                            ? { tur: "abonelik", abonelik: balonKayit.abonelik }
                            : { tur: "sepet", sepet: balonKayit.sepet };
                      void kayitSil(kayit);
                    }}
                    onDetay={() => {
                      if (balonKayit.tur === "teslimat")
                        setSeciliId(balonKayit.siparis.id);
                      setSekme(
                        balonKayit.tur === "teslimat"
                          ? "teslimatlar"
                          : balonKayit.tur === "abonelik"
                            ? "abonelikler"
                            : "sepetler",
                      );
                      setBalonSecim(null);
                      setPanel("yari");
                    }}
                  />
                ),
              }
            : null
        }
        onSecenekSec={setNavSeciliId}
        onKullaniciHareketi={() => {
          if (navRef.current.durum === "surus") setNavTakip(false);
          setKonumTakibi(false);
        }}
        onHaritaTikla={(nokta) => {
          if (konumDuzeltme) return void konumuKaydet(nokta);
          if (kendiKonumSec) {
            // Elle konulan noktanın hata payı yok: kurye nerede olduğunu
            // tarayıcıdan iyi biliyor.
            setKuryeKonumu(nokta);
            setKuryeDogrulugu(null);
            elleAyarliRef.current = true;
            setElleAyarli(true);
            setKendiKonumSec(false);
            setKonumTakibi(true);
            haritaApi.current?.ucur(nokta, 16);
            uyar("Konumunuz işaretlendi");
            return;
          }
          setBalonSecim(null);
        }}
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
          // Konuma uçmak yetmiyor: şaşmış bir ölçümün üstüne uçmak kuryeyi
          // yine yanlış yere götürür. Düğme ölçümü de tazeliyor.
          if (kuryeKonumu) {
            haritaApi.current?.ucur(kuryeKonumu, 17);
            setKonumTakibi(true);
          }
          konumuYenidenBul();
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

      {/* Satır işlemleri: düzenle · konumu düzelt · sil */}
      <AnimatePresence>
        {islemKayit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setIslemKayit(null);
              setSilOnay(false);
            }}
            className="absolute inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
            >
              <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

              <p className="text-[11px] font-black uppercase tracking-wider text-gri">
                {islemKayit.tur === "teslimat"
                  ? "Teslimat"
                  : islemKayit.tur === "abonelik"
                    ? "Abonelik"
                    : "Sepet"}
              </p>
              <h2 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
                {kayitBilgisi(islemKayit).ad}
              </h2>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setDuzenlenen(islemKayit);
                  setIslemKayit(null);
                  setKayitEkle(true);
                }}
                className="mt-3 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2"
              >
                <span className="text-xl leading-none">✏️</span>
                <span className="flex-1 text-[15px] font-black">Düzenle</span>
                <span className="text-gri">›</span>
              </motion.button>

              {islemKayit.tur === "sepet" && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  disabled={islemde || !islemKayit.sepet.adres_id}
                  onClick={() => void sepetiCevir(islemKayit.sepet)}
                  className="mt-2 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2 disabled:opacity-50"
                >
                  <span className="text-xl leading-none">📦</span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-black">
                      Siparişe çevir
                    </span>
                    <span className="block text-[12px] text-gri">
                      Sepet kapanır, bugünün teslimatı olarak listeye düşer
                    </span>
                  </span>
                  <span className="text-gri">›</span>
                </motion.button>
              )}

              {kayitBilgisi(islemKayit).adresId && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setKonumDuzeltme(kayitBilgisi(islemKayit).adresId);
                    setIslemKayit(null);
                    setPanel("kapali");
                  }}
                  className="mt-2 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2"
                >
                  <span className="text-xl leading-none">📍</span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-black">
                      Konumu düzelt
                    </span>
                    <span className="block text-[12px] text-gri">
                      {kayitBilgisi(islemKayit).konumVar
                        ? "Haritada doğru noktaya taşı"
                        : "Bu adresin konumu yok — haritada işaretle"}
                    </span>
                  </span>
                  <span className="text-gri">›</span>
                </motion.button>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {silOnay ? (
                  <motion.div
                    key="onay"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-2 rounded-[20px] border border-kirmizi bg-kirmizi-sis p-3.5"
                  >
                    <p className="text-[14px] font-bold text-kirmizi-koyu">
                      Bu kayıt kalıcı olarak silinecek. Emin misin?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setSilOnay(false)}
                        className="flex-1 rounded-hap bg-yuzey py-3 text-[14px] font-bold text-gri"
                      >
                        Vazgeç
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        disabled={islemde}
                        onClick={() => void kayitSil(islemKayit)}
                        className="flex-[2] rounded-hap bg-kirmizi py-3 text-[14px] font-black text-white disabled:opacity-60"
                      >
                        {islemde ? "Siliniyor…" : "Evet, sil"}
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="sil"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSilOnay(true)}
                    disabled={kayitBilgisi(islemKayit).teslimEdildi}
                    className="mt-2 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2 disabled:opacity-50"
                  >
                    <span className="text-xl leading-none">🗑️</span>
                    <span className="flex-1">
                      <span className="block text-[15px] font-black text-kirmizi">
                        Sil
                      </span>
                      {kayitBilgisi(islemKayit).teslimEdildi && (
                        <span className="block text-[12px] text-gri">
                          Teslim edilmiş sipariş silinemez
                        </span>
                      )}
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>

              <button
                onClick={() => {
                  setIslemKayit(null);
                  setSilOnay(false);
                }}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-hap text-[14px] font-bold text-gri"
              >
                Kapat
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Yeni kayıt / toplu yükleme seçimi */}
      <AnimatePresence>
        {ekleMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEkleMenu(false)}
            className="absolute inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
            >
              <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />
              <h2 className="text-xl font-extrabold tracking-tight">Ekle</h2>

              {[
                {
                  simge: "👤",
                  baslik: "Yeni kayıt",
                  alt: "Müşteri, adres ve teslimat / abonelik / sepet",
                  tikla: () => {
                    setEkleMenu(false);
                    setKayitEkle(true);
                  },
                },
                {
                  simge: "📄",
                  baslik: "Excel'den toplu yükle",
                  alt: "Müşteri ve adresleri tek dosyada aktar",
                  tikla: () => {
                    setEkleMenu(false);
                    setTopluYukleme(true);
                  },
                },
                {
                  simge: "📍",
                  baslik: "Adresleri haritaya oturt",
                  alt: "Defterdeki tarifleri yapay zekâyla konuma çevir",
                  tikla: () => {
                    setEkleMenu(false);
                    setKonumTamamla(true);
                  },
                },
              ].map((s2, i) => (
                <motion.button
                  key={s2.baslik}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i + 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={s2.tikla}
                  className="mt-3 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2"
                >
                  <span className="text-2xl leading-none">{s2.simge}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-black">
                      {s2.baslik}
                    </span>
                    <span className="block text-[12px] text-gri">{s2.alt}</span>
                  </span>
                  <span className="text-gri">›</span>
                </motion.button>
              ))}

              <button
                onClick={() => setEkleMenu(false)}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-hap text-[14px] font-bold text-gri"
              >
                Vazgeç
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {kayitEkle && (
          <KayitEkle
            key="kayit-ekle"
            db={db}
            yontemler={yontemler}
            kuryeKonumu={kuryeKonumu}
            duzenlenen={duzenlenen}
            onKapat={() => {
              setKayitEkle(false);
              setDuzenlenen(null);
            }}
            onEklendi={kayitEklendi}
          />
        )}
        {konumTamamla && (
          <KonumTamamla
            key="konum-tamamla"
            db={db}
            onKapat={() => setKonumTamamla(false)}
            onBitti={(oturan) => {
              if (oturan > 0) {
                uyar(`${oturan} adres haritaya oturdu`);
                void listeleriTazele();
              }
            }}
          />
        )}
        {topluYukleme && (
          <TopluYukleme
            key="toplu-yukleme"
            db={db}
            onKapat={() => setTopluYukleme(false)}
            onBitti={(eklenen, abonelik) => {
              uyar(
                eklenen > 0
                  ? `${eklenen} müşteri${abonelik > 0 ? `, ${abonelik} abonelik` : ""} eklendi`
                  : "Hiçbir satır eklenemedi",
              );
              if (eklenen > 0) {
                void listeleriTazele();
                void teslimatlariTazele();
              }
            }}
          />
        )}
      </AnimatePresence>

      {/*
        Konum güvenilmez uyarısı.

        Tarayıcı konumu telefonda GPS'ten, masaüstünde Wi-Fi/IP tahmininden
        veriyor; ikincisi kilometrelerce şaşabiliyor ve kurye haritada kendini
        bambaşka bir yerde görüyor. Hata payını yazmak şikâyeti sebebine
        bağlıyor; haritada da aynı payın çemberi duruyor.
      */}
      <AnimatePresence>
        {!konumDuzeltme &&
          !kendiKonumSec &&
          kuryeKonumu &&
          kuryeDogrulugu != null &&
          kuryeDogrulugu > SUPHELI_DOGRULUK_M && (
            <motion.div
              key="dogruluk-uyarisi"
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+80px)] z-30 flex items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey/90 p-3 shadow-yumusak backdrop-blur-2xl"
            >
              <span className="text-lg">📡</span>
              <p className="flex-1 text-[12px] font-bold leading-snug">
                Konumunuz ±
                {kuryeDogrulugu >= 1000
                  ? `${(kuryeDogrulugu / 1000).toFixed(1)} km`
                  : `${Math.round(kuryeDogrulugu)} m`}{" "}
                hata payıyla bulundu.
                <span className="block font-semibold text-gri">
                  Telefondan açınca GPS devreye girer.
                </span>
              </p>
              <button
                onClick={konumuYenidenBul}
                className="shrink-0 rounded-hap bg-yuzey2 px-3 py-1.5 text-[12px] font-black text-gri"
              >
                Yenile
              </button>
              <button
                onClick={() => setKendiKonumSec(true)}
                className="shrink-0 rounded-hap bg-kontrast px-3 py-1.5 text-[12px] font-black text-white"
              >
                Düzelt
              </button>
            </motion.div>
          )}

        {/* Kurye kendi konumunu haritada işaretliyor. */}
        {kendiKonumSec && (
          <motion.div
            key="kendi-konum"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+80px)] z-30 flex items-center gap-3 rounded-[20px] bg-kontrast p-3 text-white shadow-yumusak"
          >
            <span className="text-lg">🧍</span>
            <p className="flex-1 text-[13px] font-bold">
              Bulunduğunuz yeri haritada işaretleyin.
            </p>
            <button
              onClick={() => setKendiKonumSec(false)}
              className="rounded-hap bg-yuzey/20 px-3 py-1.5 text-[12px] font-black"
            >
              Vazgeç
            </button>
          </motion.div>
        )}

        {/* Elle işaretli konum — otomatiğe dönüş elinizin altında. */}
        {elleAyarli && !kendiKonumSec && !konumDuzeltme && (
          <motion.div
            key="elle-konum"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+80px)] z-30 flex items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey/90 p-3 shadow-yumusak backdrop-blur-2xl"
          >
            <span className="text-lg">🧍</span>
            <p className="flex-1 text-[12px] font-bold leading-snug">
              Konumunuz elle işaretli.
              <span className="block font-semibold text-gri">
                GPS iyi sinyal bulunca kendiliğinden devralır.
              </span>
            </p>
            {/* Elle işaretledikten sonra da yeniden ölçtürebilmeli. */}
            <button
              onClick={konumuYenidenBul}
              className="shrink-0 rounded-hap bg-yuzey2 px-3 py-1.5 text-[12px] font-black text-gri"
            >
              Yenile
            </button>
            <button
              onClick={() => setKendiKonumSec(true)}
              className="shrink-0 rounded-hap bg-yuzey2 px-3 py-1.5 text-[12px] font-black text-gri"
            >
              Değiştir
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
              {secilenler.length}{" "}
              {sekme === "teslimatlar" ? "durak" : "kayıt"} seçildi
            </p>
            <button
              onClick={() => {
                setSecimModu(false);
                setSecilenler([]);
              }}
              className="rounded-hap bg-yuzey/10 px-3 py-2.5 text-[12px] font-bold"
            >
              Vazgeç
            </button>
            <button
              onClick={() => void excelIndir()}
              disabled={indiriliyor || secilenler.length === 0}
              className="rounded-hap bg-yuzey/10 px-3 py-2.5 text-[12px] font-black disabled:opacity-50"
            >
              {indiriliyor ? "…" : "Excel"}
            </button>
            {sekme === "teslimatlar" && (
              <button
                onClick={rotayiOlustur}
                disabled={rotaHesapla || secilenler.length < 2}
                className="rounded-hap bg-kirmizi px-3.5 py-2.5 text-[12px] font-black disabled:opacity-50"
              >
                {rotaHesapla ? "Hesaplanıyor…" : "En kısa yol"}
              </button>
            )}
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
            className={`absolute inset-x-0 bottom-32 z-50 mx-auto flex w-fit items-center gap-3 rounded-hap bg-kontrast py-2.5 pl-4 text-[13px] font-bold text-white shadow-yuzen ${
              bildirim.eylem ? "pr-2" : "pointer-events-none pr-4"
            }`}
          >
            <span>{bildirim.mesaj}</span>
            {bildirim.eylem && (
              <button
                onClick={() => {
                  bildirim.eylem?.calistir();
                  setBildirim(null);
                }}
                className="rounded-hap bg-yuzey/15 px-3 py-1.5 text-[12px] font-black"
              >
                {bildirim.eylem.etiket}
              </button>
            )}
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
            yontemler={yontemler}
            baslangicOdeme={teslimBaslangic}
            onYontemEkle={yontemEkle}
            onYontemKaldir={yontemKaldir}
            onKapat={() => setTeslimModu(null)}
            onOnay={teslimSonucuUygula}
          />
        )}
        {vardiyaOzeti && vardiya && (
          <VardiyaOzeti
            key="vardiya-ozeti"
            vardiya={vardiya}
            tahsilatlar={tahsilatlar}
            yontemler={yontemler}
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
                    // Seçim kimlikleri sekmeye özel; karışmasın diye sıfırlanıyor.
                    setSecilenler([]);
                    setArama("");
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
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                setEkleMenu(true);
              }}
              aria-label="Yeni kayıt ekle"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kirmizi text-[20px] font-black leading-none text-white shadow-yumusak"
            >
              +
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                void excelIndir();
              }}
              disabled={indiriliyor}
              aria-label="Excel'e indir"
              title="Excel'e indir"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[15px] font-black text-gri disabled:opacity-50"
            >
              {indiriliyor ? "…" : "⤓"}
            </motion.button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSecimModu((o) => !o);
                setSecilenler([]);
                setSeciliId(null);
                setPanel("yari");
              }}
              className={`shrink-0 rounded-hap px-3 py-2 text-[12px] font-black transition-colors ${
                secimModu
                  ? "bg-kirmizi text-white"
                  : "bg-kirmizi-sis text-kirmizi-koyu"
              }`}
            >
              {/* Dar ekranda tek kelime; sekme şeridine yer kalsın. */}
              <span className="hidden xs:inline">Toplu seç</span>
              <span className="xs:hidden">Seç</span>
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
                setKonumDuzeltme(secili.adres?.id ?? null);
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
                      onIslemler={() =>
                        setIslemKayit({ tur: "teslimat", siparis: s })
                      }
                    />
                  ))}
                  {siraliTeslimatlar.length === 0 && (
                    <Bos mesaj="Bugün için teslimat yok." />
                  )}
                </>
              )}

              {sekme === "abonelikler" && (
                <>
                  <ListeArama
                    deger={arama}
                    yerTutucu="Ad, telefon ya da adres"
                    sonuc={suzulmusAbonelikler.length}
                    toplam={abonelikler.length}
                    onDegis={setArama}
                  />
                  {suzulmusAbonelikler.slice(0, AZAMI_SATIR).map((a) => (
                    <AbonelikSatiri
                      key={a.id}
                      abonelik={a}
                      bugun={bugunAbonelikler.some((b) => b.id === a.id)}
                      secimModu={secimModu}
                      isaretli={secilenler.includes(a.id)}
                      onTikla={() => {
                        if (secimModu) return secimDegistir(a.id);
                        if (a.adres?.lat != null) {
                          haritaApi.current?.ucur({
                            lat: a.adres.lat,
                            lng: a.adres.lng!,
                          });
                          setPanel("kapali");
                        }
                      }}
                      onIslemler={() =>
                        setIslemKayit({ tur: "abonelik", abonelik: a })
                      }
                    />
                  ))}
                  {suzulmusAbonelikler.length > AZAMI_SATIR && (
                    <p className="px-1 pt-1 text-[12px] font-semibold text-gri">
                      İlk {AZAMI_SATIR} kayıt gösteriliyor. Aradığını bulmak
                      için yukarıdaki kutuya yaz.
                    </p>
                  )}
                  {abonelikler.length === 0 && (
                    <Bos mesaj="Aktif abonelik yok." />
                  )}
                  {abonelikler.length > 0 && suzulmusAbonelikler.length === 0 && (
                    <Bos mesaj="Aramaya uyan abonelik yok." />
                  )}
                </>
              )}

              {sekme === "sepetler" && (
                <>
                  {sepetler.length > 20 && (
                    <ListeArama
                      deger={arama}
                      yerTutucu="Ad, telefon ya da adres"
                      sonuc={suzulmusSepetler.length}
                      toplam={sepetler.length}
                      onDegis={setArama}
                    />
                  )}
                  {suzulmusSepetler.slice(0, AZAMI_SATIR).map((s) => (
                    <SepetSatiri
                      key={s.id}
                      sepet={s}
                      secimModu={secimModu}
                      isaretli={secilenler.includes(s.id)}
                      onTikla={() => {
                        if (secimModu) return secimDegistir(s.id);
                        if (s.adres?.lat != null) {
                          haritaApi.current?.ucur({
                            lat: s.adres.lat,
                            lng: s.adres.lng!,
                          });
                          setPanel("kapali");
                        }
                      }}
                      onIslemler={() =>
                        setIslemKayit({ tur: "sepet", sepet: s })
                      }
                    />
                  ))}
                  {suzulmusSepetler.length > AZAMI_SATIR && (
                    <p className="px-1 pt-1 text-[12px] font-semibold text-gri">
                      İlk {AZAMI_SATIR} kayıt gösteriliyor.
                    </p>
                  )}
                  {sepetler.length === 0 && <Bos mesaj="Açık sepet yok." />}
                  {sepetler.length > 0 && suzulmusSepetler.length === 0 && (
                    <Bos mesaj="Aramaya uyan sepet yok." />
                  )}
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
