// Fatura/Fiş OCR — Storage'daki görseli indirir, yapay zekâ ile alanları çıkarır.
// Anahtar Vault'tan (get_secret) okunur; istemciye hiçbir sır sızmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = (req.headers.get("Authorization") ?? "").replace(
      "Bearer ",
      ""
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const { path, mod } = await req.json();
    if (typeof path !== "string" || path.includes(".."))
      return json({ error: "bad_request" }, 400);
    // mod: "fatura" (toptancı faturası, varsayılan) | "veresiye" (müşteri fişi + el yazısı)
    const veresiye = mod === "veresiye";

    const { data: file, error: dlErr } = await admin.storage
      .from("belgeler")
      .download(path);
    if (dlErr || !file) return json({ error: "belge_bulunamadi" }, 404);

    const b64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
    const mime = path.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    const { data: apiKey } = await admin.rpc("get_secret", {
      secret_name: "OPENAI_API_KEY",
    });
    if (!apiKey) return json({ error: "anahtar_tanimsiz" }, 500);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Türkiye'deki perakende fişlerini ve e-Arşiv faturaları okuyan bir asistansın. " +
              "Görseldeki bilgileri dikkatle çıkar. Emin olamadığın alanlara null yaz, uydurma.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: veresiye
                  ? "Bu, üzerine el yazısıyla not düşülmüş bir yazarkasa fişi. " +
                    "Bilgileri çıkar ve YALNIZCA şu JSON ile yanıt ver: " +
                    '{"el_yazisi": string|null, "tarih": "YYYY-MM-DD"|null, "toplam": number|null}. ' +
                    "el_yazisi: fişin üzerine EL YAZISIYLA yazılmış metin (genelde bir adres veya kişi adı) — " +
                    "yalnızca el yazısını ver, fişin basılı/matbu metnini bu alana yazma; el yazısı yoksa null. " +
                    "tarih ve toplam: fişin basılı kısmındaki tarih ve genel toplam tutar. " +
                    "Tutarları sayı olarak ver (örn. 1234.56 — binlik ayracı yok, ondalık nokta)."
                  : "Bu fiş/fatura görselinden bilgileri çıkar ve YALNIZCA şu JSON ile yanıt ver: " +
                    '{"tedarikci": string|null, "tarih": "YYYY-MM-DD"|null, "toplam": number|null, ' +
                    '"kdv": number|null, "fatura_no": string|null}. ' +
                    "tedarikci: satıcı firmanın adı. toplam: genel toplam tutar. " +
                    "Tutarları sayı olarak ver (örn. 1234.56 — binlik ayracı yok, ondalık nokta).",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${b64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ error: "ocr_basarisiz", detail: detail.slice(0, 300) }, 502);
    }

    const out = await resp.json();
    let sonuc: unknown = {};
    try {
      sonuc = JSON.parse(out.choices?.[0]?.message?.content ?? "{}");
    } catch {
      sonuc = {};
    }
    return json({ ok: true, sonuc });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
