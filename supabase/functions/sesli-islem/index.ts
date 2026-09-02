// Sesli işlem — telefondan kaydedilen sesi yazıya çevirir, ardından işlem
// alanlarına (tür, cari, tutar, yöntem, tarih, açıklama) ayrıştırır.
// Anahtar Vault'tan (get_secret) okunur; istemciye hiçbir sır sızmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";

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

    const { audio, mime } = await req.json();
    // ~10 MB base64 sınırı — normal bir sesli komut birkaç yüz KB'dir
    if (typeof audio !== "string" || !audio || audio.length > 14_000_000)
      return json({ error: "bad_request" }, 400);

    const { data: apiKey } = await admin.rpc("get_secret", {
      secret_name: "OPENAI_API_KEY",
    });
    if (!apiKey) return json({ error: "anahtar_tanimsiz" }, 500);

    // 1) Sesi yazıya çevir
    const sesTip = typeof mime === "string" && mime ? mime : "audio/webm";
    const uzanti = sesTip.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append(
      "file",
      new Blob([decodeBase64(audio)], { type: sesTip }),
      `kayit.${uzanti}`
    );
    form.append("model", "gpt-4o-transcribe");
    form.append("language", "tr");

    const trResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!trResp.ok) {
      const detail = await trResp.text();
      return json(
        { error: "ses_cozulemedi", detail: detail.slice(0, 300) },
        502
      );
    }
    const metin = String((await trResp.json()).text ?? "").trim();
    if (!metin) return json({ error: "ses_anlasilamadi" }, 422);

    // 2) Metni işlem alanlarına ayrıştır
    const bugun = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Istanbul",
    });
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
              "Bir bakkalın veresiye defteri uygulaması için sesli komutları ayrıştırırsın. " +
              "Emin olamadığın alanlara null yaz, uydurma.",
          },
          {
            role: "user",
            content:
              `Sesli komut: "${metin}". Bugün ${bugun}. ` +
              "YALNIZCA şu JSON ile yanıt ver: " +
              '{"tur": "gelen_odeme"|"veresiye"|"yapilan_odeme"|"fatura"|null, ' +
              '"cari": string|null, "tutar": number|null, ' +
              '"odeme_yontemi": "nakit"|"kredi_karti"|"yemek_karti"|null, ' +
              '"kart": string|null, ' +
              '"tarih": "YYYY-MM-DD"|null, "aciklama": string|null}. ' +
              "Kurallar: müşteriden ödeme/para alındıysa gelen_odeme; " +
              "müşteriye veresiye/borç yazıldıysa veresiye; " +
              "toptancıya/tedarikçiye ödeme yapıldıysa yapilan_odeme; " +
              "toptancıdan fatura/mal geldiyse fatura. " +
              "cari: bahsedilen kişi veya firma adı. tutar: TL cinsinden sayı " +
              "(örn. 1234.56 — binlik ayracı yok, ondalık nokta). " +
              "tarih: yalnızca komutta geçiyorsa ('dün', '15 Temmuz' gibi ifadeleri " +
              "bugüne göre çevir); geçmiyorsa null. " +
              "kart: kartla ödendiyse söylenen kart adı (örn. 'garanti pos', " +
              "'sodexo'); geçmiyorsa null. " +
              "aciklama: tür/cari/tutar/kart dışında kalan anlamlı not; yoksa null.",
          },
        ],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return json(
        { error: "cozumleme_basarisiz", detail: detail.slice(0, 300) },
        502
      );
    }

    const out = await resp.json();
    let sonuc: unknown = {};
    try {
      sonuc = JSON.parse(out.choices?.[0]?.message?.content ?? "{}");
    } catch {
      sonuc = {};
    }
    return json({ ok: true, metin, sonuc });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
