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
import AbonelikDetay from "./AbonelikDetay";
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
import AdresBulucu, { BinaSimgesi } from "./AdresBulucu";
import { AbonelikSatiri, ListeArama, TeslimatSatiri } from "./Listeler";
import { SultanAmblem } from "./SultanLogo";
import { ModGecisDugmesi } from "./ModGecisi";
import YonetimMenusu from "./YonetimMenusu";

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
  odemeYontemiKaldir,
  siparisSil,
  acikVardiyaGetir,
  kuryeKonumlariGetir,
  vardiyaTahsilatlari,
  siteEkle,
  siteSil,
  sitelerGetir,
  siparisleriGetir,
  gunSiparisleriGetir,
  topluSil,
} from "@/lib/veri";
import {
  sakaryadaMi,
  siteAdresMetni,
  type GoogleDogrulama,
  type SiteAdayi,
} from "@/lib/site";
import {
  binaAnahtari,
  bugununTarihi,
  gecikmeDk,
  odemeAdi,
  para,
  paraAlinirMi,
} from "@/lib/bicim";
import { waAc } from "@/lib/whatsapp";
import { bekleyenler, kuyruguIsle, kuyrukVeyaGonder } from "@/lib/cevrimdisi";
import { teslimFotosuBagla, teslimFotosuYukle } from "@/lib/foto";
import { kaydirmaSesi } from "@/lib/jingle";
import type {
  Abonelik,
  KayitliSite,
  Kurye,
  KuryeKonumu,
  Nokta,
  RotaSonucu,
  Adres,
  OdemeYontemiTanimi,
  Siparis,
  SiparisDurumu,
  Tahsilat,
  Vardiya,
} from "@/lib/tipler";

type Sekme = "teslimatlar" | "abonelikler";

const SEKMELER: { anahtar: Sekme; ad: string }[] = [
  { anahtar: "teslimatlar", ad: "Teslimatlar" },
  { anahtar: "abonelikler", ad: "Abonelikler" },
];

const AKTIF_DURUMLAR: SiparisDurumu[] = ["bekliyor", "hazirlaniyor", "yolda"];

/** Teslimatlar listesinin durum süzgeci. */
type DurumSuzgeci = "acik" | "teslim" | "basarisiz" | "tumu";

const DURUM_SUZGECLERI: { anahtar: DurumSuzgeci; ad: string }[] = [
  { anahtar: "acik", ad: "Açık" },
  { anahtar: "teslim", ad: "Teslim" },
  { anahtar: "basarisiz", ad: "Edilemedi" },
  { anahtar: "tumu", ad: "Tümü" },
];

function suzgeceUyar(s: Siparis, suzgec: DurumSuzgeci): boolean {
  if (suzgec === "tumu") return true;
  if (suzgec === "teslim") return s.durum === "teslim";
  if (suzgec === "basarisiz") return s.durum === "basarisiz";
  return s.durum !== "teslim";
}

