/** Standalone Next.js can construct request.url from its internal listen address. */
export function recipeRequestAllowed(request: Request, publicAppUrl?: string) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let browserOrigin;
  try { browserOrigin = new URL(origin); } catch { return false; }
  if (!["http:", "https:"].includes(browserOrigin.protocol) || browserOrigin.origin !== origin) return false;
  if (origin === new URL(request.url).origin) return true;
  // Host is the browser-facing request authority, even when request.url is internal.
  const host = request.headers.get("host");
  if (host && browserOrigin.host === host.trim().toLowerCase()) return true;
  // A proxy may replace Host. Accept only an explicitly configured public origin.
  if (publicAppUrl) {
    try { return origin === new URL(publicAppUrl).origin; } catch { return false; }
  }
  return false;
}
