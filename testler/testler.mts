/**
 * Saf mantık testleri — tarayıcıya ihtiyaç duymayan her şey.
 * Çalıştırma: node --experimental-strip-types --no-warnings testler.mts
 */
import {
  DURUM_ETIKET,
  adresYaz,
  binaAnahtari,
  bugununTarihi,
  gecikmeDk,
  gecikmeYaz,
  gunlerYaz,
  miktarYaz,
  odemeAdi,
  para,
  paraAlinirMi,
  saat,
} from "../src/lib/bicim.ts";
import { adresAdaylari } from "../src/lib/adres.ts";
import { haversine, mesafeYaz, sureYaz, yerelRotaCoz } from "../src/lib/rota.ts";
import {
  SAPMA_ESIGI_M,
  hizaGoreSirala,
  kalanlar,
  manevrayiCevir,
  rotayaUzaklik,
  siradakiAdim,
  varisSaati,
} from "../src/lib/navigasyon.ts";
import { MARKET, acilisDakikasi, marketAcikMi } from "../src/lib/market.ts";
import { kayitTutari, yontemKodu } from "../src/lib/veri.ts";
import {
  aboneDefteriCoz,
  aboneSayfasiMi,
  adSutunuBul,
  cizelgeSayfasiMi,
  csvAyristir,
  dosyayiCoz,
  gunleriCoz,
  saatCoz,
  satirlariCikar,
} from "../src/lib/toplu.ts";
import { abonelikleriYaz, aboneSablonu, gunleriYaz } from "../src/lib/excel.ts";
import {
  GoogleOturumHatasi,
  googleHataMetni,
  googleStilKurallari,
  googleTemelStili,
  karoAdresi,
  oturumGecerliMi,
} from "../src/lib/google-karo.ts";
import { PALETLER } from "../src/lib/harita-stili.ts";

let gecti = 0;
const kaldi: string[] = [];

function bekle(baslik: string, kosul: boolean, ek = "") {
  if (kosul) gecti++;
  else kaldi.push(`${baslik} ${ek}`);
}

function bolum(ad: string) {
  console.log(`\n— ${ad} —`);
}

/* ------------------------------------------------------------------ */
bolum("Biçimlendirme");

bekle("para tr-TR", para(1234.5).includes("1.234,50"), `-> ${para(1234.5)}`);
bekle("para sıfır", para(0).includes("0,00"), `-> ${para(0)}`);
bekle("saat kısaltma", saat("08:30:00") === "08:30", `-> ${saat("08:30:00")}`);
bekle("saat boş", saat(null) === "—");
bekle("miktar tam sayı", miktarYaz(3, "adet") === "3 adet");
bekle("miktar ondalık", miktarYaz(2.5, "kg") === "2,5 kg", `-> ${miktarYaz(2.5, "kg")}`);
bekle("günler tümü", gunlerYaz([1, 2, 3, 4, 5, 6, 7]) === "Her gün");
bekle("günler seçili", gunlerYaz([1, 3, 5]) === "Pzt, Çar, Cum", `-> ${gunlerYaz([1, 3, 5])}`);
bekle("günler boş", gunlerYaz([]) === "—");
bekle("durum etiketi", DURUM_ETIKET.basarisiz === "Teslim edilemedi");

bekle("gecikme 12 dk", gecikmeYaz(12) === "12 dk", `-> ${gecikmeYaz(12)}`);
bekle("gecikme 2 sa", gecikmeYaz(120) === "2 sa", `-> ${gecikmeYaz(120)}`);
bekle("gecikme dünden", gecikmeYaz(1440) === "dünden", `-> ${gecikmeYaz(1440)}`);

bekle(
  "adres tek satır",
  adresYaz({ adres_metni: "Orhangazi Sok.", bina: "14", kat: "1", daire: "2" }) ===
    "Orhangazi Sok. · No 14 · Kat 1 · D. 2",
  `-> ${adresYaz({ adres_metni: "Orhangazi Sok.", bina: "14", kat: "1", daire: "2" })}`,
);
bekle(
  "adres eksiz",
  adresYaz({ adres_metni: "Çark Cad." }) === "Çark Cad.",
);

