/**
 * Haritanın gezilebilir alanı: Sakarya ili.
 *
 * Kurye Sakarya dışına teslimat yapmıyor; haritanın oraya kayması yalnızca
 * kaza oluyordu — parmak kaydı, ekran Bolu'ya gitti, kurye geri dönmek için
 * uğraştı. MapLibre `maxBounds` ile görüntüyü kutunun içinde tutuyor.
 *
 * Kutu dikdörtgen, il sınırı değil: dikdörtgen bir çerçeve zorunlu olarak
 * komşu illerden parçalar da kapsıyor. Amaç il sınırını santimetre santimetre
 * çizmek değil, haritanın Sakarya'dan kopmasını engellemek.
 *
 * Uzaklaşma sınırını MapLibre kendisi koyuyor: görüntü kutuyu aşamadığı için
 * en uzakta kutu ekranı dolduruyor. Bu hesap ekran ölçüsünden yapıldığından
 * telefonda ve masaüstünde ayrı ayrı doğru çalışıyor; bizim ayrıca bir
 * `minZoom` vermemiz gerekmiyor. Yan etkisi: ilin tamamı tek ekrana sığmıyor,
 * en uzakta ilin büyük bölümü görünüyor.
 */

import type { Nokta } from "./tipler";

/**
 * Sakarya ilini çevreleyen kutu — [batı, güney] ve [doğu, kuzey].
 *
 * Kuzeyde Karasu/Kocaali'nin Karadeniz kıyısı, güneyde Taraklı, batıda
 * Pamukova–Kaynarca hattı, doğuda Akyazı–Hendek'in Düzce sınırı. Kenarlara
 * küçük bir pay bırakıldı ki sınırdaki adresler ekranın kenarına yapışmasın.
 */
export const SAKARYA_SINIRI: [[number, number], [number, number]] = [
  [30.0, 40.2],
  [31.05, 41.3],
];

/** Nokta kutunun içinde mi? */
export function sinirIcinde(
  nokta: Nokta,
  sinir: [[number, number], [number, number]] = SAKARYA_SINIRI,
): boolean {
  const [[bati, guney], [dogu, kuzey]] = sinir;
  return (
    nokta.lng >= bati &&
    nokta.lng <= dogu &&
    nokta.lat >= guney &&
    nokta.lat <= kuzey
  );
}
