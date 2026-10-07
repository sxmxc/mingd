import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-path";
export async function GET(request: Request) {
  // Relative Location headers preserve the browser's origin behind Docker/proxies.
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (hash && ["signup", "recovery", "email_change", "email"].includes(type ?? "")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type: type as "signup" | "recovery" | "email_change" | "email" });
    if (!error) return new NextResponse(null, {
      status: 307,
      headers: { Location: type === "recovery" ? "/account/reset-password" : safeAuthNext(url.searchParams.get("next")) },
    });
  }
  return new NextResponse(null, { status: 307, headers: { Location: "/login?error=link" } });
}