bekle(
  "bina anahtarı sokak+bina",
  binaAnahtari({ adres_metni: "Papatya  Sok.", bina: "118" }) === "papatya sok.|118",
  `-> ${binaAnahtari({ adres_metni: "Papatya  Sok.", bina: "118" })}`,
);
bekle(
  "bina anahtarı koordinat",
  binaAnahtari({ adres_metni: "X", lat: 40.78067, lng: 30.35218 }) === "40.7807|30.3522",
  `-> ${binaAnahtari({ adres_metni: "X", lat: 40.78067, lng: 30.35218 })}`,
);
bekle("bina anahtarı boş", binaAnahtari(null) === "");

bekle("bugünün tarihi biçimi", /^\d{4}-\d{2}-\d{2}$/.test(bugununTarihi()), bugununTarihi());

/* ------------------------------------------------------------------ */
bolum("Ödeme");

const yontemler = [
  { kod: "nakit", ad: "Nakit", para_alinir: true, sira: 10, aktif: true },
  { kod: "havale", ad: "Havale", para_alinir: false, sira: 20, aktif: true },
];
bekle("yöntem adı tablodan", odemeAdi("havale", yontemler) === "Havale");
bekle("yöntem adı yedekten", odemeAdi("veresiye") === "Veresiye");
bekle("yöntem adı bilinmeyen", odemeAdi("zzz") === "zzz");
bekle("yöntem adı boş", odemeAdi(null) === "—");
bekle("para alınır", paraAlinirMi("nakit", yontemler) === true);
bekle("para alınmaz", paraAlinirMi("havale", yontemler) === false);
bekle("para alınmaz yedek", paraAlinirMi("veresiye") === false);
bekle("para alınır yedek", paraAlinirMi("kredi_karti") === true);

bekle("kod türetme", yontemKodu("Yemek Kartı") === "yemek_karti", `-> ${yontemKodu("Yemek Kartı")}`);
bekle("kod türetme Türkçe", yontemKodu("Çeşitli Ödeme") === "cesitli_odeme", `-> ${yontemKodu("Çeşitli Ödeme")}`);
bekle("kod boşsa", yontemKodu("!!!") === "yontem", `-> ${yontemKodu("!!!")}`);

bekle("tutar kalemlerden", kayitTutari({ tutar: 5, kalemler: [{ miktar: 2, urun: { fiyat: 10 } }] }) === 20);
bekle("tutar sabitten", kayitTutari({ tutar: 147.5, kalemler: [] }) === 147.5);
bekle("tutar yok", kayitTutari({}) === 0);

/* ------------------------------------------------------------------ */
bolum("Gecikme ve açılış saati");

bekle("açılış dakikası", acilisDakikasi() === 7 * 60 + 30, `-> ${acilisDakikasi()}`);
bekle("market adı", MARKET.ad === "Sultan Market");
bekle("market konumu Sakarya", Math.abs(MARKET.nokta.lat - 40.7784889) < 0.001 && Math.abs(MARKET.nokta.lng - 30.3518378) < 0.001);
bekle("market açık mı bool", typeof marketAcikMi() === "boolean");

const bugun = bugununTarihi();
const dun = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const yarin = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
bekle("saat yoksa null", gecikmeDk(null, bugun) === null);
bekle("ileri tarih null", gecikmeDk("08:30:00", yarin) === null);
const acikMi = marketAcikMi();
bekle(
  "market kapalıyken gecikme yok",
  acikMi ? true : gecikmeDk("08:30:00", bugun) === null,
);
bekle(
  "dünkü teslimat 24 saat geç",
  acikMi ? gecikmeDk("08:30:00", dun) === 1440 : gecikmeDk("08:30:00", dun) === null,
);

