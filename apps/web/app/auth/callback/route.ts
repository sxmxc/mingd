import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-path";
export async function GET(request: Request) {
  // Relative Location headers preserve the browser's origin behind Docker/proxies.
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return new NextResponse(null, {
      status: 307,
      headers: { Location: safeAuthNext(url.searchParams.get("next")) },
    });
  }
  return new NextResponse(null, { status: 307, headers: { Location: "/login?error=link" } });
}
