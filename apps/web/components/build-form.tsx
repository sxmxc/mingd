"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
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
import { PlatformIcon, PlatformTarget } from "@/components/platform-target";

export function BuildForm({ versions, catalogStale, initialConfig, recipeId, initialName = "", macosEnabled = false }: { versions: SupportedGodotVersion[]; catalogStale: boolean; initialConfig?: BuildConfig; recipeId?: string; initialName?: string; macosEnabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(initialConfig?.platform ?? "linux");
  const [architecture, setArchitecture] = useState<BuildConfig["architecture"]>(initialConfig?.architecture ?? defaultArchitecture(initialConfig?.platform ?? "linux"));
  const [godotVersion, setGodotVersion] = useState<GodotVersionId>(initialConfig?.godotVersion ?? versions.find(version => version.id === DEFAULT_BUILD_CONFIG.godotVersion)?.id ?? versions[0].id);
  const [templateSelection, setTemplateSelection] = useState(initialConfig?.templateKinds.length === 2 ? "both" : initialConfig?.templateKinds[0] ?? "release");
  const [webThreads, setWebThreads] = useState(initialConfig?.webThreads ?? false);
  const [startingProfile, setStartingProfile] = useState<SupportedPresetId | null>(() => initialConfig ? buildPresetId(normalizeBuildConfig(initialConfig)) : "standard");
  const [features, setFeatures] = useState<BuildFeatures>({ ...(initialConfig?.features ?? PRESETS.standard.features) });
  const [name, setName] = useState(initialName);
  const [savedId, setSavedId] = useState(recipeId);
  const [savedMessage, setSavedMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState("target");
  const [featureSearch, setFeatureSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(FEATURE_GROUPS.map(group => [group.label, true])));
  const templateKinds: TemplateKind[] = templateSelection === "both" ? ["release", "debug"] : [templateSelection as TemplateKind];
  const config = normalizeBuildConfig({ ...(initialConfig ?? DEFAULT_BUILD_CONFIG), platform, godotVersion, templateKinds, webThreads, architecture, features });
  const supportedVersion = platformVersionSupported(platform, godotVersion);
  const profile = buildPresetId(config);
  const profileLabel = profile ? PRESETS[profile].label : "Custom";
  const featureLabel = (key: BooleanFeature) => FEATURE_GROUPS.flatMap(group => group.options).find(option => option.key === key)?.label ?? key;
  const normalizedFeatureSearch = featureSearch.trim().toLowerCase();
  const visibleFeatureGroups = FEATURE_GROUPS.map(group => ({
    ...group,
    options: group.options.filter(option => !normalizedFeatureSearch || [
      option.label,
      option.consequence,
      FEATURE_EXAMPLES[option.key].join(" "),
      option.requires ? `requires ${featureLabel(option.requires)}` : "",
      option.locked ? "always included" : "",
      platform === "web" && (option.key === "openxr" || option.key === "enet") ? "unavailable browser exports" : "",
    ].join(" ").toLowerCase().includes(normalizedFeatureSearch)),
  })).filter(group => group.options.length > 0);
  const textServerSearchMatches = !normalizedFeatureSearch || "text shaping advanced fallback complex scripts bidirectional internationalized ui".includes(normalizedFeatureSearch);
  const visibleFeatureCount = visibleFeatureGroups.reduce((count, group) => count + group.options.length, 0) + Number(textServerSearchMatches);
  const totalFeatureCount = FEATURE_GROUPS.reduce((count, group) => count + group.options.length, 0) + 1;
  const enabledFeatureCount = FEATURE_GROUPS.flatMap(group => group.options).filter(option => config.features[option.key]).length + Number(config.features.textServer === "advanced");
  const allFeatureGroupsExpanded = FEATURE_GROUPS.every(group => expandedGroups[group.label]);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-build-section]");
    const observer = new IntersectionObserver(entries => {
      const current = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (current) setActiveSection(current.target.id.replace("-section", ""));
    }, { rootMargin: "-96px 0px -68% 0px", threshold: 0 });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

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
      setWebThreads(recipe.config.webThreads); setFeatures(recipe.config.features); setStartingProfile(buildPresetId(recipe.config)); setName(recipe.name); setSavedId(undefined);
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
  const buildDisabled = busy || !supportedVersion || (platform === "macos" && !macosEnabled);
  const sections = [
    { id: "target", label: "Version & target" },
    { id: "preset", label: "Starting preset" },
    { id: "features", label: "Engine features" },
    { id: "compatibility", label: "Compatibility" },
  ];
  const platformLabels: Record<Platform, string> = { linux: "Linux", windows: "Windows", web: "Web", android: "Android", macos: "macOS" };
  const platformDescriptions: Record<Platform, string> = {
    linux: "x86_64 · ELF",
    windows: "x86_64 · GUI + console",
    web: "wasm32 · WebGL 2",
    android: "APK + Gradle source",
    macos: "Apple Silicon + Intel",
  };

  return <>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} className="build-workbench-form grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
      <nav aria-label="Build configuration sections" className="build-section-nav lg:col-span-2">
        <span className="section-label">Configure</span>
        <div className="build-section-links">
          {sections.map((section, index) =>
            <a
              key={section.id}
              href={`#${section.id}-section`}
              aria-current={activeSection === section.id ? "location" : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>{section.label}
            </a>,
          )}
        </div>
      </nav>

      <div className="build-workbench-main min-w-0">
        <Card className="build-config-panel p-4 sm:p-6">
          <section id="target-section" data-build-section className="build-config-section scroll-mt-32">
            <div className="build-section-heading">
              <span className="build-section-number">01</span>
              <div><h2>Version and target</h2><p>Choose the exact Godot release and export platform.</p></div>
            </div>
            <fieldset disabled={busy} className="build-target-fields">
              <legend className="sr-only">Version and target</legend>
              <label className="build-form-label">Godot version
                <select className="build-form-control" value={godotVersion} onChange={event => setGodotVersion(event.target.value as GodotVersionId)}>
                  {versions.map(version => <option key={version.id} value={version.id}>{version.displayName}</option>)}
                </select>
                <span className="build-form-help">Official stable Godot 4 releases, {MINIMUM_GODOT_VERSION} and newer. Match the exact version of your Godot editor.</span>
                {catalogStale && <span role="status" className="build-form-help">Release discovery is temporarily unavailable. Showing previously verified versions.</span>}
              </label>
              <div className="build-target-grid" role="radiogroup" aria-label="Export target">
                {(["linux", "windows", "web", "android", "macos"] as const).map(value =>
                  <label key={value} className={`build-target-choice ${platform === value ? "selected" : ""}`}>
                    <input type="radio" name="platform" checked={platform === value} onChange={() => { setPlatform(value); setArchitecture(defaultArchitecture(value)); }} />
                    <PlatformIcon platform={value} />
                    <span><strong>{platformLabels[value]}</strong><small>{platformDescriptions[value]}</small></span>
                  </label>,
                )}
              </div>
              {(platform === "android" || platform === "macos") && <label className="build-form-label">Architecture
                <select className="build-form-control" value={architecture} onChange={event => setArchitecture(event.target.value as BuildConfig["architecture"])}>
                  {PLATFORM_ARCHITECTURES[platform].map(value => <option key={value} value={value}>{value === "arm64" && platform === "android" ? "ARM64 / modern devices" : ({ arm64: "ARM64 / Apple Silicon", arm32: "ARMv7 / 32-bit devices", x86_64: "x86_64 / Intel", x86_32: "x86 / 32-bit emulators", universal: "Universal / Apple Silicon + Intel" })[value]}</option>)}
                </select>
              </label>}
              {!supportedVersion && <p role="alert" className="build-inline-warning">Android and macOS currently support Godot 4.6.3 and 4.7.2. Select a verified version above.</p>}
              <label className="build-form-label">Template kind
                <select className="build-form-control" value={templateSelection} onChange={event => setTemplateSelection(event.target.value)}>
                  <option value="release">Release — shipping exports</option>
                  <option value="debug">Debug — debugging exports</option>
                  <option value="both">Release + debug — both in one package</option>
                </select>
              </label>
              {platform === "web" && <label className="build-thread-option">
                <input type="checkbox" checked={webThreads} onChange={event => setWebThreads(event.target.checked)} />
                <span><strong>Thread support</strong><small>Match Thread Support in Godot's Web export preset. Threaded hosting requires COOP/COEP headers; single-threaded exports do not require cross-origin isolation.</small></span>
              </label>}
            </fieldset>
          </section>

          <section id="preset-section" data-build-section className="build-config-section scroll-mt-32">
            <div className="build-section-heading">
              <span className="build-section-number">02</span>
              <div><h2>Starting preset</h2><p>Load a supported profile, then customize individual features.</p></div>
            </div>
            <fieldset disabled={busy}>
              <legend className="sr-only">Starting preset</legend>
              <div className="build-preset-grid">{SUPPORTED_PRESET_IDS.map(id =>
                <label key={id} className={`build-preset-choice ${startingProfile === id ? "selected" : ""}`}>
                  <input type="radio" name="profile" checked={startingProfile === id} onChange={() => chooseProfile(id)} />
                  <span><strong>{PRESETS[id].label}</strong><small>{PRESETS[id].description}</small></span>
                </label>,
              )}</div>
              <p className="build-preset-status" role="status">
                {startingProfile === null
                  ? "This recipe starts from a custom feature set. Choose a preset to replace it."
                  : profile === startingProfile
                    ? `Current features match the ${PRESETS[startingProfile].label} preset.`
                    : `Current features differ from the ${PRESETS[startingProfile].label} starting preset.`}
                <Button type="button" variant="secondary" className="build-reset-button" onClick={() => chooseProfile(startingProfile ?? "standard")}>
                  Reset to {PRESETS[startingProfile ?? "standard"].label}
                </Button>
              </p>
            </fieldset>
          </section>

          <section id="features-section" data-build-section className="build-config-section scroll-mt-32">
            <div className="build-section-heading">
              <span className="build-section-number">03</span>
              <div><h2>Engine features</h2><p>Retain what your game uses. Dependencies and platform limits are applied to the normalized recipe.</p></div>
            </div>
            <fieldset disabled={busy} className="build-features-fieldset">
              <legend className="sr-only">Engine features</legend>
              <div className="build-feature-toolbar">
                <label className="build-feature-search">
                  <Search aria-hidden="true" size={16} />
                  <span className="sr-only">Search engine features</span>
                  <input type="search" value={featureSearch} onChange={event => {
                    const value = event.target.value;
                    setFeatureSearch(value);
                    if (value) setExpandedGroups(Object.fromEntries(FEATURE_GROUPS.map(group => [group.label, true])));
                  }} placeholder="Find a feature or API…" />
                </label>
                <span className="build-feature-count">{enabledFeatureCount} / {totalFeatureCount} included</span>
                <Button type="button" variant="ghost" className="build-expand-all" onClick={() => setExpandedGroups(Object.fromEntries(FEATURE_GROUPS.map(group => [group.label, !allFeatureGroupsExpanded])))}>
                  {allFeatureGroupsExpanded ? "Collapse all" : "Expand all"}
                </Button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{normalizedFeatureSearch ? `${visibleFeatureCount} matching settings` : `${totalFeatureCount} settings`}</p>
              {visibleFeatureGroups.map(group => {
                const expanded = expandedGroups[group.label];
                return <section key={group.label} className="build-feature-group">
                  <button type="button" className="build-feature-group-toggle" aria-expanded={expanded} onClick={() => setExpandedGroups(current => ({ ...current, [group.label]: !current[group.label] }))}>
                    <span><strong>{group.label}</strong><small>{group.options.length} {normalizedFeatureSearch ? "match" : "settings"}</small></span>
                    <ChevronDown aria-hidden="true" size={16} className={expanded ? "is-expanded" : ""} />
                  </button>
                  {expanded && <div className="build-feature-options">
                    {group.options.map(option => {
                      const platformUnavailable = platform === "web" && (option.key === "openxr" || option.key === "enet");
                      const dependencyMissing = option.requires && !config.features[option.requires];
                      const stateLabel = option.locked
                        ? "Always included"
                        : platformUnavailable
                          ? "Unavailable on Web"
                          : dependencyMissing
                            ? `Requires ${option.requires ? featureLabel(option.requires) : "parent feature"}`
                            : config.features[option.key] ? "Optional · included" : "Optional · removed";
                      const stateClass = option.locked ? "always" : platformUnavailable || dependencyMissing ? "unavailable" : config.features[option.key] ? "included" : "removed";
                      const disabled = option.locked || platformUnavailable || dependencyMissing;
                      return <div key={option.key} className="build-feature-option">
                        <div className="build-feature-option-heading">
                          <label htmlFor={`feature-${option.key}`} className="build-feature-label">
                            <input id={`feature-${option.key}`} type="checkbox" checked={config.features[option.key]} disabled={!!disabled} onChange={event => changeFeature(option.key, event.target.checked)} />
                            <span>{option.label}</span>
                          </label>
                          <span className={`build-feature-state ${stateClass}`}>{stateLabel}</span>
                        </div>
                        {option.requires && <p className="build-feature-requirement">Requires {featureLabel(option.requires)}; optional when that dependency is enabled.</p>}
                        <details className="build-feature-details">
                          <summary>Impact and examples</summary>
                          <p>{option.consequence}</p>
                          <p><strong>Examples:</strong> {FEATURE_EXAMPLES[option.key].join(", ")}</p>
                        </details>
                      </div>;
                    })}
                  </div>}
                </section>;
              })}
              {textServerSearchMatches && <label className="build-text-server-option">Text shaping
                <select className="build-form-control" value={config.features.textServer} onChange={event => changeFeature("textServer", event.target.value as BuildFeatures["textServer"])}>
                  <option value="advanced">Advanced — complex scripts and bidirectional text</option>
                  <option value="fallback">Fallback — basic text, reduced shaping support</option>
                </select>
                <span className="build-form-help">Fallback can break complex-script layout and internationalized UI. Test every language your project supports.</span>
              </label>}
              {normalizedFeatureSearch && visibleFeatureCount === 0 && <p className="build-feature-empty">No feature settings match “{featureSearch.trim()}”. <button type="button" onClick={() => setFeatureSearch("")}>Clear search</button></p>}
              <p role="status" aria-live="polite" className="build-feature-notice">{notice}</p>
            </fieldset>
          </section>

          <section id="compatibility-section" data-build-section className="build-config-section scroll-mt-32">
            <div className="build-section-heading">
              <span className="build-section-number">04</span>
              <div><h2>Compatibility</h2><p>Review platform constraints and APIs removed by this recipe.</p></div>
            </div>
            <div className="build-compatibility-content">
              <CompatibilityGuidance config={config} />
              {platform === "windows" && <p className="build-compatibility-note">Vulkan and OpenGL supported. Direct3D 12, ANGLE, screen readers, and WinRT/OneCore are not included.</p>}
              {platform === "web" && <p className="build-compatibility-note">Use the Compatibility renderer. WebGL 2 is supported; Vulkan, native OpenXR, ENet, and GDExtension libraries are not included.</p>}
              {platform === "android" && <p className="build-compatibility-note">Includes APK templates and android_source.zip for Gradle exports. Enable only the selected architecture in your export preset. Match the included debug/release kinds. Swappy frame pacing is not included; test frame timing on real devices.</p>}
              {platform === "macos" && <p className="build-compatibility-note">Compatibility renderer / OpenGL. Metal, Vulkan, ANGLE and screen readers are not included. Select the matching architecture in Godot. Sign and notarize your exported game for distribution.</p>}
            </div>
          </section>

          <details className="build-generated-recipe">
            <summary>Generated recipe and SCons arguments <span>Read-only</span></summary>
            <dl className="inspector mt-4"><dt>Source</dt><dd>Godot {config.godotVersion} · checksum verified by worker</dd><dt>Template</dt><dd>{config.templateKinds.join(" + ")} · {config.architecture}</dd><dt>Optimization</dt><dd>Size · LTO disabled</dd></dl>
            <pre className="build-scons-preview">{config.templateKinds.flatMap(kind => buildArchitectures(config).map(arch => toSconsArgs({ ...config, architecture: arch }, kind).join("\n"))).join("\n\n")}</pre>
          </details>
        </Card>
      </div>

      <aside className="build-workbench-sidebar lg:sticky lg:top-24 lg:self-start" aria-label="Live build configuration and recipe actions">
        <Card className="build-summary-card p-4 sm:p-5">
          <p className="section-label">Live configuration</p>
          <h2 className="mt-3 text-xl font-semibold">{profileLabel}</h2>
          {startingProfile !== null && profile !== startingProfile && <p className="mt-1 text-xs text-[var(--warning)]">Differs from the {PRESETS[startingProfile].label} starting preset</p>}
          <PlatformTarget platform={platform} architecture={architecture} className="mt-4" />
          <p className="mt-3 font-mono text-xs text-[var(--muted)]">Godot {config.godotVersion} · {config.templateKinds.join(" + ")}</p>
          {platform === "web" && <p className="mt-1 font-mono text-xs text-[var(--muted)]">{webThreads ? "Threaded" : "Single-threaded"} Web export</p>}
          <div className="build-summary-stat"><span>Features included</span><strong>{enabledFeatureCount} / {totalFeatureCount}</strong></div>
          <div className="build-summary-stat"><span>Features removed</span><strong>{removed.length}</strong></div>
          {removed.length > 0 && <details className="build-removed-features">
            <summary>Review removed features</summary>
            <ul>{removed.map(label => <li key={label}>{label}</li>)}</ul>
          </details>}
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Matching recipes reuse an existing template. Keep every feature your game uses.</p>
          <div className="build-output-summary">
            <p>Output: private <code>.tpz</code> package</p>
            <p>Install the TPZ in the template manager, or extract it and select the {platform === "web" || platform === "macos" ? "nested ZIP" : platform === "android" ? "APK" : "executable"} under Custom Template → Release/Debug. Match Export With Debug to an included template.</p>
          </div>
          {platform === "macos" && !macosEnabled && <p role="status" className="build-inline-warning">macOS builds are not available yet. You can save and export a recipe.</p>}
          {error && <p role="alert" className="build-form-error">{error}</p>}
          <Button type="submit" className="mt-5 w-full" disabled={buildDisabled}>{busy && <span className="spinner" />}{busy ? "Please wait…" : "Build template →"}</Button>

          <details className="build-recipe-actions" open={!!recipeId}>
            <summary>Save, import, or export a recipe</summary>
            <div className="build-recipe-actions-body">
            <label className="build-form-label">Recipe name
              <input className="build-form-control" value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="My game — Windows 2D" />
            </label>
            <Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy || !name.trim() || !supportedVersion} onClick={() => void save()}>{savedId ? "Save changes" : "Save recipe"}</Button>
            {savedId && <Button type="button" variant="secondary" className="mt-2 w-full" disabled={busy || !name.trim() || !supportedVersion} onClick={() => void save(true)}>Save as new recipe</Button>}
            {savedMessage && <p role="status" className="mt-3 text-xs leading-5 text-[var(--success)]">{savedMessage}</p>}
            <div className="build-portable-recipe">
              <p>Portable recipe</p>
              <Button type="button" variant="secondary" className="mt-2 w-full" disabled={busy || !supportedVersion} onClick={() => downloadRecipeFile(name.trim() || `${profileLabel} — ${platform}`, config)}>Export .gdbuild</Button>
              <label className="build-form-label mt-3">Import .gdbuild
                <input type="file" accept=".gdbuild,application/json" disabled={busy} className="mt-2 block w-full text-xs" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importRecipe(file); }} />
              </label>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Keep a recipe with your project or send it to a teammate. Importing loads an editable copy; it does not start a build.</p>
              <Link className="mt-3 block text-sm text-[var(--accent-strong)]" href="/recipes">Saved recipes →</Link>
            </div>
            </div>
          </details>
        </Card>
      </aside>

      <div className="build-mobile-action">
        <div><strong>{platformLabels[platform]} · Godot {config.godotVersion}</strong><span>{config.templateKinds.join(" + ")} · {enabledFeatureCount} / {totalFeatureCount} features</span></div>
        <Button type="submit" disabled={buildDisabled}>{busy && <span className="spinner" />}{busy ? "Please wait…" : "Build template →"}</Button>
      </div>
    </form>
  </>;
}
