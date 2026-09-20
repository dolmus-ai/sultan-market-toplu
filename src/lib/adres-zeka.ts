/**
 * Defterdeki tarif adreslerini aranabilir hâle getirme.
 *
 * Market defterinde 1216 adresin 1118'inde sokak adı bile geçmiyor. Yazılanlar
 * kuryenin kafasındaki tarif: "KEÇECİLERİN ORASI B A:D4", "SAKLI BAHÇE-2 E
 * BLOK D:3", "DAMLA ECZANE ÜSTÜ DAİRE-1", "541 501 67 54 AKKENT VİLALARI
 * NO:11". Bunları olduğu gibi Geocoding'e verince ya sonuç çıkmıyor ya da pin
 * Serdivan'ın merkezine düşüyor — ikisi de kuryeye yaramıyor.
 *
 * Buradaki iş üç adım:
 *
 *  1. **Claude tarifi ayıklıyor** — site adı, blok, kat, daire, sokak ve
 *     araya karışmış telefon ayrı alanlara çıkıyor; aranacak temiz sorgu
 *     üretiliyor. Site adı aynı zamanda tekilleştiriliyor: defterde
 *     "ÇAĞRI ELİT GARDEN", "CAGRI ELİT GARDEN" ve "ELİT GARDEN" aynı yer.
 *  2. **Aynı yerler tek sorguya iniyor** — 1216 adres birkaç yüz siteye
 *     düşüyor. Site bir kez aranıyor, oradaki herkes aynı noktayı alıyor.
 *     Hem ucuz hem tutarlı: aynı sitenin daireleri haritada dağılmıyor.
 *  3. **Sonuç doğrulanıyor** — marketten çok uzağa düşen ya da yalnızca
 *     ilçe/şehir seviyesinde eşleşen cevap kabul edilmiyor.
 *
 * Bu dosya yalnızca sunucuda çalışıyor: API anahtarı tarayıcıya gitmemeli.
 * Saf yardımcılar (ayıklama, gruplama, doğrulama) dışa açık ki anahtarsız
 * sınanabilsinler.
 */

import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import { CLAUDE_ANAHTARI } from "./ortam";
import type { CozulmusAdres } from "./adres-obek";

/** Defteri çözerken kullanılan model. */
export const MODEL = "claude-opus-5";

/**
 * Tek istekte kaç adres gönderiliyor.
 *
 * Küçük tutmanın sebebi doğruluk değil dayanıklılık: bir istek hata alırsa
 * yalnızca o kırk adres yeniden denenecek. Sistem istemi önbelleğe alındığı
 * için istek sayısının maliyete etkisi küçük.
 */
export const OBEK = 40;

const SEMA = {
  type: "object",
  additionalProperties: false,
  required: ["adresler"],
  properties: {
    adresler: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "yer",
          "blok",
          "kat",
          "daire",
          "sokak",
          "telefon",
          "sorgu",
          "tur",
          "guven",
        ],
        properties: {
          id: { type: "string" },
          yer: { type: ["string", "null"] },
          blok: { type: ["string", "null"] },
          kat: { type: ["string", "null"] },
          daire: { type: ["string", "null"] },
          sokak: { type: ["string", "null"] },
          telefon: { type: ["string", "null"] },
          sorgu: { type: "string" },
          tur: { type: "string", enum: ["site", "sokak", "tarif"] },
          guven: { type: "string", enum: ["yuksek", "orta", "dusuk"] },
        },
      },
    },
  },
} as const;

/**
 * Sistem istemi sabit tutuluyor: her istekte aynı baytlar gidiyor ki
 * önbelleğe girsin. Değişen tek şey adres listesi.
 */
