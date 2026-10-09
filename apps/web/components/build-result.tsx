"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, TriangleAlert } from "lucide-react";
import { expectedTemplateFilename, type BuildConfig, type SizeComparison } from "@mingd/build-config";
import { Card } from "@/components/ui/card";
import { RetryBuild } from "@/components/retry-build";
import { TemplateSizeComparison } from "@/components/size-comparison";

export function BuildResult({ id, status, config, rawConfig, error, stage, logTail, artifact }: {
  id: string; status: string; config: BuildConfig | null; rawConfig: Record<string, unknown>;
  error: string | null; stage: string; logTail: string | null;
  artifact: { size_bytes: number; is_dry_run: boolean; comparison?: SizeComparison | null } | null;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const failed = status === "failed";
  const diagnostic = artifact?.is_dry_run;
  const summary = `min.gd build ${id}\nStatus: ${status}\nRecorded stage: ${stage}\nError: ${error ?? "No error recorded"}\nRecipe: ${JSON.stringify(rawConfig, null, 2)}\n\nRetained output:\n${logTail ?? "No retained output"}`;
  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyMessage("Diagnostics copied. Review them before sharing.");
    } catch {
      setShowDiagnostics(true);
      setCopyMessage("Select and copy the diagnostics below.");
    }
  }
  if (status !== "complete" && !failed) return null;

  if (failed) return <Card className="build-result build-result-failed" aria-labelledby="build-result-heading">
    <div className="build-result-heading"><TriangleAlert size={28} aria-hidden="true" /><div><p className="section-label">Build result</p><h2 id="build-result-heading">Your template could not be built</h2></div></div>
    <p className="build-result-description">Retry the same recipe to submit a new build, or review its settings before trying again. If the error repeats, share the diagnostics with your administrator.</p>
    <p role="alert" className="build-failure-reason">{error ?? "No failure reason was recorded. Check the retained compiler output below."}</p>
    <div className="build-result-actions"><RetryBuild config={rawConfig} />{config && <Link className="secondary-action" href={`/build/new?build=${id}`}>Review recipe</Link>}<button type="button" className="secondary-action" onClick={() => void copyDiagnostics()}>Copy diagnostics</button></div>
    {copyMessage && <p className="build-result-description" role="status">{copyMessage}</p>}
    {showDiagnostics && <textarea readOnly aria-label="Build diagnostics to copy" className="build-diagnostics-copy" value={summary} onFocus={event => event.currentTarget.select()} />}
  </Card>;

  return <Card className="build-result" aria-labelledby="build-result-heading">
    <div className="build-result-layout">
      <div>
        <div className="build-result-heading"><CheckCircle2 size={28} aria-hidden="true" /><div><p className="section-label">Build result</p><h2 id="build-result-heading">{!artifact ? "Build complete" : diagnostic ? "Dry-run diagnostic ready" : "Your template is ready"}</h2></div></div>
        <p className="build-result-description">{!artifact ? "Artifact details are unavailable. Refresh this page to check again." : diagnostic ? "This package contains a build diagnostic. It cannot be installed as an export template." : `Download your ${config ? `Godot ${config.godotVersion}` : "Godot"} template, then install it in the matching editor.`}</p>
        {artifact && <div className="build-result-actions"><a href={`/api/builds/${id}/download`} className="tool-action"><Download size={17} aria-hidden="true" />{diagnostic ? "Download diagnostic" : "Download template .tpz"}</a><span className="build-download-size">{(artifact.size_bytes / 1048576).toFixed(2)} MiB package</span></div>}
        {!artifact && <div className="build-result-actions"><button type="button" className="secondary-action" onClick={() => window.location.reload()}>Refresh artifact details</button></div>}
        {artifact && !diagnostic && config && <InstallGuide config={config} />}
        {artifact && !diagnostic && !config && <p className="build-result-description">Use the exact editor version recorded in this build's recipe. <a className="text-[var(--accent-strong)]" href="https://sxmxc.github.io/mingd/install-templates/">Read the installation guide →</a></p>}
      </div>
      {artifact && !diagnostic && artifact.comparison && <div className="build-result-comparison"><TemplateSizeComparison comparison={artifact.comparison} /></div>}
    </div>
  </Card>;
}

export function InstallGuide({ config }: { config: BuildConfig }) {
  const files = [...new Set(config.templateKinds.map(kind => expectedTemplateFilename(config, kind)))];
  const androidArchitecture = ({ arm64: "ARM64 (arm64-v8a)", arm32: "ARMv7 (armeabi-v7a)", x86_64: "x86_64", x86_32: "x86" } as Partial<Record<BuildConfig["architecture"], string>>)[config.architecture];
  const target = ({ linux: "Linux", windows: "Windows Desktop", web: "Web", android: "Android", macos: "macOS" })[config.platform];
  const platformNote = ({
    linux: "Choose x86_64 in the Linux export preset. Test the exported game on your target distribution; templates require glibc 2.36 or newer.",
    windows: "Choose x86_64 in the Windows Desktop export preset. If using extracted templates, keep each console companion beside its matching executable.",
    web: `Use the Compatibility renderer and ${config.webThreads ? "enable" : "disable"} Thread Support. Leave Extensions Support disabled. Serve the exported game over HTTP${config.webThreads ? " with COOP/COEP headers and cross-origin isolation" : ""}.`,
    android: `Enable only ${androidArchitecture} in the Android export preset. For Gradle exports, use the bundled android_source.zip through Godot's Android build-template workflow. Test on a matching device or emulator.`,
    macos: `Choose ${config.architecture === "universal" ? "Universal" : config.architecture === "arm64" ? "Apple Silicon" : "Intel"} in the macOS export preset and use the Compatibility renderer. Sign and notarize your exported game for distribution.`,
  })[config.platform];
  return <section className="build-install-guide" aria-labelledby="install-heading">
    <h3 id="install-heading">Install and export</h3>
    <ol>
      <li><span>1</span><div><strong>Open Godot {config.godotVersion}</strong><p>Use this exact stable editor version. Installation can replace existing templates for that version.</p></div></li>
      <li><span>2</span><div><strong>Install the downloaded .tpz</strong><p>Editor → Manage Export Templates → Install from File. Select the downloaded package.</p></div></li>
      <li><span>3</span><div><strong>Export for {target}</strong><p>{config.templateKinds.length === 2 ? "Release and debug templates are included. Enable Export With Debug for a debug export; disable it for release." : config.templateKinds[0] === "debug" ? "Only the debug template is included. Enable Export With Debug." : "Only the release template is included. Disable Export With Debug."} {platformNote}</p></div></li>
    </ol>
    <details><summary>Use a custom template for this project</summary><p>Extract the TPZ and select the matching {config.platform === "web" || config.platform === "macos" ? "nested ZIP" : config.platform === "android" ? "APK" : "executable"} in the export preset's Custom Template fields:</p><ul>{files.map(file => <li key={file}><code>{file}</code></li>)}</ul></details>
    <a href="https://sxmxc.github.io/mingd/install-templates/" target="_blank" rel="noopener noreferrer">Full installation and export guide ↗</a>
  </section>;
}
