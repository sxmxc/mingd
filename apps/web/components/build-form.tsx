"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BUILD_CONFIG } from "@gdslimmer/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BuildForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DEFAULT_BUILD_CONFIG),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not create build.");
    router.push(`/build/${body.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Milestone 1 profile</p>
        <h2 className="mt-2 text-xl font-bold">Linux Standard export template</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">This first real build is intentionally fixed while the compiler environment and template packaging are proven. Feature stripping and additional platforms stay unavailable until this template passes the smoke test.</p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          {[["Godot", "4.7.2 stable"], ["Target", "Linux x86_64"], ["Template", "template_release"], ["Optimization", "size"], ["LTO", "disabled"], ["Features", "Standard / unstripped"]].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[#0c1014] p-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
        </dl>
      </Card>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5"><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Build summary</p><p className="mt-4 text-sm leading-6 text-[var(--muted)]">The completed artifact contains a checksum-verified, private Godot template package.</p>{error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<Button className="mt-6 w-full" onClick={submit} disabled={busy}>{busy ? "Queueing…" : "Build template"}</Button></Card>
      </aside>
    </div>
  );
}
