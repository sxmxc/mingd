import { createBrowserClient } from "@supabase/ssr";

// Pass only the public URL/key supplied by a server at runtime.
export function createClient(supabaseUrl: string, supabasePublishableKey: string) {
  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey,
  );
}
