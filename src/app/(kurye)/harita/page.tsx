import { redirect } from "next/navigation";

import KuryeUygulamasi from "@/bilesenler/KuryeUygulamasi";
import { sunucuIstemcisi } from "@/lib/supabase/server";
import {
  abonelikleriGetir,
  kuryeGetir,
  odemeYontemleriGetir,
  sitelerGetir,
  siparisleriGetir,
} from "@/lib/veri";
import { bugununTarihi } from "@/lib/bicim";

export const dynamic = "force-dynamic";

export default async function HaritaSayfasi() {
  const db = await sunucuIstemcisi();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/giris");

  // Kurye kaydı yoksa oluştur: RLS okuma yetkisi buna bağlı.
  await db.from("kuryeler").upsert(
    {
      id: user.id,
      ad: user.user_metadata?.ad ?? user.email?.split("@")[0] ?? "Kurye",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  const [kurye, teslimatlar, abonelikler, yontemler, siteler, profil] =
    await Promise.all([
      kuryeGetir(db, user.id),
      siparisleriGetir(db, bugununTarihi()),
      abonelikleriGetir(db),
      odemeYontemleriGetir(db),
      sitelerGetir(db),
      // Defter ekibi (profiles kaydı olan) deftere geri dönebilir.
      db.from("profiles").select("id").eq("id", user.id).maybeSingle(),
    ]);

  return (
    <KuryeUygulamasi
      kurye={kurye}
      baslangicTeslimatlar={teslimatlar}
      baslangicAbonelikler={abonelikler}
      baslangicYontemler={yontemler.filter((y) => y.aktif)}
      baslangicSiteler={siteler}
      defterErisimi={profil.data != null}
    />
  );
}
