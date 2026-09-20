/**
 * Sakarya'ya özel, kural tabanlı adres çözücü.
 *
 * Market defterindeki adreslerin çoğu tarif: "SAKLI BAHÇE -2 E BLOK D:3",
 * "317. SOK NO:4 CEMİL ÇETİN KOMŞUSU", "ADATIP ARKASI 301. SOK NO:23". Bunlar
 * olduğu gibi Geocoding'e gidince ya boş dönüyor ya da ilçe merkezine düşüyor.
 * Burada tarif, marketin çevresini bilen birinin yapacağı gibi okunuyor:
 *
 *  - **Site sözlüğü.** Defterde geçen sitelerin yazım varyantları tek ada
 *    iniyor: "CAGRI ELİT GARDEN", "ÇAĞRI ELİT GARDEN", "ELİT GARDEN" → "Çağrı
 *    Elit Garden". Numaralı seriler korunuyor: "EMİRGAN -4" → "Emirgan 4".
 *  - **Numaralı sokaklar.** Serdivan'da 3xx numaralı sokaklar İstiklal
 *    Mahallesi'nde, 5xx numaralı sokaklar Arabacıalanı Mahallesi'nde; defter
 *    bunu bazen yazıyor bazen yazmıyor. Mahalle eklenince Geocoding sokağı
 *    buluyor, eklenmeyince Türkiye'nin herhangi bir "317. Sokak"ına düşüyor.
 *  - **Sabit noktalar.** "ADATIP ARKASI", "KUDÜS CAMİİ YANI", "AKOVA FIRINI"
 *    gibi tarifler bir işletmeye ya da kamu binasına göre; aranabilir olan o
 *    nokta, tarif yalnızca kuryeye kalıyor.
 *
 * Çıktı `CozulmusAdres` ile aynı şekil, yani `obekle` ile gruplanıp mevcut
 * geocoding hattına giriyor. Anahtar istemiyor, tarayıcıda çalışıyor; Claude
 * yalnızca burada boş kalanlar için gerekiyor.
 */

import type { CozulmusAdres } from "./adres-obek";

/* ------------------------------------------------------------------ */
/* Metin sadeleştirme                                                  */
/* ------------------------------------------------------------------ */

const HARF: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Büyük/küçük ve Türkçe harf farkını atar; sözlük eşlemesi bunun üstünde. */
export function sade(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâîû]/g, (h) => HARF[h] ?? h)
    .toUpperCase();
}

/** Adrese karışmış telefon: "(0532 278 02 86)", "5325748022", "541 501 67 54". */
const TELEFON = /\(?\s*0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\s*\)?/;

export function telefonuAyir(metin: string): {
  telefon: string | null;
  kalan: string;
} {
  const e = TELEFON.exec(metin);
  if (!e) return { telefon: null, kalan: metin };
  const ham = e[0].replace(/[()]/g, "").trim();
  return { telefon: ham, kalan: metin.replace(e[0], " ") };
}

/**
 * Blok, kat, daire, kapı numarası, şifre ve tarif kırıntıları.
 *
 * Bunlar sorguya girince Geocoding şaşıyor ("E BLOK D:3" diye bir yer yok).
 * Ayrı ayrı alınıyor; kuryeye ekranda hâlâ tam metin gösteriliyor.
 */
const BLOK = /\b([A-Z]{1,2}\d?|\d{1,2})\s*[-.]?\s*(?:BLOK|BLK|BL)\b/;
const DAIRE = /\b(?:D|DAIRE|DAİRE|DA)\s*[:.\-]?\s*(\d{1,3}[A-Z]?)\b/;
const KAT = /\b(?:K|KAT)\s*[:.\-]?\s*(\d{1,2})\b/;
const KAPI = /\b(?:NO|N|NUMARA)\s*[:.\-]?\s*(\d{1,4}(?:\s*\/\s*\d{1,3})?[A-Z]?)\b/;

/* ------------------------------------------------------------------ */
/* Site sözlüğü                                                         */
/* ------------------------------------------------------------------ */

type Site = {
  /** Sadeleştirilmiş kalıplar; boşluklar `[\s.\-]*` ile eşleşiyor. */
  kaliplar: string[];
  /** Ekranda ve sorguda kullanılacak ad. */
  ad: string;
  /** Sorguya eklenecek ek ("Sitesi", "Konutları"); adın kendisi yetiyorsa boş. */
  ek?: string;
  /** Adın ardından gelen numara seriye ait ("Emirgan 4"). */
  seri?: boolean;
};

/**
 * Defterde geçen siteler. Kalıp sadeleştirilmiş metinde aranıyor, en uzun
 * eşleşme kazanıyor; "ÇAĞRI ELİT GARDEN" hem "ELİT GARDEN"e hem kendi kalıbına
 * uyuyor, uzunu seçiliyor. Sıra önemli değil.
 */
