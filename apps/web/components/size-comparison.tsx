import type { SizeComparison } from "@mingd/build-config";

export function TemplateSizeComparison({ comparison }: { comparison: SizeComparison | null | undefined }) {
  if (!comparison) return <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Size comparison unavailable until a measured official reference matches this version, target and template kinds.</p>;
  const smaller = comparison.savedBytes > 0;
  const same = comparison.savedBytes === 0;
  const maximum = Math.max(comparison.officialBytes, comparison.customBytes, 1);
  return <section aria-label="Official template comparison" className="mt-5 border-t border-[var(--border)] pt-5">
    <p className={`text-2xl font-semibold ${smaller ? "text-[var(--success)]" : ""}`}>{same ? "Same size" : `${Math.abs(comparison.percentSaved).toFixed(1)}% ${smaller ? "smaller" : "larger"}`}</p>
    <p className="mt-1 text-xs text-[var(--muted)]">Compared with matching official templates</p>
    <dl className="size-comparison-bars">
      {[["Official", comparison.officialBytes], ["Custom", comparison.customBytes]].map(([label, bytes]) => <div key={label}>
        <div className="size-comparison-label"><dt>{label}</dt><dd>{(Number(bytes) / 1048576).toFixed(2)} MiB</dd></div>
        <div className="size-comparison-track" aria-hidden="true"><span className={label === "Custom" ? "custom" : ""} style={{ width: `${Number(bytes) / maximum * 100}%` }} /></div>
      </div>)}
    </dl>
    <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{comparison.measurement === "wasm" ? "Uncompressed WASM" : comparison.measurement === "libraries" ? "Native engine library" : "Main executable"} bytes summed across the included template kinds. Archive overhead and Windows console wrappers are excluded. Official and custom toolchains and included features differ; this is a size comparison, not a performance benchmark.</p>
    <details className="mt-3 text-xs"><summary>Reference measurements</summary><ul className="mt-2 space-y-3">{comparison.references.map(reference => <li key={reference.template_kind} className="break-all"><a className="text-[var(--accent)]" href={reference.source_url} rel="noreferrer" target="_blank">Official {reference.godot_version} {reference.template_kind} archive</a><p className="mt-1 text-[var(--muted)]">Archive SHA-256: {reference.archive_sha256}</p><p className="mt-1 text-[var(--muted)]">Measured: {reference.measured_at}</p></li>)}</ul></details>
  </section>;
}