const ISTEM = `Sakarya'nın Serdivan ilçesinde bir marketin teslimat defterindeki adresleri ayıklıyorsun.

Defteri market çalışanları elle tutuyor, adresler kurye için yazılmış tarifler. Örnek biçimler:
- "SAKLI BAHÇE-2 E BLOK D:3" → site adı + blok + daire
- "KOÇ CİTY VOQUE NO:8 D:10" → site adı + bina no + daire
- "541 501 67 54 AKKENT VİLALARI NO:11" → başta telefon, sonra site
- "DAMLA ECZANE ÜSTÜ DAİRE-1 2. kat" → işletme adına göre tarif
- "KÖPRÜBAŞI MAH. ŞEREF SOK. NO:46 EVİMPARKIN ARKASI SARI BİNA" → gerçek sokak adresi + tarif
- "KEÇECİLERİN ORASI B A:D4" → yalnızca yöresel tarif, aranabilir yer adı yok

Her adres için şunları çıkar:

- **yer**: sitenin, apartmanın, villa grubunun ya da işletmenin adı. TEKİLLEŞTİR:
  defterde aynı yer farklı yazılmış olabiliyor. Türkçe imlaya çevir, kısaltmayı aç,
  gereksiz ekleri at. "CAGRI ELİT GARDEN" ve "ÇAĞRI ELİT GARDEN" → "Çağrı Elit Garden".
  "SAFİRPARK" ve "SAFİR PARK SİT" → "Safir Park". "UNBAY KONAKLARI" ve
  "ÜNBAY KONAKLARI" → "Ünbay Konakları". "NAR ÇİÇEGİ VİLALARI" ve
  "NARÇİÇEĞİ VİLLALARI" → "Narçiçeği Villaları". Numaralı seriyi koru:
  "SAKLI BAHÇE-2" → "Saklı Bahçe 2", "EMİRGAN-4" → "Emirgan 4".
  Aranabilir bir yer adı yoksa null.
- **blok / kat / daire**: "E BLOK", "B2", "K:3", "D:7", "A:D4" gibi parçalar.
  Yalnızca değeri yaz: "E", "3", "7". Yoksa null.
- **sokak**: "566. Sokak", "Şeref Sokak", "Fevzi Çakmak Caddesi" gibi resmî yol adı.
  Mahalle adı da buraya girebilir. Yoksa null.
- **telefon**: adres metnine karışmış telefon numarası, yazıldığı gibi. Yoksa null.
- **sorgu**: Google Geocoding'e gidecek metin. Kurallar:
  - Blok, kat, daire, kapı numarası YAZMA — bunlar sonucu bozuyor.
  - Yer adı varsa: "<Yer adı>, Serdivan, Sakarya".
  - Yer adı yok ama sokak varsa: "<Sokak>, Serdivan, Sakarya".
  - İkisi de yoksa metindeki en belirgin sabit noktayı kullan
    ("Damla Eczanesi, Serdivan, Sakarya" gibi).
  - Hiçbir tutamak yoksa boş dize ver.
- **tur**: "site" (site/apartman/villa adı), "sokak" (resmî yol adresi),
  "tarif" (yalnızca yöresel tarif — "Keçecilerin orası", "Tahsin abilerin eski ev").
- **guven**: sorgunun haritada doğru noktayı bulma ihtimali.
  "yuksek" = adı geçen yer aranınca bulunur;
  "orta" = bulunabilir ama karışabilir;
  "dusuk" = tarif yöresel, arama muhtemelen yanlış yere düşer.

Gönderilen her adres için tam olarak bir kayıt döndür, "id" alanını aynen koru.
Uydurma: metinde olmayan mahalle, sokak ya da numara ekleme.`;

/** Adres metinlerini Claude'a gönderip ayıklanmış hâllerini alır. */
export async function adresleriCoz(
  girdiler: { id: string; metin: string }[],
  secenekler: { anahtar?: string; model?: string } = {},
): Promise<CozulmusAdres[]> {
  const anahtar = secenekler.anahtar ?? CLAUDE_ANAHTARI;
  if (!anahtar) throw new Error("ANTHROPIC_API_KEY tanımlı değil.");
  if (girdiler.length === 0) return [];

  const istemci = new Anthropic({ apiKey: anahtar });

  const cevap = await istemci.messages.parse({
    model: secenekler.model ?? MODEL,
    max_tokens: 16000,
    // Sistem istemi her istekte aynı; önbellek okuması ucuza getiriyor.
    system: [
      { type: "text", text: ISTEM, cache_control: { type: "ephemeral" } },
    ],
    // Ayıklama kalıbı belli; düşük eforda da doğru çalışıyor, ucuz oluyor.
    output_config: {
      effort: "low",
      format: jsonSchemaOutputFormat(SEMA),
    },
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          girdiler.map((g) => ({ id: g.id, adres: g.metin })),
        ),
      },
    ],
  });

  // Model reddederse `content` okumadan önce durmalı.
  if (cevap.stop_reason === "refusal") {
    throw new Error("Adres çözümleme reddedildi.");
  }
  const cikti = cevap.parsed_output;
  if (!cikti) throw new Error("Adres çözümleme okunamadı.");

  return (cikti.adresler ?? []).map((a) => ({
    id: String(a.id),
    yer: bosaNull(a.yer),
    blok: bosaNull(a.blok),
    kat: bosaNull(a.kat),
    daire: bosaNull(a.daire),
    sokak: bosaNull(a.sokak),
    telefon: bosaNull(a.telefon),
    sorgu: (a.sorgu ?? "").trim(),
    tur: a.tur,
    guven: a.guven,
  })) as CozulmusAdres[];
}

function bosaNull(d: string | null | undefined): string | null {
  const t = d?.trim();
  return t ? t : null;
}