/* ------------------------------------------------------------------ */
bolum("Adres normalleştirme");

const a1 = adresAdaylari("Tığcılar mahallesi Kol sokak no 6 daire 8 filiz apartman SAKARYA/ADAPAZARI");
bekle("kapı/daire atıldı", !a1[0].includes("no 6") && !a1[0].includes("daire 8"), a1[0]);
bekle("sokak adayı üretildi", a1.some((x) => x.startsWith("Kol sokak")), a1.join(" | "));
bekle("mahalle adayı üretildi", a1.some((x) => x.startsWith("Tığcılar mahallesi,")), a1.join(" | "));
const a2 = adresAdaylari("Arabacıalanı Mah. Orhangazi Sok. No 14 Kat 1 D. 2, Serdivan");
bekle("kısaltma açıldı", a2[0].includes("mahallesi") && a2[0].includes("sokak"), a2[0]);
bekle("nokta artığı yok", !a2[0].includes("mahallesi."), a2[0]);
bekle("il eklendi", a2[0].includes("Sakarya"), a2[0]);
bekle("en fazla 4 aday", adresAdaylari("Yeni Mahalle").length <= 4);
bekle("boş adres boş liste", adresAdaylari("   ").length === 0);
bekle(
  "yalnız il adayı üretilmiyor",
  adresAdaylari("Tığcılar mahallesi Kol sokak SAKARYA/ADAPAZARI").every(
    (x) => x.toLocaleLowerCase("tr") !== "adapazari" && x !== "Sakarya",
  ),
  adresAdaylari("Tığcılar mahallesi Kol sokak SAKARYA/ADAPAZARI").join(" | "),
);
bekle(
  "sadece mahalle yazılınca tek aday",
  adresAdaylari("Yeni Mahalle").length === 1,
  adresAdaylari("Yeni Mahalle").join(" | "),
);

/* ------------------------------------------------------------------ */
bolum("Rota");

const market = { lat: 40.78067, lng: 30.35218 };
const uzak = { lat: 40.7841, lng: 30.4055 };
const m = haversine(market, uzak);
bekle("haversine makul", m > 4000 && m < 5500, `-> ${Math.round(m)} m`);
bekle("aynı nokta sıfır", haversine(market, market) === 0);
bekle("mesafe yazımı km", mesafeYaz(4500).includes("4,5"), mesafeYaz(4500));
bekle("mesafe yazımı m", mesafeYaz(320).includes("320"), mesafeYaz(320));
bekle("süre yazımı", sureYaz(3900).length > 0, sureYaz(3900));

const duraklar = [
  { id: "a", nokta: { lat: 40.7825, lng: 30.354 } },
  { id: "b", nokta: { lat: 40.7789, lng: 30.3495 } },
  { id: "c", nokta: { lat: 40.7841, lng: 30.4055 } },
  { id: "d", nokta: { lat: 40.7702, lng: 30.3567 } },
];
const rota = yerelRotaCoz(market, duraklar);
bekle("rota tüm durakları kapsıyor", rota.sira.length === 4, `-> ${rota.sira.length}`);
bekle("rota kimlikleri eşsiz", new Set(rota.sira).size === 4);
bekle("rota mesafesi pozitif", rota.toplamMesafeM > 0);
bekle("rota süresi pozitif", rota.toplamSureSn > 0);
bekle("rota motoru yerel", rota.motor === "yerel");
bekle("geometri market ile başlıyor", Math.abs(rota.geometri[0][1] - market.lat) < 1e-6);
bekle("tek durak", yerelRotaCoz(market, [duraklar[0]]).sira.length === 1);
bekle("duraksız rota", yerelRotaCoz(market, []).sira.length === 0);

/* ------------------------------------------------------------------ */
bolum("Navigasyon");

