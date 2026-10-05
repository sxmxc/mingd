import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid min-h-[68vh] max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="mb-4 font-mono text-xs uppercase tracking-[.28em] text-[var(--accent)]">Custom Godot export templates</p>
          <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.045em] sm:text-7xl">
            Build only the Godot your game needs.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Pick an official Godot release, remove engine features your project does not use, and get a reproducible custom export-template package without maintaining the compiler toolchain yourself.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/build/new" className="rounded-md bg-[var(--accent)] px-5 py-3 font-bold text-[#07111b]">Create a build</Link>
            <Link href="/dashboard" className="rounded-md border border-[var(--border)] px-5 py-3 font-semibold">View builds</Link>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 font-mono text-xs text-[var(--muted)]">gdslimmer / build summary</div>
          <div className="space-y-4 p-5 font-mono text-sm">
            {[
              ["Godot", "4.7.2 stable"],
              ["Target", "Windows x86_64"],
              ["Optimize", "size, LTO disabled"],
              ["Profile", "Standard"],
              ["3D engine", "enabled"],
              ["Validation", "Windows smoke test pending"],
              ["Artifact", "custom .tpz"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-6 border-b border-[#202831] pb-3 last:border-0 last:pb-0">
                <span className="text-[var(--muted)]">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="border-y border-[var(--border)] bg-[#0e1217]">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-10 md:grid-cols-3">
          <div><strong>Official source only.</strong><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Pinned Godot releases are checksum-verified before compilation.</p></div>
          <div><strong>Configuration-aware caching.</strong><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Identical builds reuse the same immutable artifact instead of compiling twice.</p></div>
          <div><strong>No arbitrary build code.</strong><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Users choose allowlisted features; they never upload executable build scripts.</p></div>
        </div>
      </section>
    </main>
  );
}
