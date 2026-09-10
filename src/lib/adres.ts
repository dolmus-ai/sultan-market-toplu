/**
 * Elle yazılmış Türkçe adresleri harita servisinin anlayacağı hâle getirir.
 *
 * Kurye "Tığcılar mahallesi Kol sokak no 6 daire 8 filiz apartman
 * SAKARYA/ADAPAZARI" gibi yazıyor; Nominatim bunu bulamıyor. Kapı/daire
 * bilgisini atıp giderek daha genel adaylar üretiyoruz: tam metin → sokak +
 * ilçe → mahalle + ilçe. Sokak bulunamazsa mahalle ortasına düşmek hiç konum
 * olmamasından iyi; kurye haritadan ince ayar yapabiliyor. Mahalleden daha
 * kaba bir sonuç (ilçe, il) kabul edilmiyor.
 */

/** Kapı, daire, kat, blok gibi harita servisini şaşırtan parçalar. */
const GURULTU = [
  /\bno\s*[:.]?\s*\d+[a-zçğıöşü]?\b/gi,
  /\bkapı\s*(no)?\s*[:.]?\s*\d+\b/gi,
  /\bdaire\s*[:.]?\s*\d+\b/gi,
  /\bd\s*[:.]\s*\d+\b/gi,
  /\bkat\s*[:.]?\s*\d+\b/gi,
  /\bk\s*[:.]\s*\d+\b/gi,
  /\b\d+\s*\.\s*kat\b/gi,
  /\bblok\s*[a-z]?\b/gi,
  /\bapartman[ıi]?\b/gi,
  /\bapt\.?\b/gi,
  /\bsitesi\b/gi,
  /\bbina\b/gi,
];

/** Kısaltmaları açar: "Mah." → "mahallesi" gibi. */
const KISALTMALAR: [RegExp, string][] = [
  [/\bmah\.?(?=\s|,|$)/gi, "mahallesi"],
  [/\bmh\.?(?=\s|,|$)/gi, "mahallesi"],
  [/\bsok\.?(?=\s|,|$)/gi, "sokak"],
  [/\bsk\.?(?=\s|,|$)/gi, "sokak"],
  [/\bcad\.?(?=\s|,|$)/gi, "caddesi"],
  [/\bcd\.?(?=\s|,|$)/gi, "caddesi"],
  [/\bbulv\.?(?=\s|,|$)/gi, "bulvarı"],
  [/\bblv\.?(?=\s|,|$)/gi, "bulvarı"],
];

const YOL_TURLERI = [
  "sokak",
  "sokağı",
  "caddesi",
  "cadde",
  "bulvarı",
  "bulvar",
];
const MAHALLE_TURLERI = ["mahallesi", "mahalle", "köyü", "köy"];
const TUM_TURLER = [...YOL_TURLERI, ...MAHALLE_TURLERI];

function bosluklariTopla(m: string) {
  return m.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function temizle(ham: string): string {
  let m = ` ${ham} `;
  for (const [desen, karsilik] of KISALTMALAR) m = m.replace(desen, karsilik);
  for (const desen of GURULTU) m = m.replace(desen, " ");
  // Kısaltmalar açıldıktan sonra kalan yalnız noktaları at ("Mah." → "mahallesi .")
  m = m.replace(/\s+\.(?=\s|,|$)/g, "");
  return bosluklariTopla(m).replace(/^[,.\s]+|[,.\s]+$/g, "");
}

function kucuk(k: string) {
  return k.toLocaleLowerCase("tr").replace(/[.,]/g, "");
}

/**
 * "… Şehit Ercan Sokak …" içinden "Şehit Ercan Sokak" parçasını çeker.
 * Tür sözcüğünden geriye doğru en fazla iki sözcük alır; "mahallesi" gibi
 * başka bir tür sözcüğüne ya da sayıya çarpınca durur.
 */
function turParcasi(metin: string, turler: string[]): string | null {
  const kelimeler = metin.split(/[\s,/]+/).filter(Boolean);
  const yer = kelimeler.findIndex((k) => turler.includes(kucuk(k)));
  if (yer < 1) return null;

  const oncekiler: string[] = [];
  for (let i = yer - 1; i >= 0 && oncekiler.length < 2; i--) {
    const k = kucuk(kelimeler[i]);
    if (TUM_TURLER.includes(k) || /^\d+$/.test(k)) break;
    oncekiler.unshift(kelimeler[i].replace(/[.,]+$/, ""));
  }
  if (!oncekiler.length) return null;
  return bosluklariTopla(`${oncekiler.join(" ")} ${kelimeler[yer].replace(/[.,]+$/, "")}`);
}

function yolParcasi(metin: string): string | null {
  return turParcasi(metin, YOL_TURLERI);
}

function mahalleParcasi(metin: string): string | null {
  return turParcasi(metin, MAHALLE_TURLERI);
}

/**
 * Yer adları: virgül ve eğik çizgiyle ayrılmış, içinde sokak/mahalle geçmeyen
 * parçalar. "SAKARYA/ADAPAZARI" → ["SAKARYA", "ADAPAZARI"].
 */
function yerParcalari(metin: string): string[] {
  return metin
    .split(/[,/]/)
    .map((p) => bosluklariTopla(p).replace(/[.,]+$/, ""))
    .filter(
      (p) =>
        p.length > 2 &&
        !/\d/.test(p) &&
        !p.split(/\s+/).some((k) => TUM_TURLER.includes(kucuk(k))),
    );
}

/**
 * Aranacak adayları geniş olandan dar olana doğru sıralar.
 * `il` listede hiç geçmiyorsa sonuna ekleniyor.
 */
export function adresAdaylari(ham: string, il = "Sakarya"): string[] {
  const metin = temizle(ham);
  if (!metin) return [];

  const yer = yerParcalari(metin);
  const ilVar = new RegExp(il, "i").test(metin);
  const kuyruk = [...yer, ...(ilVar ? [] : [il])].join(", ");

  const yol = yolParcasi(metin);
  const mahalle = mahalleParcasi(metin);

  // Yalnızca il/ilçe adı aday değil: il merkezine pin koymak, konum
  // olmamasından beter — kurye yanlış yere gider.
  const adaylar = [
    ilVar ? metin : `${metin}, ${il}`,
    yol && kuyruk ? `${yol}, ${kuyruk}` : null,
    mahalle && kuyruk ? `${mahalle}, ${kuyruk}` : null,
  ];

  // Tekrarları at, sırayı koru.
  const gorulen = new Set<string>();
  return adaylar.filter((a): a is string => {
    if (!a) return false;
    const anahtar = a.toLocaleLowerCase("tr");
    if (gorulen.has(anahtar)) return false;
    gorulen.add(anahtar);
    return true;
  });
}
