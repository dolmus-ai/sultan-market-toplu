import { NextResponse } from "next/server";

import { aboneSablonu } from "@/lib/excel";
import { dosyayiCoz } from "@/lib/toplu";

/**
 * Excel/CSV dosyasını okuyup müşteri, adres ve abonelik satırlarına çevirir.
 *
 * Bu uç yalnızca okuyor, veritabanına hiç dokunmuyor: kaydı istemci,
 * kuryenin kendi oturumuyla (RLS altında) atıyor.
 *
 * GET aynı yoldan boş şablonu indiriyor — kullanıcının dolduracağı dosya ile
 * buranın beklediği biçim tek yerden geldiği için ayrışamıyorlar.
 */

export const runtime = "nodejs";

export async function GET() {
  try {
    const tampon = await aboneSablonu();
    return new NextResponse(new Uint8Array(tampon), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="sultan-market-abone-sablonu.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (hata) {
    console.error("[toplu-musteri] şablon yazılamadı", hata);
    return NextResponse.json({ hata: "Şablon üretilemedi." }, { status: 500 });
  }
}

/** 5 MB — market ölçeğinde binlerce satır bunun çok altında kalıyor. */
const AZAMI_BOYUT = 5 * 1024 * 1024;

export async function POST(istek: Request) {
  let dosya: File | null = null;
  try {
    const form = await istek.formData();
    const d = form.get("dosya");
    if (d instanceof File) dosya = d;
  } catch {
    return NextResponse.json({ hata: "Dosya okunamadı." }, { status: 400 });
  }

  if (!dosya) {
    return NextResponse.json({ hata: "Dosya gönderilmedi." }, { status: 400 });
  }
  if (dosya.size > AZAMI_BOYUT) {
    return NextResponse.json(
      { hata: "Dosya 5 MB'tan büyük olamaz." },
      { status: 413 },
    );
  }

  const sonuc = await dosyayiCoz(
    dosya.name,
    Buffer.from(await dosya.arrayBuffer()),
  );

  if (!sonuc.tamam) {
    return NextResponse.json({ hata: sonuc.hata }, { status: 422 });
  }

  return NextResponse.json({
    bicim: sonuc.bicim,
    satirlar: sonuc.satirlar,
    gecerli: sonuc.gecerli,
    hatali: sonuc.hatali,
    abonelik: sonuc.abonelik,
    uyarilar: sonuc.uyarilar,
  });
}
