import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-path";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (hash && ["signup", "recovery", "email_change", "email"].includes(type ?? "")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type: type as "signup" | "recovery" | "email_change" | "email" });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/account/reset-password" : safeAuthNext(url.searchParams.get("next")), url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
