import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <header className="border-b border-[var(--border)] bg-[#0b0d10cc] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-baseline gap-2 font-black tracking-tight">
          <span className="text-xl">gdslimmer</span>
          <span className="text-xs font-medium text-[var(--muted)]">Godot template builder</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {data.user ? (
            <>
              <Link href="/dashboard" className="text-[var(--muted)] hover:text-white">Builds</Link>
              <Link href="/build/new" className="rounded-md bg-[var(--accent)] px-3 py-2 font-semibold text-[#07111b]">New build</Link>
            </>
          ) : (
            <Link href="/login" className="rounded-md border border-[var(--border)] px-3 py-2">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
