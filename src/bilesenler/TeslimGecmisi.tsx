"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { para } from "@/lib/bicim";
import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { musteriTeslimGecmisi, type GecmisTeslim } from "@/lib/veri";

/** "bugün", "dün", "3 gün önce" ya da "12 Kas". */
export function teslimGunu(iso: string): string {
  const t = new Date(iso);
  const bugun = new Date();
  const gunFarki = Math.round(
    (new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()).getTime() -
      new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) /
      86_400_000,
  );
  if (gunFarki <= 0) return "bugün";
  if (gunFarki === 1) return "dün";
  if (gunFarki < 7) return `${gunFarki} gün önce`;
  return t.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    ...(t.getFullYear() !== bugun.getFullYear() ? { year: "numeric" } : {}),
  });
}

function odemeMetni(t: GecmisTeslim): string {
  if (t.odeme_alindi === false) return "Ödeme alınmadı";
  if (t.odeme_yontemi === "veresiye") return "Veresiye";
  if (t.odeme_alindi) return "✓ Tahsil";
  return "";
}

/**
 * Müşterinin teslim geçmişi kartı: "Daha önce 5 kez teslim edildi · son dün".
 * Dokununca son teslimler açılıyor. Kaynak silinmez `teslim_gecmisi`
 * tablosu; sipariş listeden silinmiş olsa bile sayılıyor.
 */
export default function TeslimGecmisi({
  musteriId,
  haricSiparis,
}: {
  musteriId: string | null | undefined;
  /** Açık olan siparişin kendi teslimi "daha önce" sayılmasın. */
  haricSiparis?: string;
}) {
  const [db] = useState(() => tarayiciIstemcisi());
  const [veri, setVeri] = useState<{
    anahtar: string;
    adet: number;
    liste: GecmisTeslim[];
  } | null>(null);
  const [acik, setAcik] = useState(false);
  const anahtar = `${musteriId ?? ""}|${haricSiparis ?? ""}`;

  useEffect(() => {
    if (!musteriId) return;
    let iptal = false;
    musteriTeslimGecmisi(db, musteriId, haricSiparis)
      .then((v) => {
        if (!iptal) setVeri({ anahtar, ...v });
      })
      .catch(() => {
        /* okunamazsa kart hiç görünmesin */
      });
    return () => {
      iptal = true;
    };
  }, [db, musteriId, haricSiparis, anahtar]);

  // Başka müşteriye geçilince eski veri görünmesin.
  if (!musteriId || !veri || veri.anahtar !== anahtar) return null;

  if (veri.adet === 0) {
    return (
      <p className="flex items-center gap-1.5 rounded-2xl bg-yuzey2 px-3 py-2 text-[11.5px] font-semibold text-gri">
        <span className="text-[13px]">✦</span>
        Bu müşteriye ilk teslimat
      </p>
    );
  }

  const son = veri.liste[0];
  return (
    <div className="overflow-hidden rounded-2xl border border-cizgi bg-yuzey">
      <button
        onClick={() => setAcik((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yesil/15 text-[12px] font-black text-yesil">
          {veri.adet > 99 ? "99+" : veri.adet}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[12.5px] font-bold">
            Daha önce {veri.adet} kez teslim edildi
          </span>
          {son && (
            <span className="block truncate text-[11px] text-gri">
              Son: {teslimGunu(son.teslim_zamani)}
              {son.tutar != null ? ` · ${para(son.tutar)}` : ""}
            </span>
          )}
        </span>
        <motion.span
          animate={{ rotate: acik ? 180 : 0 }}
          className="shrink-0 text-[11px] text-gri"
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {acik && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="divide-y divide-cizgi border-t border-cizgi"
          >
            {veri.liste.map((t) => (
              <li
                key={`${t.siparis_id}-${t.teslim_zamani}`}
                className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]"
              >
                <span className="flex-1 font-semibold">{teslimGunu(t.teslim_zamani)}</span>
                <span className="text-gri">{odemeMetni(t)}</span>
                <span className="w-20 text-right font-bold">
                  {t.odeme_tutari != null
                    ? para(t.odeme_tutari)
                    : t.tutar != null
                      ? para(t.tutar)
                      : "—"}
                </span>
              </li>
            ))}
            {veri.adet > veri.liste.length && (
              <li className="px-3 py-1.5 text-[11px] text-gri">
                + {veri.adet - veri.liste.length} eski teslim daha
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
