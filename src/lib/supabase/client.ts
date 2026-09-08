"use client";

import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/ortam";

export function tarayiciIstemcisi() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
}
