import { NextResponse } from "next/server";

/**
 * Yayındaki derlemenin kimliği. Açık sekmeler kendi gömülü sürümleriyle
 * karşılaştırıp yeni dağıtımı fark ediyor (ServisCalisani).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { surum: process.env.UYGULAMA_SURUM ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
