"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BUILD_CONFIG, PRESETS, type Platform, type SupportedPresetId } from "@gdslimmer/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BuildForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("linux");
  const [profile, setProfile] = useState<SupportedPresetId>("standard");
  async function submit() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/builds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...DEFAULT_BUILD_CONFIG, platform, features: PRESETS[profile].features }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not create build.");
      router.push(`/build/${body.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Connection failed. Try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <Card className="p-6 space-y-8">
      <fieldset disabled={busy}><legend className="section-label">01 / Target platform</legend><div className="choice-grid mt-4">{(["linux", "windows"] as const).map(value => <label key={value} className={`choice ${platform === value ? "selected" : ""}`}><input type="radio" name="platform" checked={platform === value} onChange={() => setPlatform(value)} /><span><strong>{value === "linux" ? "Linux" : "Windows"}</strong><small>x86_64 · {value === "linux" ? "ELF" : "PE / GUI + console"}</small></span></label>)}</div></fieldset>
      <fieldset disabled={busy}><legend className="section-label">02 / Engine profile</legend><div className="choice-grid mt-4">{(["standard", "lean2d"] as const).map(value => <label key={value} className={`choice ${profile === value ? "selected" : ""}`}><input type="radio" name="profile" checked={profile === value} onChange={() => setProfile(value)} /><span><strong>{PRESETS[value].label}</strong><small>{value === "standard" ? "Full desktop engine feature set" : "2D-focused · remove 3D and XR"}</small></span></label>)}</div></fieldset>
      <div className="tool-note"><strong>{profile === "lean2d" ? "Check project compatibility" : "General-purpose compatibility"}</strong><p>{profile === "lean2d" ? "Retains 2D rendering, physics, navigation, UI, audio, and networking. Removes 3D, 3D physics/navigation, Jolt, XR, glTF, CSG, and GridMap. Projects relying on removed features cannot use this template. Native smoke validation is still required." : "Retains the desktop engine features for 2D and 3D projects. Use this as your compatibility baseline."}</p></div>
      {platform === "windows" && <p className="text-sm text-[var(--muted)]">Vulkan and OpenGL supported. Direct3D 12, ANGLE, screen readers, and WinRT/OneCore are not included.</p>}
      <details><summary>Recipe details</summary><dl className="inspector mt-4"><dt>Source</dt><dd>Godot 4.7.2 · checksum verified</dd><dt>Template</dt><dd>Release only</dd><dt>Optimization</dt><dd>Size · LTO disabled</dd><dt>Inputs</dt><dd>Allowlisted configuration only</dd></dl></details>
    </Card>
    <aside className="lg:sticky lg:top-6 lg:self-start"><Card className="p-5"><p className="section-label">Build recipe</p><h2 className="mt-4 text-xl font-semibold">{PRESETS[profile].label}</h2><p className="mt-2 font-mono text-sm text-[var(--muted)]">{platform} / x86_64 / release</p><hr className="my-5 border-[var(--border)]" /><p className="text-sm leading-6 text-[var(--muted)]">Compilation can take a while. Follow worker activity and compiler output in the monitor. Identical recipes reuse an existing artifact.</p><p className="mt-4 text-sm">Output: private <code>.tpz</code> package</p>{error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<Button type="submit" className="mt-6 w-full" disabled={busy}>{busy && <span className="spinner" />}{busy ? "Submitting recipe…" : "Build template →"}</Button></Card></aside>
  </form>;
}
