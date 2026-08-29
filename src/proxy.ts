import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export default async function proxy(istek: NextRequest) {
  let yanit = NextResponse.next({ request: istek });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const yol = istek.nextUrl.pathname;
  // /onizleme ve onu besleyen rota servisi yalnızca geliştirme ortamında açık.
  const gelistirmeAcik =
    process.env.NODE_ENV !== "production" &&
    (yol.startsWith("/onizleme") || yol.startsWith("/api/rota"));
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
  if (user && acikYol && !gelistirmeAcik) {
    const url = istek.nextUrl.clone();
    url.pathname = "/harita";
    return NextResponse.redirect(url);
  }

  return yanit;
}

export const config = {
  matcher: [
    // Statik varlıklar ve MapLibre worker dosyaları oturum kontrolünden muaf.
    "/((?!_next/static|_next/image|maplibre/|favicon.ico|.*\.(?:svg|png|jpg|jpeg|webp|ico|mjs|js|css|map|webmanifest)$).*)",
  ],
};