const adimlar = [
  { tarif: "Orhangazi Sok.'a çık", manevra: "cikis" as const, mesafeM: 120, nokta: { lat: 40.7807, lng: 30.3522 }, yol: "Orhangazi Sok." },
  { tarif: "Sağa dön", manevra: "sag" as const, mesafeM: 800, nokta: { lat: 40.7815, lng: 30.356 }, yol: "Atatürk Cad." },
  { tarif: "Vardınız", manevra: "varis" as const, mesafeM: 0, nokta: { lat: 40.7825, lng: 30.354 }, yol: "" },
];
const secenek = {
  id: "r1",
  ad: "En hızlı",
  mesafeM: 920,
  sureSn: 150,
  geometri: [[30.3522, 40.7807], [30.356, 40.7815], [30.354, 40.7825]] as [number, number][],
  adimlar,
  motor: "osrm" as const,
};

bekle("uzaktayken ilk adımda kalır", siradakiAdim(adimlar, 0, { lat: 40.79, lng: 30.30 }) === 0, `-> ${siradakiAdim(adimlar, 0, { lat: 40.79, lng: 30.3 })}`);
bekle(
  "manevraya yaklaşınca ilerler",
  siradakiAdim(adimlar, 0, { lat: 40.7807, lng: 30.3522 }) >= 1,
  `-> ${siradakiAdim(adimlar, 0, { lat: 40.7807, lng: 30.3522 })}`,
);
bekle("son adımı aşmaz", siradakiAdim(adimlar, 9, { lat: 40.7825, lng: 30.354 }) === adimlar.length - 1);

const kalan = kalanlar(secenek, 1, null);
bekle("kalan mesafe adımlardan", kalan.mesafeM === 800, `-> ${kalan.mesafeM}`);
bekle("kalan süre oranlı", kalan.sureSn > 0 && kalan.sureSn <= secenek.sureSn, `-> ${kalan.sureSn}`);
const kalanSon = kalanlar(secenek, 2, { lat: 40.7824, lng: 30.3539 });
bekle("adım bitince kuş uçuşuna düşer", kalanSon.mesafeM >= 0, `-> ${kalanSon.mesafeM}`);

const mSag = manevrayiCevir({ type: "turn", modifier: "right" }, "Atatürk Cad.");
bekle("manevra sağ", mSag.manevra === "sag", `-> ${mSag.manevra}`);
bekle("manevra tarifi yol adını içeriyor", mSag.tarif.includes("Atatürk Cad."), mSag.tarif);
const mVaris = manevrayiCevir({ type: "arrive" }, "");
bekle("manevra varış", mVaris.manevra === "varis", `-> ${mVaris.manevra}`);
const mCikis = manevrayiCevir({ type: "depart", modifier: "straight" }, "Orhangazi Sok.");
bekle("manevra çıkış", mCikis.manevra === "cikis", `-> ${mCikis.manevra}`);
const mGobek = manevrayiCevir({ type: "roundabout", exit: 2 }, "Çark Cad.");
bekle("göbek çıkışı numaralı", mGobek.tarif.includes("2. çıkış"), mGobek.tarif);
bekle("varış saati biçimi", /^\d{2}:\d{2}$/.test(varisSaati(1800)), varisSaati(1800));

/* ------------------------------------------------------------------ */
bolum("Excel / CSV");

