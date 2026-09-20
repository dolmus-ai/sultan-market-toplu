import { NextResponse } from "next/server";

import {
  abonelikleriYaz,
  dosyaAdi,
  sepetleriYaz,
  teslimatlariYaz,
  type DisAbonelik,
  type DisSepet,
  type DisTeslimat,
  type DisaAktarTuru,
} from "@/lib/excel";

/**
 * Listeleri Excel dosyasına çevirir.
 *
 * Kayıtları istemci gönderiyor; bu uç veritabanına hiç dokunmuyor. Sebebi
 * `/api/toplu-musteri` ile aynı: veri okuma kuryenin kendi oturumuyla, RLS
 * altında yapılıyor. Burada yalnızca biçimlendirme var.
 */

export const runtime = "nodejs";

/** Bir seferde dışa aktarılabilecek kayıt sayısı. */
const AZAMI_KAYIT = 20_000;

const TURLER: DisaAktarTuru[] = ["teslimatlar", "abonelikler", "sepetler"];

export async function POST(istek: Request) {
  let govde: { tur?: string; kayitlar?: unknown[] };
  try {
    govde = (await istek.json()) as typeof govde;
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 });
  }

  const tur = govde.tur as DisaAktarTuru;
  if (!TURLER.includes(tur)) {
    return NextResponse.json(
      { hata: "Bilinmeyen liste türü." },
      { status: 400 },
    );
  }

  const kayitlar = Array.isArray(govde.kayitlar) ? govde.kayitlar : [];
  if (kayitlar.length === 0) {
    return NextResponse.json(
      { hata: "Dışa aktarılacak kayıt yok." },
      { status: 400 },
    );
  }
  if (kayitlar.length > AZAMI_KAYIT) {
    return NextResponse.json(
      { hata: `En fazla ${AZAMI_KAYIT} kayıt aktarılabilir.` },
      { status: 413 },
    );
  }

  let tampon: Buffer;
  try {
    if (tur === "teslimatlar") {
      tampon = await teslimatlariYaz(kayitlar as DisTeslimat[]);
    } else if (tur === "abonelikler") {
      tampon = await abonelikleriYaz(kayitlar as DisAbonelik[]);
    } else {
      tampon = await sepetleriYaz(kayitlar as DisSepet[]);
    }
  } catch (hata) {
    console.error("[disa-aktar] dosya yazılamadı", hata);
    return NextResponse.json(
      { hata: "Dosya oluşturulamadı." },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(tampon), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dosyaAdi(tur)}"`,
      "Cache-Control": "no-store",
    },
  });
}
