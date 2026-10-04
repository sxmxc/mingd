"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_BUILD_CONFIG,
  PRESETS,
  normalizeBuildConfig,
  type BuildConfig,
  type BuildFeatures,
  type PresetId,
} from "@gdslimmer/build-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BooleanFeatureKey = Exclude<keyof BuildFeatures, "textServer">;

const featureLabels: Array<[BooleanFeatureKey, string, string]> = [
  ["engine3d", "3D engine", "Disable for a strictly 2D project."],
  ["advancedGui", "Advanced GUI", "Tree, TextEdit, GraphEdit, dialogs, rich text and related controls."],
  ["physics2d", "2D physics", "Godot 2D physics classes and runtime."],
  ["physics3d", "3D physics", "Disable if the project renders 3D but does not simulate 3D physics."],
  ["jolt", "Jolt Physics", "Jolt 3D physics module."],
  ["navigation2d", "Navigation 2D", "2D pathfinding/navigation module."],
  ["navigation3d", "Navigation 3D", "3D pathfinding/navigation module."],
  ["multiplayer", "Multiplayer", "High-level multiplayer module."],
  ["enet", "ENet", "ENet transport."],
  ["websocket", "WebSocket", "WebSocket networking support."],
  ["webrtc", "WebRTC", "WebRTC networking support."],
  ["openxr", "OpenXR", "XR runtime integration."],
  ["gltf", "glTF", "glTF runtime/import support."],
  ["csg", "CSG", "Constructive solid geometry nodes."],
  ["gridmap", "GridMap", "3D GridMap module."],
  ["tilemap", "TileMap", "2D TileMap support."],
  ["svg", "SVG", "SVG image support."],
  ["oggVorbis", "Ogg/Vorbis", "Ogg container and Vorbis audio."],
  ["mp3", "MP3", "MP3 audio support."],
  ["theora", "Theora", "Theora video playback."],
  ["zip", "ZIP", "ZIP archive support."],
];

export function BuildForm() {
  const router = useRouter();
  const [config, setConfig] = useState<BuildConfig>(DEFAULT_BUILD_CONFIG);
  const [preset, setPreset] = useState<PresetId>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeBuildConfig(config), [config]);
  const removedCount = featureLabels.filter(([key]) => normalized.features[key] === false).length;

  function applyPreset(id: PresetId) {
    setPreset(id);
    setConfig((current) => ({ ...current, features: { ...PRESETS[id].features } }));
  }

  function toggleFeature(key: BooleanFeatureKey) {
    setConfig((current) => ({
      ...current,
      features: { ...current.features, [key]: !current.features[key] },
    }));
  }

  async function submit() {
    setBusy(true); setError(null);
    const response = await fetch("/api/builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalized),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not create build.");
    router.push(`/build/${body.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="font-bold">Build target</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Godot version<select className="mt-2 h-10 w-full rounded-md border border-[var(--border)] bg-[#0c1014] px-3" value={config.godotVersion} disabled><option value="4.7.2">4.7.2 stable</option></select></label>
            <label className="text-sm">Platform<select className="mt-2 h-10 w-full rounded-md border border-[var(--border)] bg-[#0c1014] px-3" value={config.platform} onChange={(e) => setConfig({ ...config, platform: e.target.value as BuildConfig["platform"] })}><option value="windows">Windows x86_64</option><option value="linux">Linux x86_64</option></select></label>
            <label className="text-sm">Optimization<select className="mt-2 h-10 w-full rounded-md border border-[var(--border)] bg-[#0c1014] px-3" value={config.optimization} onChange={(e) => setConfig({ ...config, optimization: e.target.value as BuildConfig["optimization"] })}><option value="size">Size</option><option value="size_extra">Extra size reduction</option></select></label>
            <label className="flex items-end gap-3 rounded-md border border-[var(--border)] p-3 text-sm"><input type="checkbox" checked={config.lto} onChange={(e) => setConfig({ ...config, lto: e.target.checked })} /><span><strong>Link-time optimization</strong><br/><span className="text-[var(--muted)]">Slower build, usually smaller release binary.</span></span></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {(["release", "debug"] as const).map((kind) => <label key={kind} className="flex items-center gap-2"><input type="checkbox" checked={config.templateKinds.includes(kind)} onChange={(e) => { const kinds = e.target.checked ? [...config.templateKinds, kind] : config.templateKinds.filter((x) => x !== kind); if (kinds.length) setConfig({ ...config, templateKinds: kinds }); }} />{kind === "release" ? "Release template" : "Debug template"}</label>)}
          </div>
          {config.platform === "windows" && <p className="mt-4 rounded-md border border-[var(--border)] bg-[#0c1014] p-3 text-xs leading-5 text-[var(--muted)]">Bootstrap Windows builds keep Vulkan/OpenGL but currently omit Direct3D 12, AccessKit, WinRT, and ANGLE so the Linux cross-compiler worker does not depend on extra Windows SDK bundles.</p>}
        </Card>

        <Card className="p-5">
          <h2 className="font-bold">Preset</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{(Object.entries(PRESETS) as Array<[PresetId, (typeof PRESETS)[PresetId]]>).map(([id, item]) => <button type="button" key={id} onClick={() => applyPreset(id)} className={`rounded-lg border p-4 text-left ${preset === id ? "border-[var(--accent)] bg-[#132131]" : "border-[var(--border)] bg-[#0c1014]"}`}><strong className="block">{item.label}</strong><span className="mt-2 block text-xs leading-5 text-[var(--muted)]">{item.description}</span></button>)}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-end justify-between"><div><h2 className="font-bold">Engine features</h2><p className="mt-1 text-sm text-[var(--muted)]">Turn off only features you know the project does not need.</p></div><span className="font-mono text-xs text-[var(--muted)]">{removedCount} removed</span></div>
          <div className="mt-5 divide-y divide-[var(--border)]">{featureLabels.map(([key, label, help]) => { const value = normalized.features[key]; const disabledByDependency = config.features[key] !== value; return <label key={key} className="flex cursor-pointer items-center justify-between gap-6 py-3"><span><strong className="text-sm">{label}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{help}{disabledByDependency ? " Disabled by another selection." : ""}</span></span><input type="checkbox" checked={Boolean(value)} onChange={() => toggleFeature(key)} disabled={disabledByDependency} /></label>; })}</div>
          <div className="mt-5 border-t border-[var(--border)] pt-5"><label className="text-sm">Text server<select className="ml-3 rounded-md border border-[var(--border)] bg-[#0c1014] px-3 py-2" value={normalized.features.textServer} onChange={(e) => setConfig({ ...config, features: { ...config.features, textServer: e.target.value as "advanced" | "fallback" } })}><option value="advanced">Advanced</option><option value="fallback">Fallback (Latin/Greek/Cyrillic-focused)</option></select></label></div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5"><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Build summary</p><dl className="mt-5 space-y-3 text-sm">{[["Godot", normalized.godotVersion],["Platform", `${normalized.platform} ${normalized.architecture}`],["Templates", normalized.templateKinds.join(" + ")],["Optimize", normalized.optimization],["LTO", normalized.lto ? "enabled" : "disabled"],["Features removed", String(removedCount)]].map(([k,v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-[var(--muted)]">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>{error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<Button className="mt-6 w-full" onClick={submit} disabled={busy}>{busy ? "Queueing…" : "Build template"}</Button><p className="mt-3 text-xs leading-5 text-[var(--muted)]">gdslimmer normalizes incompatible choices before hashing and compiling.</p></Card>
      </aside>
    </div>
  );
}
