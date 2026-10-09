import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/platform-target";

// Snapshot of recorded, non-dry-run Offline 2D artifacts and matching official
// references, read on 2026-10-08. See docs/developers/performance.md for provenance.
const measurements = [
  { platform: "windows", label: "Windows", target: "x86_64 · Release", binary: "Template executable", officialBytes: 109268480, customBytes: 44993536 },
  { platform: "linux", label: "Linux", target: "x86_64 · Debug + release", binary: "Template executables combined", officialBytes: 147223216, customBytes: 98584992 },
  { platform: "web", label: "Web", target: "wasm32 · Release · Threads enabled", binary: "Uncompressed WASM", officialBytes: 38820072, customBytes: 30035934 },
  { platform: "android", label: "Android", target: "arm64 · Release", binary: "Native engine library", officialBytes: 71114944, customBytes: 51304968 },
];
const mib = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MiB`;

export function LandingComparisons() {
  return <section aria-labelledby="template-savings" className="mt-9">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="template-savings" className="text-xl font-semibold">Measured template savings</h2><p className="mt-1 text-sm text-[var(--muted)]">Offline 2D recipe with multiplayer networking removed.</p></div>
      <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">Godot 4.7.2.stable</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {measurements.map(measurement => {
        const remaining = measurement.customBytes / measurement.officialBytes * 100;
        return <Card key={measurement.platform} className="landing-benchmark min-w-0 p-4">
          <div className="flex min-h-14 items-start gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel-2)]"><PlatformIcon platform={measurement.platform} className="h-4 w-4" /></span>
            <div className="min-w-0"><h3 className="text-sm font-semibold">{measurement.label}</h3><p className="mt-0.5 text-[11px] text-[var(--muted)]">{measurement.target}</p></div>
          </div>
          <p className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight text-[var(--success)]">{(100 - remaining).toFixed(1)}%</strong><span className="text-xs text-[var(--muted)]">smaller</span></p>
          <dl className="mt-4 space-y-3">
            {[
              { label: "Official", bytes: measurement.officialBytes, width: 100, custom: false },
              { label: "min.gd", bytes: measurement.customBytes, width: remaining, custom: true },
            ].map(bar => <div key={bar.label}>
              <div className="flex items-baseline justify-between gap-3"><dt className={`text-[11px] ${bar.custom ? "font-medium" : "text-[var(--muted)]"}`}>{bar.label}</dt><dd className={`font-mono text-[11px] tabular-nums ${bar.custom ? "text-[var(--success)]" : ""}`}>{mib(bar.bytes)}</dd></div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><span className={`block h-full rounded-full ${bar.custom ? "bg-[var(--success)]" : "bg-[#647386]"}`} style={{ width: `${bar.width}%` }} /></div>
            </div>)}
          </dl>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">{measurement.binary}</p>
        </Card>;
      })}
    </div>
    <details className="mt-3 text-xs leading-5 text-[var(--muted)]"><summary className="w-fit">About these measurements</summary><p className="mt-2 max-w-3xl">Recorded builds use size optimization with LTO disabled. Each tile compares matching engine binaries with official templates; Linux includes both debug and release. Archive and app-wrapper overhead are excluded. Results vary by configuration and toolchain, and do not measure runtime performance or final game download size.</p></details>
  </section>;
}
