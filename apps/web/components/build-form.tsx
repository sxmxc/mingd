"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BUILD_CONFIG, type Platform } from "@gdslimmer/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BuildForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("linux");

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...DEFAULT_BUILD_CONFIG, platform }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not create build.");
    router.push(`/build/${body.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Standard profile</p>
        <h2 className="mt-2 text-xl font-bold">Desktop export template</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Keep the standard engine features and optimize for size. Linux has passed the smoke test; Windows is available for validation.</p>
        <label className="mt-5 block text-sm">Platform<select className="mt-2 block w-full rounded-md border border-[var(--border)] bg-[#0c1014] px-3 py-2" value={platform} onChange={(event) => setPlatform(event.target.value as Platform)} disabled={busy}><option value="linux">Linux x86_64</option><option value="windows">Windows x86_64</option></select></label>
        {platform === "windows" && <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Windows supports Vulkan and OpenGL. Direct3D 12, ANGLE, screen reader integration, and WinRT/OneCore integration are unavailable in this build.</p>}
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          {[["Godot", "4.7.2 stable"], ["Target", `${platform === "linux" ? "Linux" : "Windows"} x86_64`], ["Template", "template_release"], ["Optimization", "size"], ["LTO", "disabled"], ["Features", "Standard"]].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[#0c1014] p-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
        </dl>
      </Card>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5"><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Build summary</p><p className="mt-4 text-sm leading-6 text-[var(--muted)]">The completed artifact contains a checksum-verified, private Godot template package.</p>{error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<Button className="mt-6 w-full" onClick={submit} disabled={busy}>{busy ? "Queueing…" : "Build template"}</Button></Card>
      </aside>
    </div>
  );
}
