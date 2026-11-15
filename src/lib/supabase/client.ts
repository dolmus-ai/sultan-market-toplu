"use client";

import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/ortam";
import { gecitFetch } from "@/lib/supabase/gecit";

export function tarayiciIstemcisi() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Engelli ağlarda da çalışsın diye istekler kendi alan adımızdan geçiyor.
    global: { fetch: gecitFetch },
  });
}