const csv = [
  "Ad;Telefon;Adres;Bina;Kat;Daire;Lat;Lng",
  'Ayşe Yıldırım;0532 118 4471;"Orhangazi Sok., Arabacıalanı";14;1;2;40,7825;30,3540',
  "Mehmet Korkmaz;;Atatürk Cad.;61;;;;",
  ";;Adsız;;;;;",
].join("\n");
const c = satirlariCikar(csvAyristir(csv));
bekle("csv çözüldü", c.tamam === true);
if (c.tamam) {
  bekle("2 geçerli 1 hatalı", c.gecerli === 2 && c.hatali === 1, `-> ${c.gecerli}/${c.hatali}`);
  bekle("tırnak korundu", c.satirlar[0].adres_metni === "Orhangazi Sok., Arabacıalanı");
  bekle("virgüllü koordinat", c.satirlar[0].lat === 40.7825 && c.satirlar[0].lng === 30.354);
  bekle("yarım koordinat yok sayıldı", c.satirlar[1].lat === null);
  bekle("hata işaretlendi", c.satirlar[2].hata === "Ad boş");
}
const bos = satirlariCikar(csvAyristir("Ad;Adres"));
bekle("kayıtsız dosya reddedildi", bos.tamam === false);
const yanlisBaslik = satirlariCikar(csvAyristir("Foo;Bar\n1;2"));
bekle("başlıksız dosya reddedildi", yanlisBaslik.tamam === false);
const bozuk = await dosyayiCoz("x.xlsx", Buffer.from("bu excel degil"));
bekle("bozuk xlsx reddedildi", bozuk.tamam === false);

/* ------------------------------------------------------------------ */
bolum("Abone defteri");

bekle("gün adı tam yazılmış", gunleriCoz("PAZARTESİ").join() === "1");
bekle("gün adı kısaltılmış", gunleriCoz("P.TESİ").join() === "1" && gunleriCoz("P.TSİ").join() === "1");
bekle("perşembe", gunleriCoz("PERŞEMBE ").join() === "4");
bekle("çoklu gün & ile", gunleriCoz("PERŞEMBE&P.TSİ").join() === "1,4");
bekle("cumartesi cuma ile karışmıyor", gunleriCoz("CUMARTESİ").join() === "6" && gunleriCoz("CUMA").join() === "5");
bekle("pazar pazartesi ile karışmıyor", gunleriCoz("PAZAR").join() === "7");
bekle("tanınmayan gün atlanıyor", gunleriCoz("HERGÜN").length === 0);
bekle("boş gün", gunleriCoz("").length === 0 && gunleriCoz(null).length === 0);

bekle("saat çözümü", saatCoz("8:30") === "08:30" && saatCoz("08:30:00") === "08:30");
bekle("geçersiz saat", saatCoz("abc") === null && saatCoz("99:99") === null);

bekle("abone sayfası tanındı", aboneSayfasiMi(["ABONE NO", "", "TEL", "ADRES"]));
bekle("çizelge sayfası tanındı", cizelgeSayfasiMi(["ABONE NO", "GÜN", "SÜT", "YUMURTA"]));
bekle("müşteri sayfası abone sanılmıyor", !aboneSayfasiMi(["Ad", "Telefon", "Adres"]));

bekle(
  "başlıksız ad sütunu içeriğinden bulundu",
  adSutunuBul(["ABONE NO", "", "TEL", "ADRES"], [["0", "ELİF EKİCİ", "533", "X"], ["1", "LEYLA", "533", "Y"]], new Set([0, 2, 3])) === 1,
);
bekle(
  "tek harfli artık sütun ad sanılmıyor",
  adSutunuBul(["ABONE NO", "ADRES", ""], [["0", "X", ""], ["1", "Y", ""], ["2", "Z", "T"]], new Set([0, 1])) === undefined,
);

