import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/ortam";

export default async function proxy(istek: NextRequest) {
  let yanit = NextResponse.next({ request: istek });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => istek.cookies.getAll(),
        setAll: (cerezler) => {
          cerezler.forEach(({ name, value }) =>
            istek.cookies.set(name, value),
          );
          yanit = NextResponse.next({ request: istek });
          cerezler.forEach(({ name, value, options }) =>
            yanit.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Supabase'e ulaşılamazsa tüm site 500 vermesin: oturumsuz sayıp giriş
  // sayfasına yönlendiriyoruz — kapalı tarafa düşen güvenli davranış.
  let user = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (hata) {
    console.error("[proxy] oturum okunamadı", hata);
  }

  const yol = istek.nextUrl.pathname;
  // /onizleme ve onu besleyen servisler yalnızca geliştirme ortamında açık.
  // Buradakilerin hiçbiri veritabanına dokunmuyor ve hiçbiri para harcamıyor:
  // rota hesabı ve Excel biçimlendirme. Üretimde hepsi oturum arkasında.
  // `/api/adres-zeka` bilerek listede değil: her çağrısı Claude faturasına
  // yazılıyor, geliştirmede bile oturum istiyor.
  const gelistirmeAcik =
    process.env.NODE_ENV !== "production" &&
    (yol.startsWith("/onizleme") ||
      yol.startsWith("/api/rota") ||
      yol.startsWith("/api/navigasyon") ||
      yol.startsWith("/api/disa-aktar") ||
      yol.startsWith("/api/toplu-musteri") ||
      yol.startsWith("/api/site-ara") ||
      yol.startsWith("/api/site-dogrula"));
  const acikYol = yol.startsWith("/giris") || gelistirmeAcik;

  if (!user && !acikYol) {
    // API çağrılarını giriş sayfasına yönlendirmek istemciye HTML döndürür;
    // bunun yerine açık bir 401 veriyoruz.
    if (yol.startsWith("/api/")) {
      return NextResponse.json({ hata: "Oturum gerekli" }, { status: 401 });
    }
    const url = istek.nextUrl.clone();
    url.pathname = "/giris";
    return NextResponse.redirect(url);
  }
  if (!user) return yanit;

  /*
   * Bakkal defteri ekranları yalnızca defter ekibine (profiles kaydı olan
   * sahip/personel) açık. Kurye hesaplarının profiles kaydı yok; RLS de
   * herkese yalnızca kendi satırını gösterdiğinden satırın varlığı yeterli.
   * Kurye ekranları (harita, giriş, API) her oturuma açık: defter ekibi
   * kurye moduna tek dokunuşla geçebiliyor.
   */
  const kuryeYolu =
    yol.startsWith("/harita") ||
    yol.startsWith("/onizleme") ||
    yol.startsWith("/api/");
  const defterYolu = !kuryeYolu && !yol.startsWith("/giris");

  if (acikYol && !gelistirmeAcik) {
    // Girişten sonra hesabın kendi ana ekranına.
    const url = istek.nextUrl.clone();
    url.pathname = (await defterEkibiMi(supabase, user.id)) ? "/" : "/harita";
    return NextResponse.redirect(url);
  }
  if (defterYolu && !(await defterEkibiMi(supabase, user.id))) {
    const url = istek.nextUrl.clone();
    url.pathname = "/harita";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return yanit;
}

/** Oturumdaki kullanıcı bakkal defteri ekibinden mi (sahip/personel)? */
async function defterEkibiMi(
  supabase: ReturnType<typeof createServerClient>,
  kullaniciId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", kullaniciId)
      .maybeSingle();
    return data != null;
  } catch (hata) {
    // Okunamazsa kapalı tarafa düş: defter açılmaz, kurye ekranı açılır.
    console.error("[proxy] hesap türü okunamadı", hata);
    return false;
  }
}

export const config = {
  matcher: [
    // Statik varlıklar, MapLibre worker dosyaları ve herkese açık OSM
    // derlemesi (/veri/sakarya-siteler.json) oturum kontrolünden muaf.
    "/((?!_next/static|_next/image|maplibre/|veri/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|mjs|js|css|map|webmanifest)$).*)",
  ],
};
