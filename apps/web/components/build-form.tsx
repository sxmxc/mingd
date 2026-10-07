"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_BUILD_CONFIG, PRESETS, SUPPORTED_PRESET_IDS, FEATURE_GROUPS,
  buildPresetId, normalizeBuildConfig, toSconsArgs,
  MINIMUM_GODOT_VERSION, FEATURE_EXAMPLES, PLATFORM_ARCHITECTURES, defaultArchitecture, buildArchitectures, platformVersionSupported, GDBUILD_MAX_BYTES, parseGdBuildFile, type BuildConfig, type SupportedGodotVersion,
  type GodotVersionId, type TemplateKind, type BuildFeatures, type BooleanFeature, type Platform, type SupportedPresetId,
} from "@mingd/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompatibilityGuidance } from "@/components/compatibility-guidance";
import Link from "next/link";
import { downloadRecipeFile } from "@/components/recipe-file-download";

export function BuildForm({ versions, catalogStale, initialConfig, recipeId, initialName = "", macosEnabled = false }: { versions: SupportedGodotVersion[]; catalogStale: boolean; initialConfig?: BuildConfig; recipeId?: string; initialName?: string; macosEnabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(initialConfig?.platform ?? "linux");
  const [architecture, setArchitecture] = useState<BuildConfig["architecture"]>(initialConfig?.architecture ?? defaultArchitecture(initialConfig?.platform ?? "linux"));
  const [godotVersion, setGodotVersion] = useState<GodotVersionId>(initialConfig?.godotVersion ?? versions.find(version => version.id === DEFAULT_BUILD_CONFIG.godotVersion)?.id ?? versions[0].id);
  const [templateSelection, setTemplateSelection] = useState(initialConfig?.templateKinds.length === 2 ? "both" : initialConfig?.templateKinds[0] ?? "release");
  const [webThreads, setWebThreads] = useState(initialConfig?.webThreads ?? false);
  const [startingProfile, setStartingProfile] = useState<SupportedPresetId>("standard");
  const [features, setFeatures] = useState<BuildFeatures>({ ...(initialConfig?.features ?? PRESETS.standard.features) });
  const [name, setName] = useState(initialName);
  const [savedId, setSavedId] = useState(recipeId);
  const [savedMessage, setSavedMessage] = useState("");
  const [notice, setNotice] = useState("");
  const templateKinds: TemplateKind[] = templateSelection === "both" ? ["release", "debug"] : [templateSelection as TemplateKind];
  const config = normalizeBuildConfig({ ...(initialConfig ?? DEFAULT_BUILD_CONFIG), platform, godotVersion, templateKinds, webThreads, architecture, features });
  const supportedVersion = platformVersionSupported(platform, godotVersion);
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
  async function importRecipe(file: File) {
    setBusy(true); setError(null); setSavedMessage("");
    try {
      if (file.size > GDBUILD_MAX_BYTES) throw new Error("Recipe files must be 64 KiB or smaller.");
      const recipe = parseGdBuildFile(await file.text());
      if (!versions.some(version => version.id === recipe.config.godotVersion)) throw new Error("This recipe's exact Godot version is unavailable in the verified catalog. Its version has not been substituted.");
      setPlatform(recipe.config.platform); setArchitecture(recipe.config.architecture); setGodotVersion(recipe.config.godotVersion);
      setTemplateSelection(recipe.config.templateKinds.length === 2 ? "both" : recipe.config.templateKinds[0]);
      setWebThreads(recipe.config.webThreads); setFeatures(recipe.config.features); setName(recipe.name); setSavedId(undefined);
      setNotice("Recipe imported. Review it before saving or building.");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import recipe."); }
    finally { setBusy(false); }
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
  async function save(asCopy = false) {
    setBusy(true); setError(null); setSavedMessage("");
    try {
      const response = await fetch(savedId && !asCopy ? `/api/recipes/${savedId}` : "/api/recipes", {
        method: savedId && !asCopy ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, config }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save recipe.");
      setSavedId(body.id); setSavedMessage("Recipe saved. Manage and share it in Saved recipes.");
      if (!savedId || asCopy) router.replace(`/build/new?recipe=${body.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  const removed = FEATURE_GROUPS.flatMap(group => group.options).filter(option => !config.features[option.key]).map(option => option.label);
  if (config.features.textServer === "fallback") removed.push("Advanced text shaping");
  return <form onSubmit={event => { event.preventDefault(); void submit(); }} className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <Card className="p-6 space-y-8">
      <fieldset disabled={busy}>
        <legend className="section-label">01 / Version and target</legend>
        <label className="mt-4 block text-sm">Godot version
          <select className="mt-2 block w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" value={godotVersion} onChange={event => setGodotVersion(event.target.value as GodotVersionId)}>
            {versions.map(version => <option key={version.id} value={version.id}>{version.displayName}</option>)}
          </select>
          <span className="mt-2 block text-xs text-[var(--muted)]">Official stable Godot 4 releases, {MINIMUM_GODOT_VERSION} and newer. Choose the exact version of your Godot editor.</span>
          {catalogStale && <span role="status" className="mt-2 block text-xs text-[var(--muted)]">Release discovery is temporarily unavailable. Showing previously verified versions.</span>}
        </label>
        <div className="choice-grid mt-4">{(["linux", "windows", "web", "android", "macos"] as const).map(value =>
          <label key={value} className={`choice ${platform === value ? "selected" : ""}`}>
            <input type="radio" name="platform" checked={platform === value} onChange={() => { setPlatform(value); setArchitecture(defaultArchitecture(value)); }} />
            <span><strong>{({ linux: "Linux", windows: "Windows", web: "Web", android: "Android", macos: "macOS" })[value]}</strong><small>{({ linux: "x86_64 · ELF", windows: "x86_64 · GUI + console", web: "wasm32 · WebGL 2", android: "APK + Gradle source", macos: "Apple Silicon + Intel" })[value]}</small></span>
          </label>,
        )}</div>
        {(platform === "android" || platform === "macos") && <label className="mt-4 block text-sm">Architecture
          <select className="mt-2 block w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" value={architecture} onChange={event => setArchitecture(event.target.value as BuildConfig["architecture"])}>
            {PLATFORM_ARCHITECTURES[platform].map(value => <option key={value} value={value}>{value === "arm64" && platform === "android" ? "ARM64 / modern devices" : ({ arm64: "ARM64 / Apple Silicon", arm32: "ARMv7 / 32-bit devices", x86_64: "x86_64 / Intel", x86_32: "x86 / 32-bit emulators", universal: "Universal / Apple Silicon + Intel" })[value]}</option>)}
          </select>
        </label>}
        {!supportedVersion && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">Android and macOS currently support Godot 4.6.3 and 4.7.2. Select a verified version above.</p>}
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
        <p className="mt-3 text-xs text-[var(--muted)]">Choose a preset, then adjust the features below.</p>
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
                <span><span className="text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{option.consequence}{platformUnavailable ? " Unavailable in browser exports." : option.requires && !config.features[option.requires] ? " Enable its parent feature first." : ""}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Examples: {FEATURE_EXAMPLES[option.key].join(", ")}</span></span>
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
      <CompatibilityGuidance config={config} />
      {platform === "windows" && <p className="text-sm text-[var(--muted)]">Vulkan and OpenGL supported. Direct3D 12, ANGLE, screen readers, and WinRT/OneCore are not included.</p>}
      {platform === "web" && <p className="text-sm text-[var(--muted)]">Use the Compatibility renderer. WebGL 2 is supported; Vulkan, native OpenXR, ENet, and GDExtension libraries are not included.</p>}
      {platform === "android" && <p className="text-sm text-[var(--muted)]">Includes APK templates and android_source.zip for Gradle exports. Enable only the selected architecture in your export preset. Match the included debug/release kinds. Swappy frame pacing is not included; test frame timing on real devices.</p>}
      {platform === "macos" && <p className="text-sm text-[var(--muted)]">Compatibility renderer / OpenGL. Metal, Vulkan, ANGLE and screen readers are not included. Select the matching architecture in Godot. Sign and notarize your exported game for distribution.</p>}
      <details><summary>Generated recipe (read-only)</summary>
        <dl className="inspector mt-4"><dt>Source</dt><dd>Godot {config.godotVersion} · checksum verified by worker</dd><dt>Template</dt><dd>{config.templateKinds.join(" + ")} · {config.architecture}</dd><dt>Optimization</dt><dd>Size · LTO disabled</dd></dl>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap break-all text-xs">{config.templateKinds.flatMap(kind => buildArchitectures(config).map(arch => toSconsArgs({ ...config, architecture: arch }, kind).join("\n"))).join("\n\n")}</pre>
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
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Keep the features your game uses. Matching recipes reuse an existing template.</p>
        <p className="mt-4 text-sm">Output: private <code>.tpz</code> package</p>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Install the TPZ in the template manager, or extract it and select the {platform === "web" || platform === "macos" ? "nested ZIP" : platform === "android" ? "APK" : "executable"} under Custom Template → Release/Debug. Match Export With Debug to an included template.</p>
        {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        {platform === "macos" && !macosEnabled && <p role="status" className="mt-4 text-sm text-[var(--muted)]">macOS builds are not available yet. You can save and export a recipe.</p>}
        <Button type="submit" className="mt-6 w-full" disabled={busy || !supportedVersion || (platform === "macos" && !macosEnabled)}>{busy && <span className="spinner" />}{busy ? "Please wait…" : "Build template →"}</Button>
        <hr className="my-5 border-[var(--border)]" />
        <label className="block text-sm">Recipe name<input className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--background)] p-3" value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="My game — Windows 2D" /></label>
        <Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy || !name.trim() || !supportedVersion} onClick={() => void save()}>{savedId ? "Save changes" : "Save recipe"}</Button>
        {savedId && <Button type="button" variant="secondary" className="mt-2 w-full" disabled={busy || !name.trim() || !supportedVersion} onClick={() => void save(true)}>Save as new recipe</Button>}
        {savedMessage && <p role="status" className="mt-3 text-xs leading-5 text-[var(--success)]">{savedMessage}</p>}
        <hr className="my-5 border-[var(--border)]" />
        <p className="text-sm font-medium">Portable recipe</p>
        <Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy || !supportedVersion} onClick={() => downloadRecipeFile(name.trim() || `${profileLabel} — ${platform}`, config)}>Export .gdbuild</Button>
        <label className="mt-3 block text-sm">Import .gdbuild<input type="file" accept=".gdbuild,application/json" disabled={busy} className="mt-2 block w-full text-xs" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importRecipe(file); }} /></label>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Keep a recipe with your project or send it to a teammate. Importing loads an editable copy; it does not start a build.</p>
        <Link className="mt-3 block text-sm text-[var(--accent)]" href="/recipes">Saved recipes →</Link>
      </Card>
    </aside>
  </form>;
}
