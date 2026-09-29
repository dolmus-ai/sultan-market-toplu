// Kullanıcı yönetimi — yalnızca "sahip" rolü çağırabilir.
// create: yeni personel hesabı açar; set_active: hesabı pasife alır / geri açar.
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (prof?.role !== "sahip") return json({ error: "forbidden" }, 403);

    const body = await req.json();

    if (body.action === "create") {
      const { email, password, full_name } = body;
      if (
        typeof email !== "string" ||
        !email.includes("@") ||
        typeof password !== "string" ||
        password.length < 6 ||
        typeof full_name !== "string" ||
        !full_name.trim()
      ) {
        return json({ error: "bad_request" }, 400);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim() },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, user_id: data.user.id });
    }

    if (body.action === "set_active") {
      const { user_id, aktif } = body;
      if (typeof user_id !== "string" || typeof aktif !== "boolean")
        return json({ error: "bad_request" }, 400);
      if (user_id === userData.user.id)
        return json({ error: "kendi_hesabin" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: aktif ? "none" : "876000h",
      });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ aktif }).eq("id", user_id);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