const defter = aboneDefteriCoz([
  {
    ad: "SERVİS",
    satirlar: [
      ["ABONE NO", "", "TEL", "ADRES"],
      ["0", "ELİF EKİCİ", "533 591 91 80", "ÜNBAY KONAKLARI MB BLOK D:1"],
      ["1", "", "533 777 4358", "ÇİĞDEM EVLER B BLOK D:3"],
      ["2", "İSMAİL GÖKÇE", "", ""],
    ],
  },
  {
    ad: "SÜT",
    satirlar: [
      ["ABONE NO", "GÜN", "SÜT", "YUMURTA", "KAR", "NOT"],
      ["0", "P.TESİ", "5", "0", "2.5", "her hafta"],
      ["0", "PERŞEMBE", "2", "", "", ""],
      ["1", "PERŞEMBE&P.TSİ", "3", "1", "1.5", ""],
      ["TOPLAM", "", "10", "", "4", ""],
      ["YOK BÖYLE BİRİ", "PAZAR", "1", "", "", ""],
    ],
  },
]);
if (!defter.tamam) {
  bekle("defter çözüldü", false, defter.hata);
} else {
  bekle("biçim abone", defter.bicim === "abone");
  bekle("3 abone satırı", defter.satirlar.length === 3, `-> ${defter.satirlar.length}`);
  bekle("adres boş olan atlanıyor", defter.hatali === 1 && defter.gecerli === 2);
  bekle("3 abonelik kuruldu", defter.abonelik === 3, `-> ${defter.abonelik}`);
  bekle("adı boş abone numarasıyla anıldı", defter.satirlar[1].ad === "Abone 1", `-> ${defter.satirlar[1].ad}`);
  const ilk = defter.satirlar[0];
  bekle("ilk abonenin iki aboneliği var", ilk.abonelikler.length === 2);
  bekle("gün çözüldü", ilk.abonelikler[0].gunler.join() === "1");
  bekle("kalem miktarı okundu", ilk.abonelikler[0].kalemler.length === 1 && ilk.abonelikler[0].kalemler[0].miktar === 5, JSON.stringify(ilk.abonelikler[0].kalemler));
  bekle("sıfır miktar kalem sayılmıyor", !ilk.abonelikler[0].kalemler.some((k) => k.ad === "YUMURTA"));
  bekle("kâr sütunu ürün sayılmıyor", !ilk.abonelikler[0].kalemler.some((k) => k.ad === "KAR"));
  bekle("not okundu", ilk.abonelikler[0].not === "her hafta");
  bekle("TOPLAM satırı atlandı", !defter.satirlar.some((r) => r.abonelikler.some((p) => p.kalemler.some((k) => k.miktar === 10))));
  bekle("eşleşmeyen çizelge satırı uyarı verdi", defter.uyarilar.length === 1 && defter.uyarilar[0].includes("1 çizelge"), JSON.stringify(defter.uyarilar));
  const ikinci = defter.satirlar[1];
  bekle("çoklu gün aboneliği", ikinci.abonelikler[0]?.gunler.join() === "1,4");
  // Çizelgede satırı olmayan abone de abonelikler listesine giriyor.
  const plansiz = aboneDefteriCoz([
    {
      ad: "SERVİS",
      satirlar: [
        ["ABONE NO", "", "TEL", "ADRES"],
        ["7", "PLANSIZ ABONE", "533 000 0000", "ÖRNEK SİTESİ A BLOK"],
      ],
    },
  ]);
  if (!plansiz.tamam) bekle("plansız abone çözüldü", false, plansiz.hata);
  else {
    bekle("çizelgesiz abone de abonelik açıyor", plansiz.abonelik === 1, `-> ${plansiz.abonelik}`);
    bekle("çizelgesiz aboneliğin günü boş", plansiz.satirlar[0].abonelikler[0]?.gunler.length === 0);
    bekle("çizelgesiz aboneliğin kalemi yok", plansiz.satirlar[0].abonelikler[0]?.kalemler.length === 0);
  }
}

bekle("gün yazımı defter biçiminde", gunleriYaz([1, 4]) === "PAZARTESİ&PERŞEMBE", gunleriYaz([1, 4]));
bekle("boş gün yazımı", gunleriYaz([]) === "" && gunleriYaz(null) === "");

