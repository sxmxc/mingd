"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_BUILD_CONFIG, PRESETS, SUPPORTED_PRESET_IDS, FEATURE_GROUPS,
  buildPresetId, normalizeBuildConfig, toSconsArgs,
  SUPPORTED_GODOT_VERSIONS, GODOT_VERSION_IDS,
  type GodotVersionId, type TemplateKind, type BuildFeatures, type BooleanFeature, type Platform, type SupportedPresetId,
} from "@mingd/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BuildForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("linux");
  const [godotVersion, setGodotVersion] = useState<GodotVersionId>(DEFAULT_BUILD_CONFIG.godotVersion);
  const [templateSelection, setTemplateSelection] = useState("release");
  const [webThreads, setWebThreads] = useState(false);
  const [startingProfile, setStartingProfile] = useState<SupportedPresetId>("standard");
  const [features, setFeatures] = useState<BuildFeatures>({ ...PRESETS.standard.features });
  const [notice, setNotice] = useState("");
  const templateKinds: TemplateKind[] = templateSelection === "both" ? ["release", "debug"] : [templateSelection as TemplateKind];
  const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, platform, godotVersion, templateKinds, webThreads, architecture: platform === "web" ? "wasm32" : "x86_64", features });
  const profile = buildPresetId(config);
  const profileLabel = profile ? PRESETS[profile].label : "Custom";

  function chooseProfile(id: SupportedPresetId) {
    setStartingProfile(id);
    setFeatures({ ...PRESETS[id].features });
    setNotice(`${PRESETS[id].label} loaded. You can edit the features below.`);
  }
  function changeFeature(key: BooleanFeature | "textServer", value: boolean | BuildFeatures["textServer"]) {
    const requested = { ...features, [key]: value };
    const normalized = normalizeBuildConfig({ ...config, features: requested }).features;
    const adjusted = FEATURE_GROUPS.flatMap(group => group.options)
      .filter(option => requested[option.key] !== normalized[option.key]).map(option => option.label);
    setFeatures(normalized);
    setNotice(adjusted.length ? `Automatically disabled dependencies: ${adjusted.join(", ")}. Re-enabling a parent does not automatically restore them.` : "Recipe updated.");
  }
  async function submit() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/builds", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(config),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not create build.");
      router.push(`/build/${body.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Connection failed. Try again.");
    } finally { setBusy(false); }
  }
  const removed = FEATURE_GROUPS.flatMap(group => group.options).filter(option => !config.features[option.key]).map(option => option.label);
  if (config.features.textServer === "fallback") removed.push("Advanced text shaping");
  return <form onSubmit={event => { event.preventDefault(); void submit(); }} className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <Card className="p-6 space-y-8">
      <fieldset disabled={busy}>
        <legend className="section-label">01 / Version and target</legend>
        <label className="mt-4 block text-sm">Godot version
          <select className="mt-2 block w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" value={godotVersion} onChange={event => setGodotVersion(event.target.value as GodotVersionId)}>
            {GODOT_VERSION_IDS.map(id => <option key={id} value={id}>{SUPPORTED_GODOT_VERSIONS[id].displayName}</option>)}
          </select>
          <span className="mt-2 block text-xs text-[var(--muted)]">Choose the exact version of your Godot editor.</span>
        </label>
        <div className="choice-grid mt-4">{(["linux", "windows", "web"] as const).map(value =>
          <label key={value} className={`choice ${platform === value ? "selected" : ""}`}>
            <input type="radio" name="platform" checked={platform === value} onChange={() => setPlatform(value)} />
            <span><strong>{value === "linux" ? "Linux" : value === "web" ? "Web" : "Windows"}</strong><small>{value === "web" ? "wasm32 · WebGL 2" : `x86_64 · ${value === "linux" ? "ELF" : "PE / GUI + console"}`}</small></span>
          </label>,
        )}</div>
        <label className="mt-4 block text-sm">Template kind
          <select className="mt-2 block w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" value={templateSelection} onChange={event => setTemplateSelection(event.target.value)}>
            <option value="release">Release — shipping exports</option>
            <option value="debug">Debug — debugging exports</option>
            <option value="both">Release + debug — both in one package</option>
          </select>
        </label>
        {platform === "web" && <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={webThreads} onChange={event => setWebThreads(event.target.checked)} />
          <span>Thread support<span className="mt-2 block text-xs text-[var(--muted)]">Match Thread Support in Godot's Web export preset. Threaded hosting requires COOP/COEP headers. Single-threaded exports do not require cross-origin isolation.</span></span>
        </label>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend className="section-label">02 / Starting preset</legend>
        <div className="choice-grid mt-4">{SUPPORTED_PRESET_IDS.map(id =>
          <label key={id} className={`choice ${profile === id ? "selected" : ""}`}>
            <input type="radio" name="profile" checked={profile === id} onChange={() => chooseProfile(id)} />
            <span><strong>{PRESETS[id].label}</strong><small>{PRESETS[id].description}</small></span>
          </label>,
        )}</div>
        <p className="mt-3 text-xs text-[var(--muted)]">Presets are starting points. New profiles and custom combinations require native project validation; successful packaging is not proof of compatibility.</p>
      </fieldset>
      <fieldset disabled={busy} className="space-y-6">
        <legend className="section-label">03 / Engine features</legend>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-sm">{profileLabel}</span>
          <Button type="button" variant="secondary" onClick={() => chooseProfile(startingProfile)}>Reset to {PRESETS[startingProfile].label}</Button>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-[var(--accent)]">{notice}</p>
        {FEATURE_GROUPS.map(group => <section key={group.label}>
          <h3 className="mb-3 text-sm font-semibold">{group.label}</h3>
          <div className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {group.options.map(option => {
              const platformUnavailable = platform === "web" && (option.key === "openxr" || option.key === "enet");
              const unavailable = option.locked || platformUnavailable || (option.requires && !config.features[option.requires]);
              return <label key={option.key} className="flex items-start gap-3 p-4">
                <input className="mt-1" type="checkbox" checked={config.features[option.key]} disabled={!!unavailable} onChange={event => changeFeature(option.key, event.target.checked)} />
                <span><span className="text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{option.consequence}{platformUnavailable ? " Unavailable in browser exports." : option.requires && !config.features[option.requires] ? " Enable its parent feature first." : ""}</span></span>
              </label>;
            })}
          </div>
        </section>)}
        <label className="block text-sm">Text shaping
          <select className="mt-2 block w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" value={config.features.textServer} onChange={event => changeFeature("textServer", event.target.value as BuildFeatures["textServer"])}>
            <option value="advanced">Advanced — complex scripts and bidirectional text</option>
            <option value="fallback">Fallback — basic text, reduced shaping support</option>
          </select>
          <span className="mt-2 block text-xs text-[var(--muted)]">Fallback can break complex-script layout and internationalized UI. Test every language your project supports.</span>
        </label>
      </fieldset>
      {platform === "windows" && <p className="text-sm text-[var(--muted)]">Vulkan and OpenGL supported. Direct3D 12, ANGLE, screen readers, and WinRT/OneCore are not included.</p>}
      {platform === "web" && <p className="text-sm text-[var(--muted)]">Use the Compatibility renderer. WebGL 2 is supported; Vulkan, native OpenXR, ENet, and GDExtension libraries are not included.</p>}
      <details><summary>Generated recipe (read-only)</summary>
        <dl className="inspector mt-4"><dt>Source</dt><dd>Godot {config.godotVersion} · checksum verified by worker</dd><dt>Template</dt><dd>{config.templateKinds.join(" + ")} · {config.architecture}</dd><dt>Optimization</dt><dd>Size · LTO disabled</dd></dl>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap break-all text-xs">{config.templateKinds.map(kind => toSconsArgs(config, kind).join("\n")).join("\n\n")}</pre>
      </details>
    </Card>
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <Card className="p-5">
        <p className="section-label">Build recipe</p>
        <h2 className="mt-4 text-xl font-semibold">{profileLabel}</h2>
        <p className="mt-2 font-mono text-sm text-[var(--muted)]">Godot {config.godotVersion}<br />{platform} / {config.architecture} / {config.templateKinds.join(" + ")}</p>
        <hr className="my-5 border-[var(--border)]" />
        <p className="text-sm font-medium">{removed.length ? "Removed features" : "All supported features retained"}</p>
        {removed.length > 0 && <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">{removed.map(label => <li key={label}>− {label}</li>)}</ul>}
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Stripped features may prevent your project from running. Validate exports on the target platform. Identical normalized recipes reuse an artifact.</p>
        <p className="mt-4 text-sm">Output: private <code>.tpz</code> package</p>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Install the TPZ in the template manager, or extract it and select the {platform === "web" ? "nested ZIP" : "executable"} under Custom Template → Release/Debug. Match Export With Debug to an included template.</p>
        {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="mt-6 w-full" disabled={busy}>{busy && <span className="spinner" />}{busy ? "Submitting recipe…" : "Build template →"}</Button>
      </Card>
    </aside>
  </form>;
}