const SITELER: Site[] = [
  { kaliplar: ["ELIT EVLER"], ad: "Elit Evler", seri: true, ek: "Sitesi" },
  { kaliplar: ["REMLEY YASAM", "REMLEY MAHALLE", "REMLEY MAH", "REMLEY PARKIM", "REMLEY"], ad: "Remley Yaşam" },
  { kaliplar: ["KARAT 54", "KARAT54", "KARAT"], ad: "Karat 54", ek: "Konutları" },
  { kaliplar: ["BU YAPI DAYMINT", "BU YAPI DYMINT", "DAYMINT", "DYMINT"], ad: "Bu Yapı Daymint" },
  { kaliplar: ["SAKLI BAHCE", "SAKLI BAHCE2", "SAKLI"], ad: "Saklı Bahçe", seri: true, ek: "Sitesi" },
  { kaliplar: ["UNBAY SERDIVAN KONAKLARI", "UNBAY KONAKLARI", "UNBAY SERDIVAN", "UNBAY"], ad: "Ünbay Serdivan Konakları" },
  { kaliplar: ["CAGRI ELIT GARDEN", "CAGRI ELIT", "ELIT GARDEN"], ad: "Çağrı Elit Garden" },
  { kaliplar: ["ERDEM EVLER"], ad: "Erdem Evler", ek: "Sitesi" },
  { kaliplar: ["SAKURA KIRAZ EVLER", "KIRAZ EVLER"], ad: "Kiraz Evler", ek: "Sitesi" },
  { kaliplar: ["SAFIR PARK", "SAFIRPARK"], ad: "Safir Park", ek: "Sitesi" },
  { kaliplar: ["WEST LIFE", "WESTLIFE"], ad: "West Life", ek: "Sitesi" },
  { kaliplar: ["WEST SIDE", "WESTSIDE"], ad: "West Side", ek: "Sitesi" },
  { kaliplar: ["INKO PARK", "INKO2", "INKO 2", "INKO"], ad: "İnko Park", seri: true, ek: "Sitesi" },
  { kaliplar: ["TERAS EVLER"], ad: "Teras Evler", ek: "Sitesi" },
  { kaliplar: ["TERAS TRIO"], ad: "Teras Trio" },
  { kaliplar: ["TERAS PARK VILLARI", "TERAS PARK VILLALARI", "TERAS PAR VILALARIN", "TERAS PARK"], ad: "Teras Park Villaları" },
  { kaliplar: ["ELIF EVLER", "ELIF APT"], ad: "Elif Evler", ek: "Sitesi" },
  { kaliplar: ["EMIRGAN KONUTLARI", "EMIRGAN"], ad: "Emirgan", seri: true, ek: "Konutları" },
  { kaliplar: ["SUKUR KONAKLARI"], ad: "Şükür Konakları" },
  { kaliplar: ["VADI PARK EVLERI", "VADI PARK", "BU YAPI VADI"], ad: "Vadi Park Evleri" },
  { kaliplar: ["MEHMET HAKKI SIPAHIER", "SIPAHIER KONAKLARI", "SIPAHI ER KONAKLARI", "SIPAHI ER", "SIPAHIER", "SIPAHILER"], ad: "Sipahiler Konakları", seri: true },
  { kaliplar: ["CAGLAYAN"], ad: "Çağlayan", seri: true, ek: "Sitesi" },
  { kaliplar: ["GUL EVLER"], ad: "Gül Evler", ek: "Sitesi" },
  { kaliplar: ["GUL SIT", "GUL SITESI"], ad: "Gül Sitesi" },
  { kaliplar: ["GUMUS SIT", "GUMUS SITESI", "GUMUS"], ad: "Gümüş Sitesi" },
  { kaliplar: ["KUTLU EVLER"], ad: "Kutlu Evler", ek: "Sitesi" },
  { kaliplar: ["CNR YAPI KUVVE", "CNR YAPI KUVE", "CNR KUVVE", "CNR KUVE", "KUVVE"], ad: "CNR Kuvve", ek: "Sitesi" },
  { kaliplar: ["GAMZE EVLER"], ad: "Gamze Evler", seri: true, ek: "Sitesi" },
  { kaliplar: ["BU YAPI UPTOWN", "UPTOWN"], ad: "Bu Yapı Uptown" },
  { kaliplar: ["AD YAPI FLORA", "ADAYAPI FLORA", "ADAFLORA", "ADA FLORA"], ad: "Ada Yapı Flora" },
  { kaliplar: ["AKKENT SITESI", "AKKENT VILALARI", "AKKENT VILLALARI", "AKKENT"], ad: "Akkent Sitesi" },
  { kaliplar: ["ALTINKENT SITESI", "ALTINKENT VILALARI", "ALTINKENT"], ad: "Altınkent Sitesi" },
  { kaliplar: ["ADA SEFKAT BOSNA", "BOSNA SIT", "BOSNA"], ad: "Bosna Sitesi" },
  { kaliplar: ["ADA SEFKAT"], ad: "Ada Şefkat", ek: "Sitesi" },
  { kaliplar: ["BURAK BEY KONAKLARI", "BURAKBEY KONAKLARI"], ad: "Burak Bey Konakları" },
  { kaliplar: ["CIGDEM EVLER"], ad: "Çiğdem Evler", ek: "Sitesi" },
  { kaliplar: ["DEFNE EVLER", "DEFNE EEVLER"], ad: "Defne Evler", ek: "Sitesi" },
  { kaliplar: ["HAKKI BEY KONAKLARI", "HAKI BEY KONAKLARI", "HAKKIBEY KONAKLARI"], ad: "Hakkı Bey Konakları" },
  { kaliplar: ["NAR CICEGI VILALARI", "NAR CICEGI VILLALARI", "NAR CICEGI VILLARI", "NARCICEGI VILLALARI", "NAR CICEGI"], ad: "Narçiçeği Villaları" },
  { kaliplar: ["SELCUKLU KONAKLARI"], ad: "Selçuklu Konakları" },
  { kaliplar: ["ADIL SIT", "ADIL SITESI", "ADIL"], ad: "Adil Sitesi" },
  { kaliplar: ["ASLANLI KONAKLARI", "ASLANLI"], ad: "Aslanlı Konakları" },
  { kaliplar: ["ATAON EVLERI", "ATAON"], ad: "Ataon Evleri" },
  { kaliplar: ["BIZIM BAHCE"], ad: "Bizim Bahçe", seri: true, ek: "Sitesi" },
  { kaliplar: ["BU YAPI DIAMONT", "BU YAPI DIAMOND", "DIAMONT"], ad: "Bu Yapı Diamond" },
  { kaliplar: ["BU YAPI FLEXI", "BU YAPI FLEX", "BU YAPI FILEX", "FLEXI"], ad: "Bu Yapı Flexi" },
  { kaliplar: ["HANEDAN KONAKLARI", "HANEDEN KONAKLARI"], ad: "Hanedan Konakları" },
  { kaliplar: ["KAAN EVLER", "KAGAN EVLER"], ad: "Kaan Evler", ek: "Sitesi" },
  { kaliplar: ["KOC CITY TUNC", "KOC CTY TUNC", "KOC CITY VOGUE", "KOC CITY VOQUE", "KOC CTY VEGUE", "KOC CTY VEQUE", "KOC CITY", "KOC CTY"], ad: "Koç City" },
  { kaliplar: ["OSMAN BEY SIT", "OSMANBEY SIT", "OSMAN BEY", "OSMANBEY"], ad: "Osmanbey Sitesi", seri: true },
  { kaliplar: ["ZIRVE PARK EVLERI", "ZIRVE PARK"], ad: "Zirve Park Evleri" },
  { kaliplar: ["VILLA NEW KONFOR", "NEW KONFOR"], ad: "Villa New Konfor Evler" },
  { kaliplar: ["ADAPARK VILALARI", "ADAPARK VILLALARI", "ADAPARK VILLARI", "ADAPARK VLALARI", "ADAPARK"], ad: "Adapark Villaları" },
  { kaliplar: ["ADVAS BLOKLARI", "ADVAS"], ad: "Advas Blokları" },
  { kaliplar: ["ALKAN TRIO", "AKLKAN TRIO"], ad: "Alkan Trio" },
  { kaliplar: ["ALKAN SMART"], ad: "Alkan Smart" },
  { kaliplar: ["BADE YAPI"], ad: "Bade Yapı" },
  { kaliplar: ["BAS ISLER SITESI", "BAS ISLER SITE", "BAS ISLER", "BASISLER"], ad: "Başişler Sitesi" },
  { kaliplar: ["CEYLAN SOKAK FAME", "FAME YAPI"], ad: "Fame Yapı" },
  { kaliplar: ["DAGBAKAN CIFTLIGI ARLAS", "ARLAS YAPI"], ad: "Arlas Yapı" },
  { kaliplar: ["NUVOS YAPI", "NUVOS"], ad: "Nuvos Yapı" },
  { kaliplar: ["TONOZ EVLER"], ad: "Tonoz Evler", ek: "Sitesi" },
  { kaliplar: ["VISNE EVLERI", "VISNE"], ad: "Vişne Evleri", seri: true },
  { kaliplar: ["YAKUPOGULLARI"], ad: "Yakupoğulları", ek: "Sitesi" },
  { kaliplar: ["ALTINISIK AKILI EVLER", "ALTINISIK AKILLI EVLER", "ALTIN ISIK AKILLI"], ad: "Altınışık Akıllı Evler" },
  { kaliplar: ["ATASOY VILLALARI", "ATASOY VILLARI", "ATASOY VILALARI", "ATASOY"], ad: "Atasoy Villaları" },
  { kaliplar: ["AYDIN VILALARI", "AYDIN VILLALARI"], ad: "Aydın Villaları" },
  { kaliplar: ["BEYAZ SARAY"], ad: "Beyaz Saray", ek: "Sitesi" },
  { kaliplar: ["BEYZADE EVLERI", "BEYZADE EVLER"], ad: "Beyzade Evleri" },
  { kaliplar: ["DURU SITESI", "DURU"], ad: "Duru Sitesi" },
  { kaliplar: ["ECE CITY"], ad: "Ece City" },
  { kaliplar: ["EKSIOGLU VILLALARI", "EKSIOGLU"], ad: "Ekşioğlu Villaları" },
  { kaliplar: ["ELIZYUM GARDEN", "ELIZYUM"], ad: "Elizyum Garden" },
  { kaliplar: ["FLORYA EVLERI"], ad: "Florya Evleri" },
  { kaliplar: ["HILL TOWN", "HILLTOWN"], ad: "Hill Town", ek: "Sitesi" },
  { kaliplar: ["ISKENDERBEY KONAKLARI", "ISKENDER BEY KONAKLARI"], ad: "İskenderbey Konakları" },
  { kaliplar: ["KARANFIL EVLER", "KAFANFIL SITESI", "KARANFIL SITESI"], ad: "Karanfil Evler", ek: "Sitesi" },
  { kaliplar: ["AKBA YAPI KILINC", "AKBAY KILINC", "KILINC SIT", "KILINC SITESI", "KILINC"], ad: "Kılınç Sitesi" },
  { kaliplar: ["SAMIBEY KONAKLARI", "SAMI BEY KONAKLARI", "SAMIBEY"], ad: "Samibey Konakları" },
  { kaliplar: ["SEHZADE EVLER", "SEHZADE"], ad: "Şehzade Evleri" },
  { kaliplar: ["SERDIVAN KONAKLARI"], ad: "Serdivan Konakları" },
  { kaliplar: ["SERDIVAN PLAS VILLALR", "SERDIVAN PLAS VILLALARI", "SERDIVAN PLAS"], ad: "Serdivan Plas Villaları" },
  { kaliplar: ["SUDE PARK EVLERI", "SUDE PARK"], ad: "Sude Park Evleri" },
  { kaliplar: ["TEZKENT SIT", "TEZKENT"], ad: "Tezkent Sitesi" },
  { kaliplar: ["UNZILE HANIM"], ad: "Ünzile Hanım", ek: "Sitesi" },
  { kaliplar: ["YASAM EVLERI"], ad: "Yaşam Evleri", ek: "Sitesi" },
  { kaliplar: ["YILDIZ KONAKLARI"], ad: "Yıldız Konakları" },
  { kaliplar: ["ADA KONAKLARI"], ad: "Ada Konakları" },
  { kaliplar: ["ADAKOY EVLERI"], ad: "Adaköy Evleri" },
  { kaliplar: ["ADINTAS VILLALARI", "ADILTAS VILLARI", "ADILTAS VILLALARI"], ad: "Adiltaş Villaları" },
  { kaliplar: ["AKASYA EVLERI", "AKASYA EVLER"], ad: "Akasya Evleri" },
  { kaliplar: ["ALPCAN KONAKLARI"], ad: "Alpcan Konakları" },
  { kaliplar: ["ASUDE KONAKLARI"], ad: "Asude Konakları" },
  { kaliplar: ["ASYA EVLER"], ad: "Asya Evler", ek: "Sitesi" },
  { kaliplar: ["ATA 5 SIT", "ATA-5 SIT", "ATA5 EVLERI", "ATA 5"], ad: "Ata 5 Evleri" },
  { kaliplar: ["ATA10 EVLERI", "ATA 10 EVLERI", "ATA10", "ATA 10"], ad: "Ata 10 Evleri" },
  { kaliplar: ["ATABES SIT", "ATABES"], ad: "Atabeş Sitesi" },
  { kaliplar: ["AVIT VILALARI", "AVIT VILLALARI"], ad: "Avit Villaları" },
  { kaliplar: ["AYSIMA EVLER"], ad: "Aysima Evler", ek: "Sitesi" },
  { kaliplar: ["BAS YAPI NISS VILLARI", "BAS YAPI VILALARI", "BAS YAPI"], ad: "Baş Yapı Villaları" },
  { kaliplar: ["BEYAZIT KONAKLARI"], ad: "Beyazıt Konakları" },
  { kaliplar: ["FURKAN VILALARI", "FURKAN VILLALARI"], ad: "Furkan Villaları" },
  { kaliplar: ["HAYAT SIT", "HAYAT SITESI"], ad: "Hayat Sitesi" },
  { kaliplar: ["NAZLI VILLALARI", "NAZLI VILALARI"], ad: "Nazlı Villaları" },
  { kaliplar: ["KOKUMER VILLARI", "KOKUMER VILLALARI"], ad: "Kökümer Villaları" },
  { kaliplar: ["MANOLYA EVLERI"], ad: "Manolya Evleri" },
  { kaliplar: ["DIVAN KONAKLARI"], ad: "Divan Konakları" },
  { kaliplar: ["ART SIT", "ART SITESI"], ad: "Art Sitesi" },
  { kaliplar: ["VERDES CONCEPT", "VERDES"], ad: "Verdes Concept" },
  { kaliplar: ["CADDE 54"], ad: "Cadde 54", ek: "Konutları" },
  { kaliplar: ["PANORAMA", "PANAROMA"], ad: "Panorama", ek: "Sitesi" },
  { kaliplar: ["6 VILLA", "6VILLA"], ad: "6 Villa", ek: "Sitesi" },
  { kaliplar: ["YAREN SOKAK"], ad: "Yaren Sokak" },
  // Defterde yazımı çok bozuk olanlar — tek tek eklendi.
  { kaliplar: ["VALENA PARK", "VELENA PARK", "VERENA PARK", "WELENAPARK", "VELENAPARK", "VALENAPARK", "VELENA APT", "VELENA"], ad: "Velena Park", ek: "Sitesi" },
  { kaliplar: ["SERENITY LIFE", "SERENTY LIFE", "SERENTIY", "SERENIT SIT", "SERENITY"], ad: "Serenity Life", ek: "Sitesi" },
  { kaliplar: ["ELISIUM GARDEN", "ELLISIUM SIT", "ELSIUM SIT", "CAGRI ELISYUM", "ELISIUM", "ELLISIUM", "ELSIUM", "ELISYUM"], ad: "Elizyum Garden" },
  { kaliplar: ["DAYMNT", "DAYMONT", "DATYMINT", "DAYMİNT"], ad: "Bu Yapı Daymint" },
  { kaliplar: ["FWEST LIFE", "VES LIFE"], ad: "West Life", ek: "Sitesi" },
  { kaliplar: ["HIIL TOWN"], ad: "Hill Town", ek: "Sitesi" },
  { kaliplar: ["KAARAT 54"], ad: "Karat 54", ek: "Konutları" },
  { kaliplar: ["BIZIM BZHCE"], ad: "Bizim Bahçe", seri: true, ek: "Sitesi" },
  { kaliplar: ["BU YAPI FLEXS", "FLEXS"], ad: "Bu Yapı Flexi" },
  { kaliplar: ["CNR YAPI BADE"], ad: "Bade Yapı" },
  { kaliplar: ["TUNC CTY", "KOC TUNC SITESI", "KOC TUNC"], ad: "Koç City" },
  { kaliplar: ["KOTANOGLU ISKENDERBEY", "ISKENDERBEY"], ad: "İskenderbey Konakları" },
  { kaliplar: ["SUKUR NO"], ad: "Şükür Konakları" },
  { kaliplar: ["SAFIR 1", "SAFIR 2"], ad: "Safir Park", ek: "Sitesi" },
  { kaliplar: ["SERDIVAN PLUS"], ad: "Serdivan Plas Villaları" },
  { kaliplar: ["YAKUPOGLU KONAKLARI", "YAKUPOGLU"], ad: "Yakupoğlu Konakları" },
  { kaliplar: ["UNZILE KONAKLARI"], ad: "Ünzile Hanım", ek: "Sitesi" },
  { kaliplar: ["ZEYTINDALI EVLERI", "ZIYTIN DALI EVLERI", "ZEYTIN DALI", "ZEYTINDALI"], ad: "Zeytindalı Evleri" },
  { kaliplar: ["NEV VILLA KONFOR", "VILLA KONFOR", "NEV KONFOR"], ad: "Villa New Konfor Evler" },
  { kaliplar: ["MANOLYA EVLERI", "MANOLYA"], ad: "Manolya Evleri" },
  { kaliplar: ["MANOR PARK EVLERI", "MANOR PARK", "MANOL PARK"], ad: "Manor Park Evleri" },
  { kaliplar: ["MANZARA PARK EVLERI", "MANZARA PARK"], ad: "Manzara Park Evleri" },
  { kaliplar: ["HISAR 2 EVLERI", "HISAR EVLERI", "HISAR"], ad: "Hisar Evleri", seri: true },
  { kaliplar: ["IHLAMUR APT"], ad: "Ihlamur Apartmanı" },
  { kaliplar: ["INCIPARK VILALARI", "INCIPARK VILLALARI", "INCIPARK", "INCI PARK"], ad: "İncipark Villaları" },
  { kaliplar: ["KELEBEK VADI SIT", "KELEBEK VADI"], ad: "Kelebek Vadi", ek: "Sitesi" },
  { kaliplar: ["KULELI KONAKLARI"], ad: "Kuleli Konakları" },
  { kaliplar: ["KOZA 1 SIT", "KOZA SIT", "KOZA"], ad: "Koza Sitesi", seri: true },
  { kaliplar: ["KASABA YAPI"], ad: "Kasaba Yapı" },
  { kaliplar: ["KASRI MENAZIR SIT", "KASRI MENAZIR"], ad: "Kasr-ı Menazır Sitesi" },
  { kaliplar: ["KARTOPU EVLERI"], ad: "Kartopu Evleri" },
  { kaliplar: ["HAYAT EVLER SIT", "HAYAT EVLER"], ad: "Hayat Sitesi" },
  { kaliplar: ["HANIMELI SITESI", "HANIMELI VILLARI", "HANIMELI VILLALARI"], ad: "Hanımeli Sitesi" },
  { kaliplar: ["ERGUVAN KONAKLARI"], ad: "Erguvan Konakları" },
  { kaliplar: ["ELIT BOTANIK"], ad: "Elit Botanik", ek: "Sitesi" },
  { kaliplar: ["ELIT SIT"], ad: "Elit Evler", ek: "Sitesi" },
  { kaliplar: ["EMIRGANPARK", "EMIRGAN PARK"], ad: "Emirgan Park", ek: "Sitesi" },
  { kaliplar: ["FLORA SITESI"], ad: "Ada Yapı Flora" },
  { kaliplar: ["FLORIA VILALARI", "FLORYA VILLARI", "FLORYA VILLALARI"], ad: "Florya Villaları" },
  { kaliplar: ["DUBLE GARDEN SIT", "DUBLE GARDEN"], ad: "Duble Garden", ek: "Sitesi" },
  { kaliplar: ["DURAK EVLER"], ad: "Durak Evler", ek: "Sitesi" },
  { kaliplar: ["DUYAROGLU SIT", "DUYAROGLU"], ad: "Duyaroğlu Sitesi" },
  { kaliplar: ["ECE CTY"], ad: "Ece City" },
  { kaliplar: ["EFE PASA VILALARI", "EFE PASA VILLALARI", "EFEPASA"], ad: "Efe Paşa Villaları" },
  { kaliplar: ["CELEBI MEHMET SIT", "CELEBI MEHMET"], ad: "Çelebi Mehmet Sitesi" },
  { kaliplar: ["CINAR EVLER", "CINAR SIT", "CINAR SITESI"], ad: "Çınar Sitesi" },
  { kaliplar: ["GOKCE EVLER"], ad: "Gökçe Evler", ek: "Sitesi" },
  { kaliplar: ["HASBAHCE KONAKLARI"], ad: "Hasbahçe Konakları" },
  { kaliplar: ["HUZUR KONAKLARI"], ad: "Huzur Konakları" },
  { kaliplar: ["MERCAN KONAKLARI", "MERCAN KONAKLARININ"], ad: "Mercan Konakları" },
  { kaliplar: ["METE KONAKLARI"], ad: "Mete Konakları" },
  { kaliplar: ["NARBAHCE KONAKLARI"], ad: "Narbahçe Konakları" },
  { kaliplar: ["OSMANLI KONAKLARI"], ad: "Osmanlı Konakları" },
  { kaliplar: ["ONUC KONAKLARI", "13 KONAKLARI"], ad: "Onüç Konakları" },
  { kaliplar: ["CAMLIK KONAKLARI"], ad: "Çamlık Konakları" },
  { kaliplar: ["OZARLIFE", "OZAR LIFE"], ad: "Özar Life", ek: "Sitesi" },
  { kaliplar: ["PASA VILALARI", "PASA VILLALARI"], ad: "Paşa Villaları" },
  { kaliplar: ["POYRAZ EVLER"], ad: "Poyraz Evler", ek: "Sitesi" },
  { kaliplar: ["SARDUNYA EVLERI"], ad: "Sardunya Evleri" },
  { kaliplar: ["SEMBOL EVLER"], ad: "Sembol Evler", ek: "Sitesi" },
  { kaliplar: ["SENKENT SIT", "SENKENT"], ad: "Şenkent Sitesi" },
  { kaliplar: ["SERPASA VILLARI", "SERPASA VILLALARI"], ad: "Serpaşa Villaları" },
  { kaliplar: ["SERSAN SIT", "SERSAN"], ad: "Sersan Sitesi" },
  { kaliplar: ["SEYIR EVLER"], ad: "Seyir Evler", ek: "Sitesi" },
  { kaliplar: ["SIYAH TAS EVLER"], ad: "Siyah Taş Evler", ek: "Sitesi" },
  { kaliplar: ["SAHIN EVLER"], ad: "Şahin Evler", ek: "Sitesi" },
  { kaliplar: ["SANTAS KUCIN2", "SANTAS KUCIN", "KUCIN2 SITESI"], ad: "Santaş Küçin 2 Sitesi" },
  { kaliplar: ["NEFES EVLER"], ad: "Nefes Evler", ek: "Sitesi" },
  { kaliplar: ["VADI VILLARI", "VADI VILLALARI"], ad: "Vadi Villaları" },
  { kaliplar: ["VILLAPARK EVLERI", "VILLA PARK EVLERI"], ad: "Villapark Evleri" },
  { kaliplar: ["KALE VILLALARI"], ad: "Kale Villaları" },
  { kaliplar: ["ARDAPARK EVLERI", "ARDAPARK"], ad: "Ardapark Evleri" },
  { kaliplar: ["ARLAS YAPI VILALARI"], ad: "Arlas Yapı" },
  { kaliplar: ["ALTIN ISIK CAD", "MEHMET ALTINISIK CAD"], ad: "Mehmet Altınışık Caddesi" },
  { kaliplar: ["ESKI KAZIMPASA CAD"], ad: "Eski Kazımpaşa Caddesi" },
];

