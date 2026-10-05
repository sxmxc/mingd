import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <header className="border-b border-[var(--border)] bg-[#0b0d10cc] backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between px-4 lg:px-6">
        <Link href="/" className="flex items-baseline gap-2 font-black tracking-tight">
          <span className="font-mono text-xl" aria-label="min.gd">min<span className="text-[var(--accent)]">.</span>gd</span>
          <span className="hidden text-xs font-mono text-[var(--muted)] sm:inline">/ Export Template Workbench</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {data.user ? (
            <>
              <Link href="/dashboard" className="text-[var(--muted)] hover:text-white">Builds</Link>
              <Link href="/build/new" className="rounded-md bg-[var(--accent)] px-3 py-2 font-semibold text-[#07111b]">New build</Link>
              <Link href="/logout" className="rounded-md border border-[var(--border)] px-3 py-2">Sign out</Link>
            </>
          ) : (
            <Link href="/login" className="rounded-md border border-[var(--border)] px-3 py-2">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