/** "2026-11-07" → "7 Kas Cuma"; bugünse "Bugün". */
function gunEtiketi(tarih: string | null): string {
  if (!tarih) return "Bugün";
  const g = new Date(`${tarih}T12:00:00`);
  return g.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

/** Uzun basma ipucu kaç kez gösterildi; -1: kurye uzun basmayı kullandı. */
const IPUCU_ANAHTARI = "sultan-uzun-bas-ipucu";

/** Vardiyada GPS'ten ölçülen yol — vardiya kimliğine göre saklanır. */
const YOL_ANAHTARI = "sultan-yol-";

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
 * Bu paydan iyi ölçüm gerçek GPS sayılıyor; adrese sabitlenmiş konumu
 * yalnızca böylesi devralabiliyor. Masaüstünün IP tahmini bu eşiğin
 * kilometrelerce uzağında kalıyor, adresi ezemiyor.
 */
const IYI_DOGRULUK_M = 100;

/**
 * Elindeki ölçüm bu kadar eskiyince yenisi ne olursa olsun kabul ediliyor.
 *
 * Kurye yol alıyor: bir dakika önceki nokta, payı iyi olsa bile artık
 * bulunduğu yer değil.
 */
const OLCUM_TAZELIK_MS = 60_000;

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
function tercihOku(): {
  karanlik?: boolean;
  ses?: boolean;
  zoomKilitli?: boolean;
} {
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
  /** Listede gösterilecek aktif ödeme yöntemleri. */
  baslangicYontemler: OdemeYontemiTanimi[];
  /** Adres bulucuda onaylanıp haritaya eklenmiş siteler. */
  baslangicSiteler?: KayitliSite[];
  /** Bakkal defteri ekibinden mi? Öyleyse deftere dönüş düğmesi görünür. */
  defterErisimi?: boolean;
};

/**
 * Adres bulucu açıkken haritanın uçacağı noktayı panelin/kartın altında
 * kalmayacak şekilde kaydırır. Masaüstünde panel solda 400 px; telefonda
 * aday kartı alttan açılıyor, nokta ekranın üst kısmına gelmeli.
 */
function bulucuOfseti(kart: boolean): [number, number] {
  if (typeof window === "undefined") return [0, 0];
  if (window.innerWidth >= 640) return [200, 0];
  return kart ? [0, -Math.round(window.innerHeight * 0.28)] : [0, 0];
}

export default function KuryeUygulamasi({
  kurye,
  baslangicTeslimatlar,
  baslangicAbonelikler,
  baslangicYontemler,
  baslangicSiteler = [],
  defterErisimi = false,
}: Props) {
  const yonlendir = useRouter();
  const db = useMemo(() => tarayiciIstemcisi(), []);
  const haritaApi = useRef<HaritaApi>(null);

  const [teslimatlar, setTeslimatlar] = useState(baslangicTeslimatlar);
  const [abonelikler, setAbonelikler] = useState(baslangicAbonelikler);
  const [yontemler, setYontemler] = useState(baslangicYontemler);
  const [siteler, setSiteler] = useState(baslangicSiteler);

  /* Adres bulucu */
  const [bulucuAcik, setBulucuAcik] = useState(false);
  const [siteOnizleme, setSiteOnizleme] = useState<SiteAdayi | null>(null);
  const [seciliSiteId, setSeciliSiteId] = useState<string | null>(null);
  const [haritadanSecim, setHaritadanSecim] = useState(false);
  /** Bulucudan "Buraya kayıt aç" — yeni kaydın adres adımı bununla dolar. */
  const [kayitAdresi, setKayitAdresi] = useState<{
    adres_metni: string;
    bina: string;
    lat: number;
    lng: number;
    etiket: string;
  } | null>(null);

  const [yonetimAcik, setYonetimAcik] = useState(false);
  /** Seçim modu rota için mi (En kısa yol) yoksa yönetim için mi (sil/Excel). */
  const [secimTuru, setSecimTuru] = useState<"rota" | "yonetim">("rota");
  /** Teslimatlar listesinde gösterilen geçmiş gün; null bugün. */
  const [gecmisGun, setGecmisGun] = useState<string | null>(null);
  const gecmisGunRef = useRef<string | null>(null);
  const [gecmisTeslimatlar, setGecmisTeslimatlar] = useState<Siparis[]>([]);
  const [gecmisYukleniyor, setGecmisYukleniyor] = useState(false);
  const [durumSuzgec, setDurumSuzgec] = useState<DurumSuzgeci>("acik");
  /** Günlük dağıtım listesi: satırlarda tek dokunuşluk ✓ ve ⤼. */
  const [hizliListe, setHizliListe] = useState(false);
  /** Rota duraklarını ▲ ▼ ile elle sıralama. */
  const [siraDuzenle, setSiraDuzenle] = useState(false);
  /** Vardiyada GPS'ten ölçülen gerçek yol ve hareket süresi. */
  const [yolOzeti, setYolOzeti] = useState({ m: 0, sn: 0 });
  const yolRef = useRef<{
    m: number;
    sn: number;
    son: { nokta: Nokta; t: number } | null;
  }>({ m: 0, sn: 0, son: null });
  const vardiyaIdRef = useRef<string | null>(null);
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
   * Haritada yeşile döndürülüp ödeme bilgisi henüz girilmemiş teslim.
   * Doluyken ödeme ekranı kapatılamıyor; "Teslimi geri al" pini bu
   * önceki durumuna döndürüyor.
   */
  const [zorunluTeslim, setZorunluTeslim] = useState<{
    id: string;
    oncekiDurum: SiparisDurumu;
  } | null>(null);
  /** Haritada açık balon — kayıt listeden tazelensin diye yalnızca kimlik tutuluyor. */
  const [balonSecim, setBalonSecim] = useState<{
    tur: "teslimat" | "abonelik";
    id: string;
  } | null>(null);

  const [sekme, setSekme] = useState<Sekme>("teslimatlar");
  // Açılışta harita ekranı kaplar; liste yukarı kaydırınca tam ekran açılır.
  const [panel, setPanelHam] = useState<PanelDurumu>("kapali");
  /** Liste tam ekran (sağdan sola güçlü kaydırmayla açılır). */
  const [tamEkran, setTamEkran] = useState(false);
  /**
   * Alt panelin yüksekliğini değiştiren her işlem (pine uçma, ayrıntı,
   * navigasyon) haritayı göstermek istiyor: tam ekran liste kapanır.
   */
  function setPanel(d: PanelDurumu) {
    setPanelHam(d);
    setTamEkran(false);
    setSeciliAbonelikId(null);
  }
  const [seciliId, setSeciliId] = useState<string | null>(null);
  /** Tam ekran listede ayrıntısı açık abonelik. */
  const [seciliAbonelikId, setSeciliAbonelikId] = useState<string | null>(null);

  const [secimModu, setSecimModu] = useState(false);
  const [secilenler, setSecilenler] = useState<string[]>([]);
  const [topluSilOnay, setTopluSilOnay] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  /** Listelerde ad/telefon/adres araması. */
  const [arama, setArama] = useState("");
  const [rota, setRota] = useState<RotaSonucu | null>(null);
  const [rotaHesapla, setRotaHesapla] = useState(false);

  const [katmanlar, setKatmanlar] = useState<Katmanlar>(() => ({
    abonelikler: true,
    // Sepetler bölümü kaldırıldı; harita katmanı hep kapalı.
    sepetler: false,
    teslimEdilenler: false,
    ucBoyut: true,
    isiHaritasi: false,
    karanlik: tercihOku().karanlik ?? false,
    siteler: true,
  }));
  const [katmanPaneli, setKatmanPaneli] = useState(false);

  const [kuryeKonumu, setKuryeKonumu] = useState<Nokta | null>(null);
  /** Konum bir teslimat adresine sabitlendi mi? */
  const sabitKonumRef = useRef(false);
  const [sabitKonum, setSabitKonum] = useState(false);
  /** Son kabul edilen ölçümün payı ve zamanı — kötüsü iyisini ezmesin diye. */
  const sonDogrulukRef = useRef<number | null>(null);
  const sonOlcumZamaniRef = useRef(0);
  const kuryeKonumuRef = useRef<Nokta | null>(null);
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
  /** İki parmakla sayfa yakınlaştırma kilidi — kurye kendisi açıp kapatıyor. */
  const [zoomKilitli, setZoomKilitli] = useState(
    () => tercihOku().zoomKilitli ?? false,
  );

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
    () =>
      teslimatlar.find((s) => s.id === seciliId) ??
      gecmisTeslimatlar.find((s) => s.id === seciliId) ??
      null,
    [teslimatlar, gecmisTeslimatlar, seciliId],
  );
  const seciliAbonelik = useMemo(
    () => abonelikler.find((a) => a.id === seciliAbonelikId) ?? null,
    [abonelikler, seciliAbonelikId],
  );

  /**
   * Bulucunun "yakınındaki siteler" sırası için merkez. ~100 m'ye
   * yuvarlanıyor: her GPS güncellemesinde liste yeniden dizilip kuryenin
   * okuduğu satır kaymasın.
   */
  const bulucuLat = Math.round((kuryeKonumu?.lat ?? MARKET.nokta.lat) * 1000) / 1000;
  const bulucuLng = Math.round((kuryeKonumu?.lng ?? MARKET.nokta.lng) * 1000) / 1000;
  const bulucuMerkezi = useMemo(
    () => ({ lat: bulucuLat, lng: bulucuLng }),
    [bulucuLat, bulucuLng],
  );

  const seciliSite = useMemo(
    () => siteler.find((s) => s.id === seciliSiteId) ?? null,
    [siteler, seciliSiteId],
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

  const aramaAnahtari = arama.trim().toLocaleLowerCase("tr");

  /** Listede gösterilen günün teslimatları (iptaller hiçbir yerde yok). */
  const gunTeslimatlari = useMemo(
    () =>
      (gecmisGun ? gecmisTeslimatlar : teslimatlar).filter(
        (s) => s.durum !== "iptal",
      ),
    [gecmisGun, gecmisTeslimatlar, teslimatlar],
  );

  const suzgecSayilari = useMemo(() => {
    const say = {} as Record<DurumSuzgeci, number>;
    for (const { anahtar } of DURUM_SUZGECLERI)
      say[anahtar] = gunTeslimatlari.filter((s) =>
        suzgeceUyar(s, anahtar),
      ).length;
    return say;
  }, [gunTeslimatlari]);

  const siraliTeslimatlar = useMemo(() => {
    let liste = gunTeslimatlari.filter((s) => suzgeceUyar(s, durumSuzgec));
    if (aramaAnahtari)
      liste = liste.filter((s) => kayitAra(s, aramaAnahtari));
    if (rotaSirasi.size === 0 || gecmisGun) return liste;
    return [...liste].sort(
      (a, b) =>
        (rotaSirasi.get(a.id) ?? 999) - (rotaSirasi.get(b.id) ?? 999),
    );
  }, [gunTeslimatlari, durumSuzgec, aramaAnahtari, rotaSirasi, gecmisGun]);

  /* Temayı belgeye yansıt ve tercihleri sakla. */
  useEffect(() => {
    document.documentElement.dataset.tema = katmanlar.karanlik
      ? "karanlik"
      : "aydinlik";
    try {
      localStorage.setItem(
        TERCIH_ANAHTARI,
        JSON.stringify({
          karanlik: katmanlar.karanlik,
          ses: sesAcik,
          zoomKilitli,
        }),
      );
    } catch {
      /* depolama kapalıysa yok say */
    }
  }, [katmanlar.karanlik, sesAcik, zoomKilitli]);

  /*
   * Yakınlaştırma kilidi. Yalnızca viewport etiketine yazmak mobilde
   * yetmiyordu: iOS Safari `user-scalable=no`yu yok sayıyor, Next de etiketi
   * kendi değeriyle yeniden yazabiliyor. Kilitliyken üç katman var:
   *  - viewport etiketi (Android'de ölçeği 1'e de döndürür),
   *  - <html>e `zoom-kilitli` sınıfı → `touch-action: pan-x pan-y`
   *    (Chrome/Android ve iOS'ta iki parmak ve çift dokunma yakınlaşmasını
   *    keser, kaydırma çalışır),
   *  - iOS'un `gesture*` olayları ile haritanın dışındaki iki parmak
   *    hareketi engellenir. Harita kendi iki parmak yakınlaştırmasını
   *    yapmaya devam eder.
   */
  useEffect(() => {
    const kok = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      meta.content = zoomKilitli
        ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        : "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover";
    }
    kok.classList.toggle("zoom-kilitli", zoomKilitli);
    if (!zoomKilitli) return;

    const haritada = (e: Event) =>
      e.target instanceof Element && e.target.closest(".maplibregl-map") != null;
    const jestEngelle = (e: Event) => {
      if (!haritada(e)) e.preventDefault();
    };
    const dokunmaEngelle = (e: TouchEvent) => {
      if (e.touches.length > 1 && !haritada(e)) e.preventDefault();
    };
    const secenek = { passive: false } as const;
    document.addEventListener("gesturestart", jestEngelle, secenek);
    document.addEventListener("gesturechange", jestEngelle, secenek);
    document.addEventListener("touchmove", dokunmaEngelle, secenek);
    return () => {
      kok.classList.remove("zoom-kilitli");
      document.removeEventListener("gesturestart", jestEngelle);
      document.removeEventListener("gesturechange", jestEngelle);
      document.removeEventListener("touchmove", dokunmaEngelle);
    };
  }, [zoomKilitli]);

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
      yolYukle(v?.id ?? null);
      const t = v ? await vardiyaTahsilatlari(db, v.id) : [];
      if (!iptal) setTahsilatlar(t);
    });

    return () => {
      iptal = true;
    };
  }, [db, kurye]);

  /** Vardiya değişince GPS yol ölçümünü o vardiyanın kaydından yükler. */
  function yolYukle(id: string | null) {
    vardiyaIdRef.current = id;
    let kayit = { m: 0, sn: 0 };
    if (id) {
      try {
        kayit = {
          ...kayit,
          ...JSON.parse(localStorage.getItem(YOL_ANAHTARI + id) ?? "{}"),
        };
      } catch {
        /* depolama kapalı */
      }
    }
    yolRef.current = { m: kayit.m, sn: kayit.sn, son: null };
    setYolOzeti(kayit);
  }

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

  /* ------------------------- Siteler ------------------------- */
  useEffect(() => {
    // Başka bir kuryenin onayladığı site bu haritaya da düşsün.
    const kanal = db
      .channel("siteler")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "siteler" },
        () => void sitelerGetir(db).then(setSiteler),
      )
      .subscribe();
    return () => {
      void db.removeChannel(kanal);
    };
  }, [db]);

  /* ------------------------- Veri tazeleme ------------------------- */
  // Açılıştaki sorguyla aynısı: ayrı bir alan listesi tutulunca ödeme
  // alanları (alındı mı, yöntem, ödeyen) canlı yenilemede düşüyordu ve
  // günün listesine geçmiş günlerin teslim edilmişleri karışıyordu.
  const teslimatlariTazele = useCallback(async () => {
    try {
      setTeslimatlar(await siparisleriGetir(db, bugununTarihi()));
      const gun = gecmisGunRef.current;
      if (gun) setGecmisTeslimatlar(await gunSiparisleriGetir(db, gun));
    } catch {
      /* ağ yoksa eldeki liste kalsın */
    }
  }, [db]);

  /** Teslimatlar listesini başka bir güne çevirir; null bugün. */
  async function gunuGoster(tarih: string | null) {
    const bugun = bugununTarihi();
    const gun = tarih && tarih < bugun ? tarih : null;
    gecmisGunRef.current = gun;
    setGecmisGun(gun);
    setSeciliId(null);
    setSecimModu(false);
    setSecilenler([]);
    setHizliListe(false);
    setSiraDuzenle(false);
    // Geçmiş günde "açık" süzgeci çoğu zaman boş kalır; hepsini göster.
    setDurumSuzgec(gun ? "tumu" : "acik");
    if (!gun) {
      setGecmisTeslimatlar([]);
      return;
    }
    setGecmisYukleniyor(true);
    try {
      setGecmisTeslimatlar(await gunSiparisleriGetir(db, gun));
    } catch {
      uyar("O günün teslimatları alınamadı.");
      setGecmisTeslimatlar([]);
    } finally {
      setGecmisYukleniyor(false);
    }
  }

  function gunKaydir(fark: number) {
    const g = new Date(`${gecmisGun ?? bugununTarihi()}T12:00:00`);
    g.setDate(g.getDate() + fark);
    const yil = g.getFullYear();
    const ay = String(g.getMonth() + 1).padStart(2, "0");
    const gn = String(g.getDate()).padStart(2, "0");
    void gunuGoster(`${yil}-${ay}-${gn}`);
  }

  /**
   * Abonelik listesini baştan okur.
   *
   * Teslimatların canlı akışı var, aboneliklerin yok: toplu yüklemeden sonra
   * yeni kayıtların görünmesi için elle tazeleniyor.
   */
  const listeleriTazele = useCallback(async () => {
    setAbonelikler(await abonelikleriGetir(db));
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
   * Kuryenin konumunu bir teslimat adresine sabitler.
   *
   * Kurye kapının önünde duruyor ve tarayıcı onu kilometrelerce ötede
   * sanıyorsa — masaüstünde konum IP'den geliyor, VPN varsa büsbütün şaşıyor
   * — elimizdeki en güvenilir bilgi gittiği adresin koordinatı.
   *
   * Sabitlenen nokta kilitleniyor, yoksa tarayıcının kaba tahmini saniyeler
   * içinde üstüne yazardı. Kilit tek bir şeyle açılıyor: 100 m'den iyi
   * gerçek bir ölçüm. O noktada cihaz adresten de iyisini biliyor, kurye
   * bir sonraki durağa geçmiş de olabilir.
   */
  function konumuBuradanAl(nokta: Nokta, ad: string) {
    sabitKonumRef.current = true;
    setSabitKonum(true);
    sonDogrulukRef.current = null;
    sonOlcumZamaniRef.current = 0;
    kuryeKonumuRef.current = nokta;
    setKuryeKonumu(nokta);
    setKonumTakibi(true);
    haritaApi.current?.ucur(nokta, 17);
    uyar(`Konumunuz ${ad} adresine alındı`);
  }

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
    konumaUcRef.current = true;
    sabitKonumRef.current = false;
    setSabitKonum(false);
    // Eldeki ölçüm unutuluyor: yeniden bulmanın amacı zaten onu atmak,
    // yoksa "daha kötü ölçüm elenir" kuralı yeni ölçümü de elerdi.
    sonDogrulukRef.current = null;
    sonOlcumZamaniRef.current = 0;
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

        // Adrese sabitlenmiş konumu ancak gerçekten iyi bir ölçüm devralır.
        if (sabitKonumRef.current) {
          if ((dogruluk ?? Infinity) > IYI_DOGRULUK_M) return;
          sabitKonumRef.current = false;
          setSabitKonum(false);
        }

        /*
         * Daha kötü ölçüm iyisini ezmesin. Telefon GPS ile Wi-Fi arasında
         * gidip geliyor: 15 m'lik ölçümün hemen ardından 800 m'lik biri
         * gelince imleç sokak sokak zıplıyordu. Eldeki ölçüm bayatlayınca
         * (kurye yol almıştır) yenisi koşulsuz kabul ediliyor.
         */
        const simdiki = Date.now();
        const taze = simdiki - sonOlcumZamaniRef.current < OLCUM_TAZELIK_MS;
        const dahaKotu =
          (dogruluk ?? Infinity) > (sonDogrulukRef.current ?? Infinity);
        if (kuryeKonumuRef.current && taze && dahaKotu) return;
        sonDogrulukRef.current = dogruluk;
        sonOlcumZamaniRef.current = simdiki;
        kuryeKonumuRef.current = nokta;

        setKuryeKonumu(nokta);

        /*
         * Vardiya yolu gerçek GPS izinden: yalnızca iyi ölçümler sayılıyor ve
         * nokta 15 m'den fazla ilerleyince ekleniyor; yerinde dururken
         * titreşen GPS yol üretmesin. Saniyede 40 m'yi aşan sıçrama atlanıyor.
         */
        if (vardiyaIdRef.current && (dogruluk ?? Infinity) <= 50) {
          const yol = yolRef.current;
          if (!yol.son) {
            yol.son = { nokta, t: simdiki };
          } else {
            const d = haversine(yol.son.nokta, nokta);
            const dt = (simdiki - yol.son.t) / 1000;
            if (d >= 15) {
              if (dt > 0 && d / dt < 40) {
                yol.m += d;
                yol.sn += Math.min(dt, 120);
                setYolOzeti({ m: yol.m, sn: yol.sn });
                try {
                  localStorage.setItem(
                    YOL_ANAHTARI + vardiyaIdRef.current,
                    JSON.stringify({ m: yol.m, sn: yol.sn }),
                  );
                } catch {
                  /* depolama kapalı */
                }
              }
              yol.son = { nokta, t: simdiki };
            }
          }
        }

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

  const suzulmusAbonelikler = useMemo(() => {
    if (!aramaAnahtari) return abonelikler;
    return abonelikler.filter((a) => kayitAra(a, aramaAnahtari));
  }, [abonelikler, aramaAnahtari]);

  /**
   * Açık sekmede listelenen kayıtlar — "Tümünü seç" bunları seçer. Arama
   * açıksa yalnızca eşleşenler: kurye "Serdivan" arayıp tümünü silerse
   * diğer ilçelere dokunulmasın.
   */
  const gorunurKimlikler = useMemo(
    () =>
      (sekme === "teslimatlar" ? siraliTeslimatlar : suzulmusAbonelikler).map(
        (k) => k.id,
      ),
    [sekme, siraliTeslimatlar, suzulmusAbonelikler],
  );
  const tumuSecili =
    gorunurKimlikler.length > 0 &&
    gorunurKimlikler.every((id) => secilenler.includes(id));

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
    if (gecmisGun) void gunuGoster(null);
    setSeciliId(id);
    // Tam ekran listeden açılan ayrıntı yine tam ekranda kalsın.
    if (tamEkran) {
      setPanelHam("yari");
      setSeciliAbonelikId(null);
    } else setPanel("yari");
    const s = teslimatlar.find((t) => t.id === id);
    if (s?.adres?.lat != null)
      haritaApi.current?.ucur({ lat: s.adres.lat, lng: s.adres.lng! });
  }

  function secimDegistir(id: string) {
    setSecilenler((onceki) =>
      onceki.includes(id) ? onceki.filter((x) => x !== id) : [...onceki, id],
    );
  }

  function tumunuSecDegistir() {
    setSecilenler(tumuSecili ? [] : gorunurKimlikler);
  }

  /** Seçili kayıtları açık sekmeden siler; silinemeyenleri söyler. */
  async function secilenleriSil() {
    const idler = secilenler.filter((id) => gorunurKimlikler.includes(id));
    if (idler.length === 0) return;
    const tablo = sekme === "teslimatlar" ? "siparisler" : "abonelikler";

    setIslemde(true);
    try {
      const silinen = new Set(await topluSil(db, tablo, idler));
      const kalan = <T extends { id: string }>(o: T[]) =>
        o.filter((x) => !silinen.has(x.id));
      if (sekme === "teslimatlar") setTeslimatlar(kalan);
      else setAbonelikler(kalan);

      setSecilenler((o) => o.filter((id) => !silinen.has(id)));
      if (seciliId && silinen.has(seciliId)) setSeciliId(null);
      if (balonSecim && silinen.has(balonSecim.id)) setBalonSecim(null);
      setRota(null);
      setTopluSilOnay(false);

      const atlanan = idler.length - silinen.size;
      if (atlanan === 0) setSecimModu(false);
      uyar(
        atlanan > 0
          ? `${silinen.size} kayıt silindi · ${atlanan} kayıt silinemedi (teslim edilmiş)`
          : `${silinen.size} kayıt silindi`,
      );
    } catch {
      setTopluSilOnay(false);
      uyar("Kayıtlar silinemedi. Bağlantıyı kontrol edip tekrar deneyin.");
    } finally {
      setIslemde(false);
    }
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
        : suz(suzulmusAbonelikler);

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
    const s = teslimatlar.find((x) => x.id === id);
    if (durum === "yolda" && s?.musteri?.telefon) {
      uyar("Yola çıkıldı", {
        etiket: "💬 WhatsApp'la haber ver",
        calistir: () => {
          waAc(s.musteri?.telefon, "yolda", s.musteri?.ad);
        },
      });
    }
  }

  /* ---------------- Hızlı liste: tek dokunuşla teslim / atla ---------------- */

  /**
   * Planlanan ödeme yöntemiyle, tutarın tamamı müşteriden alınmış sayılarak
   * teslim eder. Planlanan yöntem ya da tutar yoksa normal ödeme ekranı açılır.
   */
  async function hizliTeslim(s: Siparis) {
    const ad = s.musteri?.ad?.trim() ?? "";
    const yontem = s.odeme_yontemi;
    if (!(s.tutar > 0) || !yontem || !ad) {
      setSeciliId(s.id);
      setTeslimBaslangic("alindi");
      setTeslimModu("teslim");
      return;
    }
    await teslimSonucuUygula(
      {
        tur: "teslim",
        odemeAlindi: true,
        tahsilat: { tutar: s.tutar, yontem },
        kasaya: paraAlinirMi(yontem, yontemler),
        odeyen: ad,
      },
      s,
    );
    uyar(`✓ ${ad} · ${para(s.tutar)} ${odemeAdi(yontem)}`, {
      etiket: "Geri al",
      calistir: () => void hizliGeriAl(s),
    });
  }

  async function hizliAtla(s: Siparis) {
    await teslimSonucuUygula(
      { tur: "basarisiz", sebep: "diger", not: "Bugün atlandı", yarinTekrar: false },
      s,
    );
    uyar(`${s.musteri?.ad ?? "Teslimat"} bugün atlandı`, {
      etiket: "Geri al",
      calistir: () => void hizliGeriAl(s),
    });
  }

  /** Hızlı teslim ya da atlamayı geri alır: sipariş önceki hâline döner. */
  async function hizliGeriAl(onceki: Siparis) {
    const yama = {
      durum: onceki.durum,
      teslim_zamani: onceki.teslim_zamani,
      odeme_alindi: onceki.odeme_alindi,
      odeme_alinmayan_kisi: onceki.odeme_alinmayan_kisi,
      odeme_notu: onceki.odeme_notu,
      odeme_yapan: onceki.odeme_yapan,
      odeme_tutari: onceki.odeme_tutari,
      basarisizlik_sebebi: onceki.basarisizlik_sebebi,
      basarisizlik_notu: onceki.basarisizlik_notu,
      deneme_sayisi: onceki.deneme_sayisi,
    };
    await siparisGuncelle(onceki.id, yama, (s) => ({ ...s, ...yama }));
    // Hızlı teslimde kasaya işlenen tahsilat da geri alınır.
    if (tahsilatlar.some((t) => t.siparis_id === onceki.id)) {
      setTahsilatlar((o) => o.filter((t) => t.siparis_id !== onceki.id));
      const { error } = await db
        .from("tahsilatlar")
        .delete()
        .eq("siparis_id", onceki.id);
      if (error) {
        uyar("Teslim geri alındı ama kasa kaydı silinemedi — yöneticiye bildirin.");
        return;
      }
    }
    uyar("Geri alındı");
  }

  /* ---------------- Durakları elle sıralama ---------------- */

  /** Elle verilen sıradan düz çizgili bir rota kurar. */
  function elleRota(sira: string[]): RotaSonucu {
    const bas = kuryeKonumu ?? MARKET.nokta;
    const noktalar = sira
      .map((id) => teslimatlar.find((s) => s.id === id)?.adres)
      .filter((a): a is Adres => a?.lat != null && a.lng != null)
      .map((a) => ({ lat: a.lat!, lng: a.lng! }));
    const tumu = [bas, ...noktalar];
    let mesafe = 0;
    for (let i = 1; i < tumu.length; i++) mesafe += haversine(tumu[i - 1], tumu[i]);
    return {
      sira,
      geometri: tumu.map((n) => [n.lng, n.lat] as [number, number]),
      toplamMesafeM: mesafe,
      // Şehir içi motor ortalaması ~25 km/sa.
      toplamSureSn: mesafe / 7,
      motor: "yerel",
      elle: true,
    };
  }

  function durakTasi(id: string, yon: -1 | 1) {
    if (!rota) return;
    const sira = [...rota.sira];
    const i = sira.indexOf(id);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= sira.length) return;
    [sira[i], sira[j]] = [sira[j], sira[i]];
    setRota(elleRota(sira));
  }

  /** Teslim ettim / teslim edilemedi akışının sonucu. */
  async function teslimSonucuUygula(
    sonuc: TeslimSonuc,
    hedef: Siparis | null = secili,
  ) {
    if (!hedef) return;
    const id = hedef.id;

    // Fotoğraf arka planda yüklenir; teslim kaydını bekletmez.
    if (sonuc.foto) {
      const foto = sonuc.foto;
      void teslimFotosuYukle(db, id, foto).catch(() =>
        uyar("Teslim kaydedildi ama fotoğraf yüklenemedi."),
      );
    }

    if (sonuc.tur === "teslim") {
      const zaman = new Date().toISOString();
      const alindi = sonuc.odemeAlindi;
      const odeyen = alindi ? sonuc.odeyen : null;
      const odemeTutari = alindi ? sonuc.tahsilat.tutar : null;
      const yama: Record<string, unknown> = {
        durum: "teslim",
        teslim_zamani: zaman,
        kurye_id: kurye?.id ?? null,
        odeme_alindi: alindi,
        odeme_alinmayan_kisi: alindi ? null : sonuc.alinmayanKisi,
        odeme_notu: alindi ? null : sonuc.not || null,
        odeme_yapan: odeyen,
        odeme_tutari: odemeTutari,
      };
      if (alindi) yama.odeme_yontemi = sonuc.tahsilat.yontem;

      setZorunluTeslim(null);
      await siparisGuncelle(id, yama, (s) => ({
        ...s,
        durum: "teslim",
        teslim_zamani: zaman,
        odeme_alindi: alindi,
        odeme_alinmayan_kisi: alindi ? null : sonuc.alinmayanKisi,
        odeme_notu: alindi ? null : sonuc.not || null,
        odeme_yontemi: alindi ? sonuc.tahsilat.yontem : s.odeme_yontemi,
        odeme_yapan: odeyen,
        odeme_tutari: odemeTutari,
      }));

      // Kasa yalnızca kurye parayı elden aldığında hareket eder; havale gibi
      // yöntemlerde tutar siparişte kalır, kasaya işlenmez.
      if (alindi && sonuc.kasaya && sonuc.tahsilat.tutar > 0 && kurye) {
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
        deneme_sayisi: (hedef.deneme_sayisi ?? 0) + 1,
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
    yolYukle((data as Vardiya | null)?.id ?? null);
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
    yolYukle(null);
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
    }
    setKayitEkle(false);
    setDuzenlenen(null);
    setPanel("acik");
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
      nokta:
        ortak.adres?.lat != null && ortak.adres.lng != null
          ? { lat: ortak.adres.lat, lng: ortak.adres.lng }
          : null,
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
   * Teslimi kapatma ekranını açar.
   *
   * `pinYesil`: kurye pini haritada teslim etti (uzun basış, navigasyonda
   * "Teslim ettim"). Pin hemen yeşile dönüyor ama veritabanına yalnızca
   * ekran eksiksiz doldurulunca yazılıyor; ekran ödeme yöntemi, tutar ve
   * ödeyen girilmeden kapanmıyor. Tek çıkış "Teslimi geri al".
   */
  function teslimFormuAc(siparis: Siparis, pinYesil: boolean) {
    setBalonSecim(null);
    setSeciliId(siparis.id);
    setTeslimBaslangic("alindi");
    setTeslimModu("teslim");
    if (!pinYesil) return;

    setZorunluTeslim({ id: siparis.id, oncekiDurum: siparis.durum });
    // Teslim edilenler katmanı kapalıysa yeşile dönen pin gözden kaybolur.
    setKatmanlar((k) =>
      k.teslimEdilenler ? k : { ...k, teslimEdilenler: true },
    );
    setTeslimatlar((o) =>
      o.map((s) => (s.id === siparis.id ? { ...s, durum: "teslim" } : s)),
    );
  }

  /** Zorunlu ekrandan "Teslimi geri al": yalnızca yereldeki yeşil geri döner. */
  function zorunluTeslimiGeriAl() {
    const bekleyen = zorunluTeslim;
    if (!bekleyen) return;
    setTeslimatlar((o) =>
      o.map((s) =>
        s.id === bekleyen.id ? { ...s, durum: bekleyen.oncekiDurum } : s,
      ),
    );
    setZorunluTeslim(null);
    setTeslimModu(null);
    uyar("Teslim işareti kaldırıldı");
  }

  /**
   * Kaydedilmiş bir teslimi geri alır (yeşil pine tekrar uzun basış): pin
   * "bekliyor"a döner ve ödeme bilgisi silinir — yeniden teslim edildiğinde
   * yeniden girilecek.
   */
  async function teslimGeriAl(id: string) {
    setBalonSecim(null);
    const yama = {
      durum: "bekliyor" as SiparisDurumu,
      teslim_zamani: null,
      odeme_alindi: null,
      odeme_alinmayan_kisi: null,
      odeme_notu: null,
      odeme_yapan: null,
      odeme_tutari: null,
    };
    await siparisGuncelle(id, yama, (s) => ({ ...s, ...yama }));
    uyar("Teslim işareti kaldırıldı");
  }

  function uzunBasis(
    tur: "teslimat" | "abonelik" | "sepet",
    id: string,
  ) {
    if (tur === "sepet") return;
    // Kurye uzun basmayı öğrendi: ipucu bir daha çıkmasın.
    try {
      localStorage.setItem(IPUCU_ANAHTARI, "-1");
    } catch {
      /* depolama kapalı */
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
    teslimFormuAc(siparis, true);
  }

  /* ------------------------- Adres bulucu ------------------------- */

  function bulucuyaUc(nokta: Nokta, kart: boolean, zoom = 17) {
    haritaApi.current?.ucur(nokta, zoom, bulucuOfseti(kart));
  }

  function bulucuyuAc() {
    setBulucuAcik(true);
    setBalonSecim(null);
    setPanel("kapali");
  }

  function bulucuyuKapat() {
    setBulucuAcik(false);
    setSiteOnizleme(null);
    setSeciliSiteId(null);
    setHaritadanSecim(false);
  }

  function siteyiOnizle(aday: SiteAdayi | null) {
    setSiteOnizleme(aday);
    setSeciliSiteId(null);
    if (!aday) return;
    bulucuyaUc(aday, true);
    // Google'dan gelen aday zaten Google'ın noktasında; diğerlerini eşle.
    if (aday.kaynak !== "google" && aday.ad.trim().length >= 2) {
      void googleIleEsle(aday);
    }
  }

  /**
   * Adayı Google Haritalar'da arar; bulunursa pini Google'daki noktaya
   * taşır. Kurye bu arada pini ya da adı değiştirdiyse sonucu uygulamaz.
   */
  async function googleIleEsle(aday: SiteAdayi) {
    const anahtar = aday.anahtar;
    const ayniAday = (o: SiteAdayi | null): o is SiteAdayi =>
      o?.anahtar === anahtar;
    setSiteOnizleme((o) =>
      ayniAday(o) ? { ...o, dogrulama: { durum: "sorguluyor" } } : o,
    );

    let sonuc: GoogleDogrulama;
    try {
      const p = new URLSearchParams({
        ad: aday.ad.trim(),
        lat: String(aday.lat),
        lng: String(aday.lng),
      });
      if (aday.mahalle) p.set("mahalle", aday.mahalle);
      if (aday.ilce) p.set("ilce", aday.ilce);
      const yanit = await fetch(`/api/site-dogrula?${p}`);
      sonuc = yanit.ok ? ((await yanit.json()) as GoogleDogrulama) : { durum: "hata" };
    } catch {
      sonuc = { durum: "hata" };
    }

    setSiteOnizleme((o) => {
      if (!ayniAday(o)) return o;
      // Sorgu sürerken kurye pini elle taşıdıysa ya da adı değiştirdiyse
      // onun kararı geçerli; yalnızca sonucu gösteriyoruz.
      const elDegdi =
        o.lat !== aday.lat || o.lng !== aday.lng || o.ad !== aday.ad;
      if (sonuc.durum !== "eslesti" || elDegdi || sonuc.fark < 12) {
        return { ...o, dogrulama: sonuc };
      }
      return {
        ...o,
        dogrulama: sonuc,
        eskiKonum: { lat: o.lat, lng: o.lng },
        lat: sonuc.lat,
        lng: sonuc.lng,
      };
    });
    if (sonuc.durum === "eslesti" && sonuc.fark >= 12) {
      bulucuyaUc(sonuc, true);
    }
  }

  function siteSec(site: KayitliSite | null) {
    setSeciliSiteId(site?.id ?? null);
    setSiteOnizleme(null);
    if (site) {
      setKatmanlar((k) => (k.siteler ? k : { ...k, siteler: true }));
      bulucuyaUc(site, true);
    }
  }

  /** "Haritaya dokunarak ekle": dokunulan noktadan boş bir aday açar. */
  async function haritadanSiteAc(nokta: Nokta) {
    setHaritadanSecim(false);
    if (!sakaryadaMi(nokta)) {
      uyar("Bu nokta Sakarya dışında.");
      return;
    }
    const anahtar = `elle:${nokta.lat.toFixed(6)},${nokta.lng.toFixed(6)}`;
    setSiteOnizleme({
      anahtar,
      ad: "",
      tur: "site",
      ilce: null,
      mahalle: null,
      adres: null,
      lat: nokta.lat,
      lng: nokta.lng,
      bloklar: [],
      kaynak: "elle",
      kaynak_id: null,
    });
    setSeciliSiteId(null);
    bulucuyaUc(nokta, true, 17.5);

    // İlçe/mahalle/sokağı doldurmayı dene; kurye bu arada yazmaya
    // başladıysa onun yazdığını ezme.
    try {
      const yanit = await fetch(
        `/api/site-ara?lat=${nokta.lat}&lng=${nokta.lng}`,
      );
      if (!yanit.ok) return;
      const { aday } = (await yanit.json()) as { aday: SiteAdayi };
      setSiteOnizleme((o) =>
        o?.anahtar === anahtar
          ? {
              ...o,
              ad: o.ad || aday.ad,
              tur: o.ad ? o.tur : aday.tur,
              ilce: o.ilce ?? aday.ilce,
              mahalle: o.mahalle ?? aday.mahalle,
              adres: o.adres ?? aday.adres,
            }
          : o,
      );
    } catch {
      /* çevrimdışı — kurye elle doldurur */
    }
  }

  async function siteyiOnayla(aday: SiteAdayi) {
    if (!sakaryadaMi(aday)) {
      uyar("Pin Sakarya sınırları dışında.");
      return;
    }
    setIslemde(true);
    try {
      const yeni = await siteEkle(db, {
        ad: aday.ad,
        tur: aday.tur,
        ilce: aday.ilce,
        mahalle: aday.mahalle,
        adres: aday.adres,
        lat: aday.lat,
        lng: aday.lng,
        bloklar: aday.bloklar,
        kaynak: aday.kaynak,
        kaynak_id: aday.kaynak_id,
      });
      setSiteler((o) => birlestir(o, yeni));
      setKatmanlar((k) => (k.siteler ? k : { ...k, siteler: true }));
      setSiteOnizleme(null);
      setSeciliSiteId(yeni.id);
      uyar(`${yeni.ad} haritaya eklendi`);
    } catch (hata) {
      const kod = (hata as { code?: string }).code;
      uyar(
        kod === "23505"
          ? "Bu site zaten haritada."
          : kod === "PGRST205" || kod === "42P01"
            ? "Siteler tablosu kurulmamış — göç dosyasını uygulayın."
            : "Site eklenemedi.",
      );
    } finally {
      setIslemde(false);
    }
  }

  async function siteyiKaldir(site: KayitliSite) {
    setIslemde(true);
    try {
      await siteSil(db, site.id);
      setSiteler((o) => o.filter((x) => x.id !== site.id));
      setSeciliSiteId(null);
      uyar(`${site.ad} haritadan kaldırıldı`);
    } catch {
      uyar("Yalnızca kendi eklediğin siteyi kaldırabilirsin.");
    } finally {
      setIslemde(false);
    }
  }

  /** Bulunan siteyi yeni kaydın adresi olarak açar. */
  function siteyeKayitAc(site: SiteAdayi, blok: string | null) {
    const bl = blok ? site.bloklar.find((b) => b.ad === blok) : null;
    setKayitAdresi({
      adres_metni: siteAdresMetni(site, blok),
      bina: blok ?? "",
      lat: bl?.lat ?? site.lat,
      lng: bl?.lng ?? site.lng,
      etiket: blok ? `${site.ad} · ${blok}` : site.ad,
    });
    bulucuyuKapat();
    setDuzenlenen(null);
    setKayitEkle(true);
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
    return null;
  }, [balonSecim, teslimatlar, abonelikler]);

  const balonNoktasi = useMemo(() => {
    if (!balonKayit) return null;
    const adres =
      balonKayit.tur === "teslimat"
        ? balonKayit.siparis.adres
        : balonKayit.tur === "abonelik"
          ? balonKayit.abonelik.adres
          : null;
    if (adres?.lat == null || adres.lng == null) return null;
    return { lat: adres.lat, lng: adres.lng };
  }, [balonKayit]);

  /** Haritadaki bir pine dokunuldu: balonu aç, paneli kapat, oraya uç. */
  function haritaPini(
    tur: "teslimat" | "abonelik",
    id: string,
    nokta: Nokta | null,
  ) {
    if (secimModu && tur === "teslimat") return secimDegistir(id);
    setBalonSecim({ tur, id });
    uzunBasmaIpucu();
    if (tur === "teslimat") setSeciliId(id);
    setPanel("kapali");
    if (nokta) haritaApi.current?.ucur(nokta);
  }

  /**
   * Uzun basma gizli bir hareket: kurye bilmiyorsa hiç kullanmıyor. İlk üç
   * balonda kısa bir ipucu çıkıyor; kurye bir kez uzun basınca bir daha yok.
   */
  function uzunBasmaIpucu() {
    try {
      const n = Number(localStorage.getItem(IPUCU_ANAHTARI) ?? 0);
      if (n < 0 || n >= 3) return;
      localStorage.setItem(IPUCU_ANAHTARI, String(n + 1));
    } catch {
      return;
    }
    window.setTimeout(
      () => uyar("💡 İpucu: pine uzun basınca teslim edildi olarak işaretlenir"),
      600,
    );
  }

  /* ------------------------- Görünüm ------------------------- */
  const toplamTahsilat = aktifTeslimatlar.reduce((t, s) => t + s.tutar, 0);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-yuzey2">
      <Harita
        ref={haritaApi}
        teslimatlar={teslimatlar}
        abonelikler={bugunAbonelikler}
        sepetler={[]}
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
        siteler={siteler}
        siteOnizleme={
          siteOnizleme
            ? {
                lat: siteOnizleme.lat,
                lng: siteOnizleme.lng,
                ad: siteOnizleme.ad.trim() || "Yeni site",
              }
            : null
        }
        onOnizlemeTasindi={(n) =>
          setSiteOnizleme((o) => (o ? { ...o, lat: n.lat, lng: n.lng } : o))
        }
        onSiteSecim={(id) => {
          const site = siteler.find((x) => x.id === id);
          if (!site || secimModu || konumDuzeltme) return;
          bulucuyuAc();
          siteSec(site);
        }}
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
                    onSil={() => {
                      const kayit: EklenenKayit =
                        balonKayit.tur === "teslimat"
                          ? { tur: "teslimat", siparis: balonKayit.siparis }
                          : { tur: "abonelik", abonelik: balonKayit.abonelik };
                      void kayitSil(kayit);
                    }}
                    onDetay={() => {
                      if (balonKayit.tur === "teslimat")
                        setSeciliId(balonKayit.siparis.id);
                      setSekme(
                        balonKayit.tur === "abonelik"
                          ? "abonelikler"
                          : "teslimatlar",
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
          if (haritadanSecim) return void haritadanSiteAc(nokta);
          // Onay bekleyen site varken dokunmak pini oraya taşır.
          if (siteOnizleme) {
            setSiteOnizleme((o) =>
              o ? { ...o, lat: nokta.lat, lng: nokta.lng } : o,
            );
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
          <SultanAmblem boyut={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-extrabold leading-tight">
              {kurye?.ad || "Kurye"}
              <span className="ml-1.5 font-bold text-gri">
                · {aktifTeslimatlar.length} teslimat
              </span>
            </p>
            <p className="truncate text-[10.5px] font-semibold text-gri">
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
              className="flex shrink-0 items-center gap-1 rounded-hap bg-turuncu/15 px-2 py-1 text-[10.5px] font-black text-turuncu"
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
            onClick={() => (bulucuAcik ? bulucuyuKapat() : bulucuyuAc())}
            aria-label="Adres bulucu"
            title="Adres bulucu — Sakarya siteleri"
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-hap px-2.5 text-[10.5px] font-black transition-colors ${
              bulucuAcik
                ? "bg-kurum text-white"
                : "bg-yuzey2 text-metin hover:bg-cizgi"
            }`}
          >
            <BinaSimgesi boyut={15} />
            <span className="hidden sm:inline">Adres bul</span>
          </button>
          {defterErisimi && (
            <ModGecisDugmesi
              hedef="defter"
              title="Bakkal defterine dön"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-hap bg-[#15803d] px-2.5 text-[11px] font-black text-white shadow-yumusak transition-transform active:scale-95"
            >
              <span className="text-[14px] leading-none">📒</span>
              <span className="hidden xs:inline">Defter</span>
            </ModGecisDugmesi>
          )}
          <button
            onClick={vardiyaDegistir}
            className={`rounded-hap px-3 py-1.5 text-[10.5px] font-black uppercase tracking-wide transition-colors ${
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
        onKatmanPaneli={(acik) => {
          setKatmanPaneli(acik);
          // Katman paneli alt panelin arkasında kalmasın.
          if (acik) setPanel("kapali");
        }}
        onKatman={(k) => setKatmanlar((o) => ({ ...o, [k]: !o[k] }))}
        zoomKilitli={zoomKilitli}
        onZoomKilidi={() => {
          const yeni = !zoomKilitli;
          setZoomKilitli(yeni);
          uyar(
            yeni
              ? "🔒 Yakınlaştırma kilitlendi"
              : "🔓 İki parmakla yakınlaştırma açık",
          );
        }}
      />

      {/* Rota özeti */}
      <AnimatePresence>
        {rota && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute left-3 right-[68px] top-[calc(env(safe-area-inset-top)+70px)] z-20 flex items-center gap-3 rounded-[20px] border border-kontrast/10 bg-kontrast/92 p-3 text-white shadow-yuzen backdrop-blur-xl"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kirmizi text-sm font-black">
              {rota.sira.length}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold">
                {mesafeYaz(rota.toplamMesafeM)} · {sureYaz(rota.toplamSureSn)}
              </p>
              <p className="text-[10.5px] font-semibold text-white/60">
                {rota.elle
                  ? "Elle sıralandı · kuş uçuşu tahmini"
                  : rota.motor === "osrm"
                    ? "Gerçek yol ağı üzerinde optimize edildi"
                    : "Kuş uçuşu + 2-opt ile optimize edildi"}
              </p>
            </div>
            <button
              onClick={rotayiUstlen}
              disabled={islemde}
              className="rounded-hap bg-kirmizi px-3.5 py-2 text-[11px] font-black disabled:opacity-60"
            >
              Üstlen
            </button>
            <button
              onClick={() => {
                setRota(null);
                setSiraDuzenle(false);
              }}
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

              <p className="text-[10.5px] font-black uppercase tracking-wider text-gri">
                {islemKayit.tur === "abonelik" ? "Abonelik" : "Teslimat"}
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
                <span className="flex-1 text-[13.5px] font-black">Düzenle</span>
                <span className="text-gri">›</span>
              </motion.button>

              {/*
                Kurye teslimat adresinde duruyor ve tarayıcı onu bambaşka bir
                yerde sanıyorsa (masaüstünde konum IP'den geliyor, VPN varsa
                büsbütün şaşıyor) en güvenilir bilgi zaten elimizde: gittiği
                adresin koordinatı. Haritada nokta aramaktan da isabetli.
              */}
              {kayitBilgisi(islemKayit).nokta && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const bilgi = kayitBilgisi(islemKayit);
                    if (bilgi.nokta) konumuBuradanAl(bilgi.nokta, bilgi.ad);
                    setIslemKayit(null);
                  }}
                  className="mt-2 flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2"
                >
                  <span className="text-xl leading-none">🧍</span>
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-black">
                      Buradayım
                    </span>
                    <span className="block text-[11px] text-gri">
                      Konumum bu adres olsun
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
                    <span className="block text-[13.5px] font-black">
                      Konumu düzelt
                    </span>
                    <span className="block text-[11px] text-gri">
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
                    <p className="text-[12.5px] font-bold text-kirmizi-koyu">
                      Bu kayıt kalıcı olarak silinecek. Emin misin?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setSilOnay(false)}
                        className="flex-1 rounded-hap bg-yuzey py-3 text-[12.5px] font-bold text-gri"
                      >
                        Vazgeç
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        disabled={islemde}
                        onClick={() => void kayitSil(islemKayit)}
                        className="flex-[2] rounded-hap bg-kirmizi py-3 text-[12.5px] font-black text-white disabled:opacity-60"
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
                      <span className="block text-[13.5px] font-black text-kirmizi">
                        Sil
                      </span>
                      {kayitBilgisi(islemKayit).teslimEdildi && (
                        <span className="block text-[11px] text-gri">
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
                className="mt-3 flex h-12 w-full items-center justify-center rounded-hap text-[12.5px] font-bold text-gri"
              >
                Kapat
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
            siteler={siteler}
            baslangicAdres={kayitAdresi}
            onKapat={() => {
              setKayitEkle(false);
              setDuzenlenen(null);
              setKayitAdresi(null);
            }}
            onEklendi={(kayit, mesaj) => {
              setKayitAdresi(null);
              kayitEklendi(kayit, mesaj);
            }}
          />
        )}
        {yonetimAcik && (
          <YonetimMenusu
            key="yonetim"
            sekmeAdi={SEKMELER.find((s) => s.anahtar === sekme)?.ad ?? ""}
            yontemler={yontemler}
            indiriliyor={indiriliyor}
            onExcelIndir={() => void excelIndir()}
            onTopluYukle={() => {
              setYonetimAcik(false);
              setTopluYukleme(true);
            }}
            onAdresOturt={() => {
              setYonetimAcik(false);
              setKonumTamamla(true);
            }}
            onTopluSec={() => {
              setYonetimAcik(false);
              if (gecmisGun) void gunuGoster(null);
              setSecimTuru("yonetim");
              setSecimModu(true);
              setBalonSecim(null);
              setSecilenler([]);
              setSeciliId(null);
              setPanel("yari");
            }}
            onYontemEkle={yontemEkle}
            onYontemKaldir={yontemKaldir}
            onKapat={() => setYonetimAcik(false)}
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
        bağlıyor; Yenile ölçümü baştan aldırıyor.
      */}
      <AnimatePresence>
        {/* Konum bir teslimat adresine sabitlendi. */}
        {sabitKonum && !konumDuzeltme && (
          <motion.div
            key="sabit-konum"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className="absolute left-3 right-[68px] top-[calc(env(safe-area-inset-top)+70px)] z-30 flex items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey/90 p-3 shadow-yumusak backdrop-blur-2xl"
          >
            <span className="text-lg">🧍</span>
            <p className="flex-1 text-[11px] font-bold leading-snug">
              Konumunuz teslimat adresine alındı.
              <span className="block font-semibold text-gri">
                GPS iyi sinyal bulunca kendiliğinden devralır.
              </span>
            </p>
            <button
              onClick={konumuYenidenBul}
              className="shrink-0 rounded-hap bg-yuzey2 px-3 py-1.5 text-[11px] font-black text-gri"
            >
              Yenile
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Adres bulucu */}
      <AnimatePresence>
        {bulucuAcik && !haritadanSecim && !navHedef && (
          <AdresBulucu
            key="adres-bulucu"
            kayitlilar={siteler}
            merkez={bulucuMerkezi}
            onizleme={siteOnizleme}
            onOnizle={siteyiOnizle}
            onOnizlemeGuncelle={(yama) =>
              setSiteOnizleme((o) => (o ? { ...o, ...yama } : o))
            }
            secili={seciliSite}
            onSec={siteSec}
            haritadanSecim={haritadanSecim}
            onHaritadanSecim={(acik) => {
              setHaritadanSecim(acik);
              setSiteOnizleme(null);
              setSeciliSiteId(null);
            }}
            kullaniciId={kurye?.id ?? null}
            islemde={islemde}
            onOnayla={(aday) => void siteyiOnayla(aday)}
            onSil={(site) => void siteyiKaldir(site)}
            onGit={(n) => bulucuyaUc(n, true, 18)}
            onKayitAc={siteyeKayitAc}
            onGoogleEsle={(a) => void googleIleEsle(a)}
            db={db}
            abonelikler={abonelikler}
            onAboneliklerDegisti={listeleriTazele}
            onKapat={bulucuyuKapat}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {haritadanSecim && (
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+70px)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-[20px] bg-kurum p-3 text-white shadow-yuzen"
          >
            <span className="text-lg">🏘️</span>
            <p className="flex-1 text-[12px] font-bold">
              Eklemek istediğin sitenin girişine dokun.
            </p>
            <button
              onClick={() => setHaritadanSecim(false)}
              className="rounded-hap bg-yuzey/20 px-3 py-1.5 text-[11px] font-black"
            >
              Vazgeç
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
            className="absolute left-3 right-[68px] top-[calc(env(safe-area-inset-top)+70px)] z-30 flex items-center gap-3 rounded-[20px] bg-kirmizi p-3 text-white shadow-kirmizi"
          >
            <span className="text-lg">📍</span>
            <p className="flex-1 text-[12px] font-bold">
              Doğru konumu haritada işaretleyin.
            </p>
            <button
              onClick={() => setKonumDuzeltme(null)}
              className="rounded-hap bg-yuzey/20 px-3 py-1.5 text-[11px] font-black"
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
            className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-40 mx-auto max-w-xl rounded-[22px] bg-kontrast p-2 text-white shadow-yuzen"
          >
            {/* Üst satır: sayaç, tümünü seç, kapat */}
            <div className="flex items-center gap-2 pl-2">
              <p className="min-w-0 flex-1 truncate text-[12px] font-extrabold">
                {secilenler.length} / {gorunurKimlikler.length}{" "}
                {sekme === "teslimatlar" ? "durak" : "kayıt"} seçildi
              </p>
              <button
                onClick={tumunuSecDegistir}
                disabled={gorunurKimlikler.length === 0}
                className="min-h-10 rounded-hap bg-yuzey/10 px-3 text-[11px] font-black disabled:opacity-50"
              >
                {tumuSecili ? "Seçimi kaldır" : "Tümünü seç"}
              </button>
              <button
                onClick={() => {
                  setSecimModu(false);
                  setSecilenler([]);
                }}
                aria-label="Seçimden çık"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yuzey/10 text-[16px] leading-none"
              >
                ×
              </button>
            </div>
            {/* Alt satır: eylemler */}
            <div className="mt-2 flex gap-2">
              {secimTuru === "yonetim" && (
              <>
              <button
                onClick={() => setTopluSilOnay(true)}
                disabled={secilenler.length === 0 || islemde}
                className="min-h-11 flex-1 rounded-hap bg-yuzey/10 px-3 text-[11px] font-black text-[#ff8a93] disabled:opacity-50"
              >
                🗑 Sil{secilenler.length > 0 ? ` (${secilenler.length})` : ""}
              </button>
              <button
                onClick={() => void excelIndir()}
                disabled={indiriliyor || secilenler.length === 0}
                className="min-h-11 flex-1 rounded-hap bg-yuzey/10 px-3 text-[11px] font-black disabled:opacity-50"
              >
                {indiriliyor ? "…" : "Excel"}
              </button>
              </>
              )}
              {sekme === "teslimatlar" && (
                <button
                  onClick={rotayiOlustur}
                  disabled={rotaHesapla || secilenler.length < 2}
                  className="min-h-11 flex-[1.3] rounded-hap bg-kirmizi px-3 text-[11px] font-black disabled:opacity-50"
                >
                  {rotaHesapla ? "Hesaplanıyor…" : "En kısa yol"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toplu silme onayı */}
      <AnimatePresence>
        {topluSilOnay && secimModu && secilenler.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !islemde && setTopluSilOnay(false)}
            className="absolute inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-label="Toplu silme onayı"
              className="w-full max-w-xl rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
            >
              <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />
              <p className="text-[10.5px] font-black uppercase tracking-wider text-gri">
                {SEKMELER.find((s) => s.anahtar === sekme)?.ad}
              </p>
              <h2 className="mt-0.5 text-xl font-extrabold tracking-tight">
                {tumuSecili
                  ? `Listenin tamamı silinsin mi? (${secilenler.length})`
                  : `${secilenler.length} kayıt silinsin mi?`}
              </h2>
              <p className="mt-2 text-[12px] font-semibold leading-snug text-gri">
                Kayıtlar kalıcı olarak silinir, geri alınamaz.
                {sekme === "teslimatlar" &&
                  " Teslim edilmiş siparişler tahsilat kaydına bağlı olduğu için silinmez, listede kalır."}
                {sekme === "abonelikler" &&
                  " Bu aboneliklerden daha önce üretilmiş siparişler silinmez."}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setTopluSilOnay(false)}
                  disabled={islemde}
                  className="min-h-12 flex-1 rounded-hap bg-yuzey2 text-[12.5px] font-bold text-gri"
                >
                  Vazgeç
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void secilenleriSil()}
                  disabled={islemde}
                  className="min-h-12 flex-[2] rounded-hap bg-kirmizi text-[12.5px] font-black text-white disabled:opacity-60"
                >
                  {islemde ? "Siliniyor…" : "Evet, sil"}
                </motion.button>
              </div>
            </motion.div>
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
            className={`absolute inset-x-0 bottom-32 z-50 mx-auto flex w-fit items-center gap-3 rounded-hap bg-kontrast py-2.5 pl-4 text-[12px] font-bold text-white shadow-yuzen ${
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
                className="rounded-hap bg-yuzey/15 px-3 py-1.5 text-[11px] font-black"
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
            onKapat={() => {
              if (!zorunluTeslim) setTeslimModu(null);
            }}
            onOnay={teslimSonucuUygula}
            zorunlu={zorunluTeslim?.id === secili.id && teslimModu === "teslim"}
            onGeriAl={zorunluTeslimiGeriAl}
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
            toplamMesafeM={yolOzeti.m}
            toplamSureSn={yolOzeti.sn}
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
              const hedef = navHedef;
              navigasyonuKapat();
              // Hedefe varıldı: pin yeşile döner, ödeme bilgisi zorunlu.
              teslimFormuAc(hedef, true);
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
        tamEkran={tamEkran}
        onTamEkran={(acik) => {
          if (acik === tamEkran) return;
          // Ses ayarı navigasyondaki sesle ortak: kurye sesi kapattıysa sessiz.
          if (sesAcik) void kaydirmaSesi(acik);
          setTamEkran(acik);
          // Abonelik ayrıntısı yalnızca tam ekranda; kapanınca liste kalsın.
          if (!acik) setSeciliAbonelikId(null);
        }}
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
                    setSeciliAbonelikId(null);
                    // Seçim kimlikleri sekmeye özel; karışmasın diye sıfırlanıyor.
                    setSecilenler([]);
                    setArama("");
                    // Tam ekrandayken sekme değiştirmek tam ekranı kapatmasın.
                    if (panel === "kapali" && !tamEkran) setPanel("acik");
                  }}
                  className={`relative shrink-0 rounded-hap px-3.5 py-2 text-[12px] font-bold transition-colors ${
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
                setDuzenlenen(null);
                setKayitEkle(true);
              }}
              aria-label="Yeni kayıt ekle"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kirmizi text-[18px] font-black leading-none text-white shadow-yumusak"
            >
              +
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                setYonetimAcik(true);
              }}
              aria-label="Yönetim"
              title="Yönetim — Excel, toplu işlemler, ödeme yöntemleri"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[15px] font-black text-gri"
            >
              ⚙
            </motion.button>
            {sekme === "teslimatlar" && !gecmisGun && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSecimTuru("rota");
                setSiraDuzenle(false);
                setSecimModu((o) => !o);
                setBalonSecim(null);
                setSecilenler([]);
                setSeciliId(null);
                setPanel("yari");
              }}
              className={`shrink-0 rounded-hap px-3 py-2 text-[11px] font-black transition-colors ${
                secimModu
                  ? "bg-kirmizi text-white"
                  : "bg-kirmizi-sis text-kirmizi-koyu"
              }`}
            >
              {/* Dar ekranda tek kelime; sekme şeridine yer kalsın. */}
              <span className="hidden xs:inline">Rota seç</span>
              <span className="xs:hidden">Seç</span>
            </button>
            )}
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
              onFotoGetir={() => teslimFotosuBagla(db, secili.id)}
              onKonumDuzelt={() => {
                setKonumDuzeltme(secili.adres?.id ?? null);
                setPanel("kapali");
              }}
            />
          ) : seciliAbonelik && tamEkran && !secimModu ? (
            <AbonelikDetay
              key={`abonelik-${seciliAbonelik.id}`}
              abonelik={seciliAbonelik}
              bugun={bugunAbonelikler.some((b) => b.id === seciliAbonelik.id)}
              bugunkuTeslimat={
                teslimatlar.find((t) => t.abonelik_id === seciliAbonelik.id) ??
                null
              }
              kuryeKonumu={kuryeKonumu}
              onKapat={() => setSeciliAbonelikId(null)}
              onHaritada={() => {
                const a = seciliAbonelik;
                if (a.adres?.lat == null) return;
                haritaApi.current?.ucur({ lat: a.adres.lat, lng: a.adres.lng! });
                setPanel("kapali");
              }}
              onTeslimatAc={(id) => {
                setSekme("teslimatlar");
                pinSecildi(id);
              }}
              onDuzenle={() => {
                setDuzenlenen({ tur: "abonelik", abonelik: seciliAbonelik });
                setKayitEkle(true);
              }}
              onIslemler={() =>
                setIslemKayit({ tur: "abonelik", abonelik: seciliAbonelik })
              }
              onKonumDuzelt={() => {
                setKonumDuzeltme(seciliAbonelik.adres?.id ?? null);
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
              className="space-y-1 pb-6 pt-1"
            >
              {sekme === "teslimatlar" && (
                <>
                  <div className="sticky top-0 z-10 -mt-1 space-y-1.5 bg-yuzey pb-1.5 pt-1">
                    {/* Gün gezinme + liste kipleri */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => gunKaydir(-1)}
                        aria-label="Önceki gün"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[14px] font-black text-gri"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => void gunuGoster(null)}
                        className={`h-8 min-w-0 shrink rounded-hap px-3 text-[12px] font-black ${
                          gecmisGun ? "bg-turuncu/15 text-turuncu" : "bg-yuzey2"
                        }`}
                        title={gecmisGun ? "Bugüne dön" : undefined}
                      >
                        {gecmisYukleniyor ? "…" : gunEtiketi(gecmisGun)}
                      </button>
                      <button
                        onClick={() => gunKaydir(1)}
                        disabled={!gecmisGun}
                        aria-label="Sonraki gün"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[14px] font-black text-gri disabled:opacity-30"
                      >
                        ›
                      </button>
                      <span className="flex-1" />
                      {rota && !gecmisGun && (
                        <button
                          onClick={() => {
                            setSiraDuzenle((o) => !o);
                            setHizliListe(false);
                            setSecimModu(false);
                            setDurumSuzgec("acik");
                          }}
                          className={`h-8 shrink-0 rounded-hap px-2.5 text-[11px] font-black ${
                            siraDuzenle ? "bg-kontrast text-white" : "bg-yuzey2 text-gri"
                          }`}
                        >
                          ↕ Sıra
                        </button>
                      )}
                      {!gecmisGun && (
                        <button
                          onClick={() => {
                            setHizliListe((o) => !o);
                            setSiraDuzenle(false);
                            setSecimModu(false);
                            setDurumSuzgec("acik");
                          }}
                          title="Günlük dağıtım listesi: her satırda ✓ teslim et, ⤼ atla"
                          className={`h-8 shrink-0 rounded-hap px-2.5 text-[11px] font-black ${
                            hizliListe ? "bg-yesil text-white" : "bg-yuzey2 text-gri"
                          }`}
                        >
                          ⚡ Hızlı liste
                        </button>
                      )}
                    </div>

                    {/* Arama */}
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-gri">
                        🔎
                      </span>
                      <input
                        value={arama}
                        onChange={(e) => setArama(e.target.value)}
                        placeholder="Ad, telefon ya da adres"
                        className="h-9 w-full rounded-xl border border-cizgi bg-yuzey2 pl-9 pr-9 text-[12.5px] font-semibold outline-none placeholder:font-medium placeholder:text-gri focus:border-kirmizi"
                      />
                      {arama && (
                        <button
                          onClick={() => setArama("")}
                          aria-label="Aramayı temizle"
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[13px] font-black text-gri"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Durum süzgeci */}
                    <div className="ince-kaydirma flex gap-1 overflow-x-auto">
                      {DURUM_SUZGECLERI.map((d) => (
                        <button
                          key={d.anahtar}
                          onClick={() => setDurumSuzgec(d.anahtar)}
                          className={`h-7 shrink-0 rounded-hap px-2.5 text-[11px] font-bold ${
                            durumSuzgec === d.anahtar
                              ? "bg-kontrast text-white"
                              : "bg-yuzey2 text-gri"
                          }`}
                        >
                          {d.ad} · {suzgecSayilari[d.anahtar]}
                        </button>
                      ))}
                    </div>

                    {hizliListe && (
                      <p className="px-1 text-[10.5px] font-semibold text-gri">
                        ✓ planlanan ödemeyle teslim eder (tutarın tamamı) · ⤼ bugün
                        atlar · ikisi de 6 sn geri alınabilir
                      </p>
                    )}
                  </div>

                  {/* Tek kart içinde ince çizgilerle ayrılmış satırlar */}
                  {siraliTeslimatlar.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-cizgi divide-y divide-cizgi bg-yuzey">
                  {siraliTeslimatlar.map((s) => {
                    const rotaIndeks = rota?.sira.indexOf(s.id) ?? -1;
                    return (
                    <TeslimatSatiri
                      key={s.id}
                      siparis={s}
                      hizli={
                        hizliListe && !gecmisGun
                          ? {
                              onTeslim: () => void hizliTeslim(s),
                              onAtla: () => void hizliAtla(s),
                            }
                          : undefined
                      }
                      sirala={
                        siraDuzenle && rota && rotaIndeks >= 0
                          ? {
                              onYukari:
                                rotaIndeks > 0
                                  ? () => durakTasi(s.id, -1)
                                  : undefined,
                              onAsagi:
                                rotaIndeks < rota.sira.length - 1
                                  ? () => durakTasi(s.id, 1)
                                  : undefined,
                            }
                          : undefined
                      }
                      sira={gecmisGun ? undefined : rotaSirasi.get(s.id)}
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
                    );
                  })}
                  </div>
                  )}
                  {siraliTeslimatlar.length === 0 && !gecmisYukleniyor && (
                    <Bos
                      mesaj={
                        gunTeslimatlari.length === 0
                          ? gecmisGun
                            ? "O gün teslimat yok."
                            : "Bugün için teslimat yok."
                          : "Bu süzgece uyan teslimat yok."
                      }
                    />
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
                  {suzulmusAbonelikler.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-cizgi divide-y divide-cizgi bg-yuzey">
                  {suzulmusAbonelikler.slice(0, AZAMI_SATIR).map((a) => (
                    <AbonelikSatiri
                      key={a.id}
                      abonelik={a}
                      bugun={bugunAbonelikler.some((b) => b.id === a.id)}
                      secimModu={secimModu}
                      isaretli={secilenler.includes(a.id)}
                      onTikla={() => {
                        if (secimModu) return secimDegistir(a.id);
                        // Tam ekranda ayrıntı yine tam ekranda açılır.
                        if (tamEkran) return setSeciliAbonelikId(a.id);
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
                  </div>
                  )}
                  {suzulmusAbonelikler.length > AZAMI_SATIR && (
                    <p className="px-1 pt-1 text-[11px] font-semibold text-gri">
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
