import { NextResponse } from "next/server";

import { dosyayiCoz } from "@/lib/toplu";

/**
 * Excel/CSV dosyasını okuyup müşteri + adres satırlarına çevirir.
 *
 * Bu uç yalnızca okuyor, veritabanına hiç dokunmuyor: kaydı istemci,
 * kuryenin kendi oturumuyla (RLS altında) atıyor.
 */

export const runtime = "nodejs";

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
    satirlar: sonuc.satirlar,
    gecerli: sonuc.gecerli,
    hatali: sonuc.hatali,
  });
}
