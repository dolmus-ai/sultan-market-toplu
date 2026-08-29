"use client";

import { useEffect } from "react";

import { MarkaIsareti } from "@/bilesenler/Marka";

/**
 * Çalışma anındaki bir hata tüm ekranı boş bırakmasın: kurye sahadayken
 * en azından tek dokunuşla toparlanabilsin.
 */
export default function Hata({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[uygulama hatası]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-yuzey px-6">
      <div className="w-full max-w-sm rounded-[28px] border border-cizgi bg-yuzey p-8 text-center shadow-yuzen">
        <div className="mx-auto mb-5 w-fit">
          <MarkaIsareti boyut={48} />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight">
          Bir şeyler ters gitti
        </h1>
        <p className="mt-2 text-sm text-gri">
          Uygulama beklenmedik bir hatayla karşılaştı. Tekrar denemek
          teslimatlarını kaybetmez.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={reset}
            className="flex h-14 items-center justify-center rounded-hap bg-kirmizi text-[15px] font-black text-white shadow-kirmizi"
          >
            Tekrar dene
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex h-14 items-center justify-center rounded-hap border border-cizgi bg-yuzey text-[15px] font-bold"
          >
            Sayfayı yenile
          </button>
        </div>

        {error.digest && (
          <p className="mt-5 text-[11px] font-semibold text-gri">
            Hata kodu: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
