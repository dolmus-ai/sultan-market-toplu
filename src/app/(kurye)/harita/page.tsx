import { redirect } from "next/navigation";

import KuryeUygulamasi from "@/bilesenler/KuryeUygulamasi";
import { sunucuIstemcisi } from "@/lib/supabase/server";
import {
  abonelikleriGetir,
  kuryeGetir,
  odemeYontemleriGetir,
  sepetleriGetir,
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

  const [kurye, teslimatlar, abonelikler, sepetler, yontemler, siteler] =
    await Promise.all([
      kuryeGetir(db, user.id),
      siparisleriGetir(db, bugununTarihi()),
      abonelikleriGetir(db),
      sepetleriGetir(db),
      odemeYontemleriGetir(db),
      sitelerGetir(db),
    ]);

  return (
    <KuryeUygulamasi
      kurye={kurye}
      baslangicTeslimatlar={teslimatlar}
      baslangicAbonelikler={abonelikler}
      baslangicSepetler={sepetler}
      baslangicYontemler={yontemler.filter((y) => y.aktif)}
      baslangicSiteler={siteler}
    />
  );
}