/* ------------------------------------------------------------------ */
/* Sabit noktalar — işletme, kamu binası, cami                          */
/* ------------------------------------------------------------------ */

type Nokta = { kaliplar: string[]; ad: string; sorgu: string };

/**
 * Tarifte geçen sabit noktalar. Site bulunamayınca bunlara bakılıyor: pin
 * kapının önüne değil ama doğru sokağa düşüyor; kurye tarifin kalanını
 * yerinde okuyor.
 */
const NOKTALAR: Nokta[] = [
  { kaliplar: ["ADATIP"], ad: "Adatıp Hastanesi", sorgu: "Adatıp Hastanesi, Serdivan, Sakarya" },
  { kaliplar: ["KUDUS CAMI", "KUDUS CAMII", "KUDUS CAMINI"], ad: "Kudüs Camii", sorgu: "Kudüs Camii, İstiklal Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["HZ OSMAN CAMI", "HZ.OSMAN CAMI"], ad: "Hz. Osman Camii", sorgu: "Hz. Osman Camii, Arabacıalanı, Serdivan, Sakarya" },
  { kaliplar: ["AKOVA FIRIN", "AKOVA"], ad: "Akova Fırını", sorgu: "Akova Fırını, Serdivan, Sakarya" },
  { kaliplar: ["MINIK ADALILAR"], ad: "Minik Adalılar Anaokulu", sorgu: "Minik Adalılar Anaokulu, Serdivan, Sakarya" },
  { kaliplar: ["SERDIVAN AVM"], ad: "Serdivan AVM", sorgu: "Serdivan AVM, Serdivan, Sakarya" },
  { kaliplar: ["EVIMPARK"], ad: "Evimpark", sorgu: "Evimpark, Serdivan, Sakarya" },
  { kaliplar: ["DAMLA ECZANE"], ad: "Damla Eczanesi", sorgu: "Damla Eczanesi, Serdivan, Sakarya" },
  { kaliplar: ["RAMIZ KOFTE"], ad: "Ramiz Köfte", sorgu: "Ramiz Köfte, Serdivan, Sakarya" },
  { kaliplar: ["DAGBAKAN CIFTLIGI", "DAGBAKAN CIFTLIGIN"], ad: "Dağbakan Çiftliği", sorgu: "Dağbakan Çiftliği, Serdivan, Sakarya" },
  { kaliplar: ["ARALIK KOYU", "ARALIK MAH"], ad: "Aralık Mahallesi", sorgu: "Aralık Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["YAZLIK MAH"], ad: "Yazlık Mahallesi", sorgu: "Yazlık Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["KURUCESME"], ad: "Kuruçeşme Mahallesi", sorgu: "Kuruçeşme Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["KOPRUBASI MAH"], ad: "Köprübaşı Mahallesi", sorgu: "Köprübaşı Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["KEMALPASA MAH"], ad: "Kemalpaşa Mahallesi", sorgu: "Kemalpaşa Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["SAKARYA UNIVERSITESI", "KAMPUS"], ad: "Sakarya Üniversitesi", sorgu: "Sakarya Üniversitesi Esentepe Kampüsü, Serdivan" },
  { kaliplar: ["REYHAN PASTAHANESI", "REYHAN PASTANESI", "REYHANA", "REYHANDAN", "REYHANIN"], ad: "Reyhan Pastanesi", sorgu: "Reyhan Pastanesi, Serdivan, Sakarya" },
  { kaliplar: ["PAYITAHT IS MERKEZI"], ad: "Payitaht İş Merkezi", sorgu: "Payitaht İş Merkezi, Serdivan, Sakarya" },
  { kaliplar: ["WORK INN"], ad: "Work Inn İş Hanı", sorgu: "Work Inn, Serdivan, Sakarya" },
  { kaliplar: ["OZPAS LOJISTIK", "OZPAS DEPO", "OZPAS"], ad: "Özpaş Lojistik", sorgu: "Özpaş, Serdivan, Sakarya" },
  { kaliplar: ["ORGANIK GURME"], ad: "Organik Gurme", sorgu: "Organik Gurme, Serdivan, Sakarya" },
  { kaliplar: ["TEKSEN KOLEJI"], ad: "Teksen Koleji", sorgu: "Teksen Koleji, Serdivan, Sakarya" },
  { kaliplar: ["TOZAN MARKET"], ad: "Tozan Market", sorgu: "Tozan Market, Serdivan, Sakarya" },
  { kaliplar: ["UFUK MARKET"], ad: "Ufuk Market", sorgu: "Ufuk Market, Serdivan, Sakarya" },
  { kaliplar: ["YILDIZ CAMI"], ad: "Yıldız Camii", sorgu: "Yıldız Camii, Serdivan, Sakarya" },
  { kaliplar: ["YESILCAMI", "YESIL CAMI"], ad: "Yeşil Camii", sorgu: "Yeşil Camii, Serdivan, Sakarya" },
  { kaliplar: ["KARDESLER DONDURMA", "KARDESLER DONRMA"], ad: "Kardeşler Dondurma", sorgu: "Kardeşler Dondurma, Serdivan, Sakarya" },
  { kaliplar: ["OSMANLI HURMACI"], ad: "Osmanlı Hurmacı", sorgu: "Osmanlı Hurmacı, Serdivan, Sakarya" },
  { kaliplar: ["TEOLIKA"], ad: "Teolika", sorgu: "Teolika, Serdivan, Sakarya" },
  { kaliplar: ["ERVES REZERVE"], ad: "Erves Rezerve", sorgu: "Erves Rezerve, Serdivan, Sakarya" },
  { kaliplar: ["ZORLU OKUL"], ad: "Zorlu Okulu", sorgu: "Zorlu Koleji, Serdivan, Sakarya" },
  { kaliplar: ["SPOR POINT"], ad: "Spor Point", sorgu: "Spor Point, Serdivan, Sakarya" },
  { kaliplar: ["VD AKADEMI"], ad: "VD Akademi", sorgu: "VD Akademi, Serdivan, Sakarya" },
  { kaliplar: ["HANEDAN TESISLERI"], ad: "Hanedan Tesisleri", sorgu: "Hanedan Tesisleri, Selahiye, Serdivan, Sakarya" },
  { kaliplar: ["SELAHIYE"], ad: "Selahiye Mahallesi", sorgu: "Selahiye Mahallesi, Serdivan, Sakarya" },
  { kaliplar: ["KAZIMPASA"], ad: "Kazımpaşa", sorgu: "Kazımpaşa, Serdivan, Sakarya" },
];

/* ------------------------------------------------------------------ */
/* Sokak kuralı                                                         */
/* ------------------------------------------------------------------ */

/**
 * Numaralı sokağın mahallesi.
 *
 * Defterde "İSTİKLAL MAH 310 SOKAK", "İSTİKLAL MAH. 339. SOK",
 * "ARABACIALANI MAH.546.SOKAK" yazıyor; bazen de mahalle atlanıp yalnızca
 * "317. SOK NO:4" kalıyor. Serdivan'da 3xx İstiklal'de, 5xx Arabacıalanı'nda.
 */
export function sokakMahallesi(no: number): string | null {
  if (no >= 300 && no < 400) return "İstiklal Mahallesi";
  if (no >= 500 && no < 600) return "Arabacıalanı Mahallesi";
  return null;
}

const NUMARALI_SOKAK = /\b(\d{2,4})\s*[.,]?\s*(?:NOLU\s+)?(?:SOKAK|SOK|SKAK|SK)\b/;
/** "FEVZİ ÇAKMAK CAD.", "ESKİ KAZIMPAŞA CAD." — özgün metinden. */
const ADLI_CADDE = /(?<![\p{L}])([\p{L}]{3,}(?:\s+[\p{L}]{3,})?)\s*[.]?\s+(?:CADDESI|CADDESİ|CADDE|CAD)\b/iu;
/**
 * Adlı sokak: "ŞEREF SOK.", "ZAMBAK SOKAK", "HANIMELİ SOKAK".
 *
 * Özgün metinden alınıyor ki Türkçe harfler kalsın ("Şeref", "Zarif").
 * Yalnızca sokak adı olabilecek tek kelime kabul ediliyor; "ARKA SOKAK",
 * "MAH SELAM SOK", "GEÇİNCE FERAH SOKAK" gibi tarif kırıntıları eleniyor.
 */
const ADLI_SOKAK = /(?<![\p{L}])([\p{L}]{3,})\s*[.]?\s+(?:SOKAK|SOK)\b/iu;
const SOKAK_DEGIL = new Set([
  "ARKA", "ON", "YAN", "KARSI", "ALT", "UST", "MAH", "MAHALLE", "MAHALLESI",
  "NOLU", "SOKAGI", "SOKAGIN", "SOKAGINDAN", "SONU", "SONUNDA", "ILK", "SOL",
  "SAG", "SOLDAKI", "SAGDAKI", "GECINCE", "GIRINCE", "ARASINDAKI",
  "KARSISINDAKI", "CAPRAZINDA", "TARAFI", "YUKARI", "ASAGI", "DUBLEX",
  "DUBLEKS", "APT", "SIT", "BINA", "EV", "CADDE", "CAD", "KOSE", "BASTAKI",
  "ECZANE", "FIRIN", "MARKET", "OKUL", "CAMI", "PARK", "DURAK", "DIBI",
]);

function adliCadde(metin: string): string | null {
  const e = ADLI_CADDE.exec(metin);
  if (!e) return null;
  // "İSTİKLAL MAH FEVZİÇAKMAK CAD." — baştaki "MAH" caddenin adı değil.
  const kelimeler = e[1].trim().split(/\s+/).filter((k) => !SOKAK_DEGIL.has(sade(k)));
  if (kelimeler.length === 0) return null;
  return kelimeler
    .map((k) => k.charAt(0).toLocaleUpperCase("tr") + k.slice(1).toLocaleLowerCase("tr"))
    .join(" ");
}

function adliSokak(metin: string): string | null {
  const e = ADLI_SOKAK.exec(metin);
  if (!e) return null;
  const ad = e[1];
  if (SOKAK_DEGIL.has(sade(ad))) return null;
  // "Şeref", "Zambak": baş harf büyük, kalanı küçük — Google'a öyle gidiyor.
  return (
    ad.charAt(0).toLocaleUpperCase("tr") +
    ad.slice(1).toLocaleLowerCase("tr")
  );
}
const MAHALLE = /\b(ISTIKLAL|ISTIKAL|ARABACIALANI|ARABAC IALANI|ARABACI ALALNI|ARABACI ALANI|KOPRUBASI|KOPRU BASI|KEMALPASA|YAZLIK|ARALIK|KURUCESME|BAHCELIEVLER|32 EVLER|BESKOPRU|SELAHIYE|KAZIMPASA|ESENTEPE)\s*(?:MAH|MAHALLESI|MAHALLE)?\b/;

/* ------------------------------------------------------------------ */
/* Çözücü                                                               */
/* ------------------------------------------------------------------ */

/**
 * Adın ardına gelebilecek Türkçe ekler (sadeleştirilmiş hâlde).
 *
 * "ELİT EVLERE GELMEDEN", "ZİRVE PARKIN ÜSTÜ", "KUTLU EVLERİ GEÇİNCE" — ek
 * almış ad da aynı yeri gösteriyor; geocoding için doğru çıpa o site.
 */
const EKLER =
  "(?:'?(?:LERININ|LARININ|LERINDEN|LARINDAN|LERINDE|LARINDA|LERINE|LARINA|LERIN|LARIN|LERI|LARI|ININ|UNUN|NIN|NUN|DEN|DAN|TEN|TAN|IN|UN|DE|DA|TE|TA|YE|YA|YI|YU|E|A|I|U))?";

/** Kalıbı sadeleştirilmiş metinde arayan düzenli ifade. */
function kalipRegex(kalip: string): RegExp {
  const parcalar = kalip.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Kelime arası boşluk, nokta ya da tire olabilir; başta harf olmasın,
  // sonda yalnızca Türkçe ek olabilir.
  return new RegExp(`(?<![A-Z])(${parcalar.join("[\\s.\\-]*")})${EKLER}(?![A-Z])`);
}

/**
 * Adın hemen ardındaki göreli sözcük: "ADAPARK KARŞISI ELİZYUM" derken yer
 * Elizyum'dur, Adapark yalnızca tarif. Böyle bir sözcük izleyen eşleşme,
 * metinde başka aday varsa geri çekiliyor.
 */
const GORELI = /^[\s.,'-]*(KARSI|KARSISI|KARSISINDA|KARSISINDAKI|YANI|YANINDA|YANINDAKI|ARKA|ARKASI|ARKASINDA|ARKASINDAKI|ONU|ONUNDE|ONUNDEKI|USTU|USTUNDE|ALTI|ALTINDA|GECINCE|GELMEDEN|TARAFI|TARAFINDA|BITISIGI|BITISIGINDE|KOMSUSU|CAPRAZI|CAPRAZINDA|YAKINI|ILERISI)\b/;

const SITE_KALIPLARI = SITELER.flatMap((s) =>
  s.kaliplar.map((k) => ({ site: s, kalip: k, regex: kalipRegex(k) })),
).sort((a, b) => b.kalip.length - a.kalip.length);

const NOKTA_KALIPLARI = NOKTALAR.flatMap((n) =>
  n.kaliplar.map((k) => ({ nokta: n, kalip: k, regex: kalipRegex(k) })),
).sort((a, b) => b.kalip.length - a.kalip.length);

function mahalleAdi(sade: string): string {
  const m: Record<string, string> = {
    ISTIKLAL: "İstiklal Mahallesi",
    ISTIKAL: "İstiklal Mahallesi",
    ARABACIALANI: "Arabacıalanı Mahallesi",
    "ARABAC IALANI": "Arabacıalanı Mahallesi",
    "ARABACI ALALNI": "Arabacıalanı Mahallesi",
    "ARABACI ALANI": "Arabacıalanı Mahallesi",
    KOPRUBASI: "Köprübaşı Mahallesi",
    "KOPRU BASI": "Köprübaşı Mahallesi",
    KEMALPASA: "Kemalpaşa Mahallesi",
    YAZLIK: "Yazlık Mahallesi",
    ARALIK: "Aralık Mahallesi",
    KURUCESME: "Kuruçeşme Mahallesi",
    BAHCELIEVLER: "Bahçelievler Mahallesi",
    "32 EVLER": "32 Evler Mahallesi",
    BESKOPRU: "Beşköprü Mahallesi",
    SELAHIYE: "Selahiye Mahallesi",
    KAZIMPASA: "Kazımpaşa Mahallesi",
    ESENTEPE: "Esentepe Mahallesi",
  };
  return m[sade] ?? sade;
}

/**
 * Tek adresi çözer. Anahtar istemez, ağ istemez.
 *
 * Sıra: site sözlüğü → numaralı/adlı sokak → sabit nokta → boş. Site
 * bulununca sokak bakılmıyor: "ÇAĞRI ELİT GARDEN ÖNÜNDEKİ SOKAK" için doğru
 * yer sitedir, sokağın kendisi değil.
 */
export function sakaryaCoz(id: string, metin: string): CozulmusAdres {
  const { telefon, kalan } = telefonuAyir(metin);
  const S = sade(kalan);

  const blok = BLOK.exec(S)?.[1] ?? null;
  const daire = DAIRE.exec(S)?.[1] ?? null;
  const kat = KAT.exec(S)?.[1] ?? null;
  const kapi = KAPI.exec(S)?.[1] ?? null;

  const bos = (
    tur: CozulmusAdres["tur"],
    guven: CozulmusAdres["guven"],
    yer: string | null,
    sorgu: string,
    sokak: string | null = null,
  ): CozulmusAdres => ({
    id,
    yer,
    blok,
    kat,
    daire,
    sokak,
    telefon,
    sorgu,
    tur,
    guven,
  });

  const mah = MAHALLE.exec(S);
  const numarali = NUMARALI_SOKAK.exec(S);

  /* 0) Kapı numaralı, mahallesi belli sokak her şeyi geçer: en kesin bilgi o. */
  if (numarali && kapi) {
    const no = Number(numarali[1]);
    const mahalle = mah ? mahalleAdi(mah[1]) : sokakMahallesi(no);
    if (mahalle) {
      const sokak = `${no}. Sokak`;
      return bos(
        "sokak",
        "yuksek",
        null,
        `${sokak} No:${kapi.replace(/\s+/g, "")}, ${mahalle}, Serdivan, Sakarya`,
        sokak,
      );
    }
  }

  /* 1) Site — bütün adaylar toplanıp en iyisi seçiliyor. */
  let enIyi: { site: Site; e: RegExpExecArray; puan: number } | null = null;
  for (const { site, kalip, regex } of SITE_KALIPLARI) {
    const e = regex.exec(S);
    if (!e) continue;
    let puan = kalip.length * 10;
    // Göreli sözcük izliyorsa bu bir tarif çıpası; başka aday varsa yenilsin.
    if (GORELI.test(S.slice(e.index + e[0].length))) puan -= 100;
    // Metinde öne yakın olan ad genelde asıl yer.
    puan -= e.index / 10;
    if (!enIyi || puan > enIyi.puan) enIyi = { site, e, puan };
  }
  if (enIyi) {
    const { site, e } = enIyi;
    let ad = site.ad;
    if (site.seri) {
      // "EMİRGAN -4", "SAKLI BAHÇE2", "ELİT EVLER 3 B BLOK" → seri numarası.
      const son = S.slice(e.index + e[1].length);
      const n = /^\s*[-.]?\s*(\d)(?![\d])/.exec(son);
      if (n) ad = `${ad} ${n[1]}`;
    }
    const sorguAd = site.ek ? `${ad} ${site.ek}` : ad;
    return bos("site", "yuksek", ad, `${sorguAd}, Serdivan, Sakarya`);
  }

  /* 2) Sokak */
  if (numarali) {
    const no = Number(numarali[1]);
    const mahalle = mah ? mahalleAdi(mah[1]) : sokakMahallesi(no);
    const sokak = `${no}. Sokak`;
    if (mahalle) {
      const kapiParca = kapi ? ` No:${kapi.replace(/\s+/g, "")}` : "";
      return bos(
        "sokak",
        kapi ? "yuksek" : "orta",
        null,
        `${sokak}${kapiParca}, ${mahalle}, Serdivan, Sakarya`,
        sokak,
      );
    }
  }
  const cadde = adliCadde(kalan);
  if (cadde) {
    const mahalle = mah ? `${mahalleAdi(mah[1])}, ` : "";
    const kapiParca = kapi ? ` No:${kapi.replace(/\s+/g, "")}` : "";
    return bos(
      "sokak",
      kapi ? "yuksek" : "orta",
      null,
      `${cadde} Caddesi${kapiParca}, ${mahalle}Serdivan, Sakarya`,
      `${cadde} Caddesi`,
    );
  }

  const adli = adliSokak(kalan);
  if (adli) {
    const mahalle = mah ? `${mahalleAdi(mah[1])}, ` : "";
    return bos(
      "sokak",
      "orta",
      null,
      `${adli} Sokak, ${mahalle}Serdivan, Sakarya`,
      `${adli} Sokak`,
    );
  }

  /* 3) Sabit nokta */
  for (const { nokta, regex } of NOKTA_KALIPLARI) {
    if (regex.test(S)) return bos("tarif", "orta", nokta.ad, nokta.sorgu);
  }

  /* 4) Yalnızca mahalle yazıyorsa oraya kadar götür. */
  if (mah) {
    const mahalle = mahalleAdi(mah[1]);
    return bos("tarif", "dusuk", mahalle, `${mahalle}, Serdivan, Sakarya`);
  }

  return bos("tarif", "dusuk", null, "");
}

/** Sözlükteki site sayısı — kapsamı raporlamak için. */
export const SITE_SAYISI = SITELER.length;
