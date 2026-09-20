import { NextResponse } from "next/server";

import { OBEK, adresleriCoz } from "@/lib/adres-zeka";
import { CLAUDE_ANAHTARI } from "@/lib/ortam";

/**
 * Defterdeki tarif adreslerini ayıklar.
 *
 * Tek istekte yalnızca bir öbek (en çok 40 adres) çözülüyor. Bin iki yüz
 * adresi tek istekte göndermek Vercel'in süre sınırına takılırdı; istemci
 * öbek öbek çağırıp ilerlemeyi gösteriyor, bir öbek hata alırsa yalnızca o
 * yeniden deneniyor.
 *
 * Koordinat aramak bu ucun işi değil: çıkan temiz sorgular istemcide
 * gruplanıp `/api/geokod`'a gidiyor, böylece aynı site bir kez aranıyor.
 */

export const runtime = "nodejs";
/** Claude çağrısı birkaç saniye sürebiliyor; öntanımlı 10 sn yetmiyor. */
export const maxDuration = 60;

export async function POST(istek: Request) {
  if (!CLAUDE_ANAHTARI) {
    return NextResponse.json(
      {
        hata:
          "Adres çözümleme kapalı: sunucuda ANTHROPIC_API_KEY tanımlı değil.",
        anahtarsiz: true,
      },
      { status: 503 },
    );
  }

  let govde: { adresler?: { id?: unknown; metin?: unknown }[] };
  try {
    govde = (await istek.json()) as typeof govde;
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }

  const girdiler = (Array.isArray(govde.adresler) ? govde.adresler : [])
    .map((a) => ({ id: String(a?.id ?? ""), metin: String(a?.metin ?? "") }))
    .filter((a) => a.id && a.metin.trim());

  if (girdiler.length === 0) {
    return NextResponse.json({ hata: "Çözülecek adres yok." }, { status: 400 });
  }
  if (girdiler.length > OBEK) {
    return NextResponse.json(
      { hata: `Bir istekte en fazla ${OBEK} adres çözülebilir.` },
      { status: 413 },
    );
  }

  try {
    const cozumler = await adresleriCoz(girdiler);
    return NextResponse.json({ cozumler });
  } catch (hata) {
    console.error("[adres-zeka] çözülemedi", hata);
    return NextResponse.json(
      { hata: "Adresler çözümlenemedi." },
      { status: 502 },
    );
  }
}
