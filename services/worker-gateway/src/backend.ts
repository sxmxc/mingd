import { createClient } from "@supabase/supabase-js";

export function backendConfigFromEnvironment(values: NodeJS.ProcessEnv = process.env) {
  const url = values.SUPABASE_URL ?? values.NEXT_PUBLIC_SUPABASE_URL;
  const key = values.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Configure the server Supabase URL and secret key.");
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Invalid server Supabase URL.");
  }
  return { url, key };
}

export function createGatewayDatabase(values: NodeJS.ProcessEnv = process.env, timeoutMs = 10_000) {
  const { url, key } = backendConfigFromEnvironment(values);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init, signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    }) },
  });
}
