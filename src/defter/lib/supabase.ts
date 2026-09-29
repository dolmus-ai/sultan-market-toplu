import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/ortam";

// Oturum çerezde tutulur: kurye tarafıyla ve sunucudaki proxy ile aynı
// oturum paylaşılsın, tek girişle iki ekran arasında geçilebilsin.
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
