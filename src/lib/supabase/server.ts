import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/ortam";

export async function sunucuIstemcisi() {
  const kutu = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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