/* Şablon ve dışa aktarma gidiş-dönüş */
const sablon = await dosyayiCoz("sablon.xlsx", await aboneSablonu());
if (!sablon.tamam) {
  bekle("şablon geri okundu", false, sablon.hata);
} else {
  bekle("şablon abone biçiminde", sablon.bicim === "abone");
  bekle("şablonda 3 müşteri", sablon.gecerli === 3, `-> ${sablon.gecerli}`);
  // Çizelgede satırı olan 2 abone + planı olmayan 1 abone = 3.
  bekle("şablonda 3 abonelik", sablon.abonelik === 3, `-> ${sablon.abonelik}`);
  const s0 = sablon.satirlar[0];
  bekle("şablon saati okundu", s0.abonelikler[0]?.saat === "08:00", JSON.stringify(s0.abonelikler[0]));
  bekle("şablon tutarı okundu", s0.abonelikler[0]?.tutar === 250);
  bekle("şablon günleri okundu", s0.abonelikler[0]?.gunler.join() === "1,4");
  bekle("şablon kalemi okundu", s0.abonelikler[0]?.kalemler.some((k) => k.ad === "SÜT" && k.miktar === 5));
  bekle("şablonda koordinatlı örnek var", sablon.satirlar.some((r) => r.lat === 40.7825 && r.lng === 30.354));
}

const disari = await abonelikleriYaz([
  {
    musteri: { ad: "AYŞE YILDIRIM", telefon: "532 000 0000" },
    adres: { adres_metni: "Orhangazi Sok.", bina: "14", kat: "1", daire: "2", tarif: "beyaz bina", lat: 40.7825, lng: 30.354 },
    baslik: "Süt",
    gunler: [1, 4],
    teslim_saati: "08:30",
    tutar: 120,
    notlar: "zile basma",
    kalemler: [{ miktar: 3, urun: { ad: "SÜT" } }],
  },
]);
const geri = await dosyayiCoz("cikti.xlsx", disari);
if (!geri.tamam) {
  bekle("dışa aktarılan dosya geri okundu", false, geri.hata);
} else {
  bekle("çıktı abone biçiminde geri okundu", geri.bicim === "abone" && geri.gecerli === 1, `-> ${geri.bicim}/${geri.gecerli}`);
  const g = geri.satirlar[0];
  bekle("ad korundu", g.ad === "AYŞE YILDIRIM", g.ad);
  bekle("telefon korundu", g.telefon === "532 000 0000");
  bekle("adres metni korundu", g.adres_metni === "Orhangazi Sok.", g.adres_metni);
  bekle("kapı bilgisi ayrı sütunlarda korundu", g.bina === "14" && g.kat === "1" && g.daire === "2" && g.tarif === "beyaz bina", JSON.stringify([g.bina, g.kat, g.daire, g.tarif]));
  bekle("koordinat korundu", g.lat === 40.7825 && g.lng === 30.354, JSON.stringify([g.lat, g.lng]));
  bekle("abonelik korundu", g.abonelikler.length === 1 && g.abonelikler[0].gunler.join() === "1,4");
  bekle("saat ve tutar korundu", g.abonelikler[0].saat === "08:30" && g.abonelikler[0].tutar === 120, JSON.stringify(g.abonelikler[0]));
  bekle("kalem korundu", g.abonelikler[0].kalemler[0]?.ad === "SÜT" && g.abonelikler[0].kalemler[0]?.miktar === 3);
}

/* ------------------------------------------------------------------ */
bolum("En hızlı rota ve sapma");

const sirali = hizaGoreSirala([
  { id: "a", sureSn: 600, mesafeM: 3000 },
  { id: "b", sureSn: 420, mesafeM: 3500 },
  { id: "c", sureSn: 420, mesafeM: 3100 },
]);
bekle("en kısa süreli rota başa", sirali[0].id === "c" && sirali[1].id === "b" && sirali[2].id === "a", sirali.map((s) => s.id).join(","));

