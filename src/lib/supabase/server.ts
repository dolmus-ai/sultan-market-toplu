import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function sunucuIstemcisi() {
  const kutu = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => kutu.getAll(),
        setAll: (cerezler) => {
          try {
            cerezler.forEach(({ name, value, options }) =>
              kutu.set(name, value, options),
            );
          } catch {
            // Server Component içinden yazılamaz; middleware tazeliyor.
          }
        },
      },
    },
  );
}
