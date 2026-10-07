import { compatibilityGuidance, type BuildConfig } from "@mingd/build-config";

export function CompatibilityGuidance({ config }: { config: BuildConfig }) {
  const items = compatibilityGuidance(config);
  return <section aria-label="Recipe compatibility" className="space-y-4">
    <h2 className="text-lg font-semibold">Compatibility check</h2>
    <p className="text-sm leading-6 text-[var(--muted)]">Review the APIs and assets your project uses before building. This recipe has not inspected your project.</p>
    {items.length ? <div className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">{items.map(item => <div key={item.key} className="p-4"><h3 className="text-sm font-medium">{item.label} removed</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.consequence}</p><p className="mt-2 text-xs leading-5"><span className="text-[var(--muted)]">Check for: </span>{item.examples.join(", ")}</p></div>)}</div> : <p className="text-sm text-[var(--muted)]">All selectable features are retained.</p>}
    {config.platform === "windows" && <p className="text-xs leading-5 text-[var(--muted)]">Windows templates support Vulkan and OpenGL. Direct3D 12, ANGLE, AccessKit screen reader integration and WinRT/OneCore are omitted by the build toolchain.</p>}
    {config.platform === "web" && <p className="text-xs leading-5 text-[var(--muted)]">Web requires Compatibility / WebGL 2. Native OpenXR, ENet and GDExtension libraries are unavailable. Match Thread Support in your export preset.{config.webThreads && " Threaded hosting needs cross-origin isolation (COOP/COEP headers)."}</p>}
    {!config.features.multiplayer && <p className="text-xs leading-5 text-[var(--muted)]">Removing multiplayer does not remove core HTTP/TCP support on desktop.</p>}
  </section>;
}