// Market önünden doğuya 1 km'lik düz çizgi (≈ 0,0118° boylam bu enlemde).
const cizgi: [number, number][] = [[30.35218, 40.78067], [30.364, 40.78067]];
bekle("çizgi üstündeki nokta ~0 m", rotayaUzaklik(cizgi, { lat: 40.78067, lng: 30.358 }) < 1);
const kuzey = rotayaUzaklik(cizgi, { lat: 40.78067 + 100 / 111_320, lng: 30.358 });
bekle("çizginin 100 m kuzeyi ≈ 100 m", Math.abs(kuzey - 100) < 2, `-> ${kuzey.toFixed(1)}`);
const otesi = rotayaUzaklik(cizgi, { lat: 40.78067, lng: 30.366 });
bekle("uç noktanın ötesi uç noktaya göre ölçülür", otesi > 150 && otesi < 180, `-> ${otesi.toFixed(0)}`);
bekle("boş rota sonsuz uzak", rotayaUzaklik([], { lat: 0, lng: 0 }) === Infinity);
bekle("sapma eşiği kavşak toleransında", SAPMA_ESIGI_M >= 30 && SAPMA_ESIGI_M <= 80);

/* ------------------------------------------------------------------ */
bolum("Google karoları");

const kurallar = googleStilKurallari(PALETLER.aydinlik);
bekle("stil kuralları dolu", kurallar.length > 10, `-> ${kurallar.length}`);
bekle(
  "su rengi paletten",
  kurallar.some(
    (k) =>
      k.featureType === "water" &&
      k.elementType === "geometry" &&
      k.stylers.some((s) => s.color === PALETLER.aydinlik.su),
  ),
);
bekle(
  "kuralda boş değer yok",
  kurallar.every((k) =>
    k.stylers.every((s) => Object.values(s).every((v) => v !== undefined && v !== "")),
  ),
);
bekle(
  "gece stili farklı",
  JSON.stringify(googleStilKurallari(PALETLER.karanlik)) !== JSON.stringify(kurallar),
);
bekle(
  "karo adresi kodlanıyor",
  karoAdresi("abc def", "k/1") ===
    "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=abc%20def&key=k%2F1",
  `-> ${karoAdresi("abc def", "k/1")}`,
);
bekle("oturum geçerli", oturumGecerliMi({ session: "x", expiry: 1000 + 3600 }, 1000));
bekle("süresi dolmak üzere olan oturum geçersiz", !oturumGecerliMi({ session: "x", expiry: 1000 + 60 }, 1000));
bekle("boş oturum geçersiz", !oturumGecerliMi(null, 1000) && !oturumGecerliMi({ session: "", expiry: 9e9 }, 1000));
bekle("expiry metin ise geçersiz", !oturumGecerliMi({ session: "x", expiry: "9999999999" }, 1000));
bekle("403 metni anahtarı işaret ediyor", googleHataMetni(new GoogleOturumHatasi(403, "x")).includes("403"));
bekle("ağ hatası metni", googleHataMetni(new TypeError("fetch")).includes("ulaşılamadı"));

const temel = googleTemelStili("karanlik", "https://ornek/planet", "https://kurye.ornek");
bekle("temel stil zeminle başlıyor", temel.layers[0]?.id === "zemin" && temel.layers[0]?.type === "background");
bekle("temel stil bina katmanı", temel.layers.some((k) => k.id === "bina-3b" && k.type === "fill-extrusion"));
bekle("glyph adresi kendi sunucumuz", temel.glyphs === "https://kurye.ornek/maplibre/fonts/{fontstack}/{range}.pbf");
const binasiz = googleTemelStili("aydinlik", "", "https://kurye.ornek");
bekle("bina kaynağı boşsa katman yok", !binasiz.layers.some((k) => k.id === "bina-3b") && Object.keys(binasiz.sources).length === 0);

/* ------------------------------------------------------------------ */
console.log(`\n${"=".repeat(52)}`);
console.log(`GEÇTİ: ${gecti}   KALDI: ${kaldi.length}`);
if (kaldi.length) {
  console.log("\nBaşarısız olanlar:");
  for (const k of kaldi) console.log("  ✗ " + k);
  process.exit(1);
}
console.log("Tüm saf mantık testleri geçti.\n");
