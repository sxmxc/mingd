import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { BuildStatus } from "../components/build-status";
import { InstallGuide } from "../components/build-result";
import { DEFAULT_BUILD_CONFIG, normalizeBuildConfig } from "@mingd/build-config";

const initial: ComponentProps<typeof BuildStatus>["initial"] = {
  id: "layout-regression", status: "complete", stage: "Template ready", progress: 100,
  error: null, log_tail: "Compilation finished", config: { ...DEFAULT_BUILD_CONFIG, platform: "windows" }, artifact_id: "artifact",
  artifact: { sha256: "a".repeat(64), size_bytes: 1024, binary_size_bytes: 512, build_recipe_version: "test", is_dry_run: false, comparison: null },
  created_at: "2026-10-05T01:00:00Z", started_at: "2026-10-05T01:00:00Z", completed_at: "2026-10-05T01:01:00Z",
  heartbeat_at: null, stage_started_at: null, last_output_at: null, output_bytes: 2048,
};

test("monitor has one diagnostics tabset and a full-width activity strip", () => {
  const html = renderToStaticMarkup(createElement(BuildStatus, { initial }));
  assert.equal((html.match(/role="tablist"/g) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 2);
  assert.match(html, /aria-label="Build activity"/);
  assert.match(html, /Download template .tpz/);
  assert.match(html, /aria-selected="true" tabindex="0"/);
});

test("monitor does not offer a download when artifact details are unavailable", () => {
  const html = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial, artifact_id: null, artifact: null } }));
  assert.match(html, /Artifact details are unavailable/);
  assert.doesNotMatch(html, /Download template/);
});

test("pipeline reports active, pending, skipped, and unrecorded failure stages honestly", () => {
  const active = renderToStaticMarkup(createElement(BuildStatus, { initial: {
    ...initial, status: "compiling", stage: "Compiling export template", completed_at: null,
  } }));
  assert.match(active, /Queue: Completed/);
  assert.match(active, /Compile: In progress/);
  assert.match(active, /Validate: Pending/);

  const cached = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial,
    performance_metrics: { schemaVersion: 1, stageDurationsMs: {}, elapsedMs: 0, peakRssKiB: null,
      memoryMeasurement: "gnu-time-max-child-rss", linkingMeasurement: "not-observed", cache: null, artifactCacheHit: true },
  } }));
  assert.match(cached, /Skipped for cached artifact/);

  const failed = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial, status: "failed", error: "Compile failed" } }));
  assert.match(failed, /Build failed; the failing stage was not recorded/);
  assert.match(failed, /exact failing stage is not available/);
});

test("monitor keeps artifact reuse and failure information visible without fabricated metrics", () => {
  const cached = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial,
    performance_metrics: { schemaVersion: 1, stageDurationsMs: {}, elapsedMs: 0, peakRssKiB: null,
      memoryMeasurement: "gnu-time-max-child-rss", linkingMeasurement: "not-observed", cache: null, artifactCacheHit: true },
  } }));
  assert.match(cached, /Artifact reused. No compiler ran/);
  const failed = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial, status: "failed", error: "Compile failed" } }));
  assert.match(failed, /role="alert"[^>]*>Compile failed/);
  assert.doesNotMatch(failed, /Download template/);
});

test("only real completed artifacts offer template installation", () => {
  const complete = renderToStaticMarkup(createElement(BuildStatus, { initial }));
  assert.match(complete, /Your template is ready/);
  assert.match(complete, /Install and export/);
  assert.match(complete, /Manage Export Templates/);
  const diagnostic = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial,
    artifact: { ...initial.artifact!, is_dry_run: true },
  } }));
  assert.match(diagnostic, /Dry-run diagnostic ready/);
  assert.doesNotMatch(diagnostic, /Install and export|Download template/);
  const failed = renderToStaticMarkup(createElement(BuildStatus, { initial: { ...initial, status: "failed", error: "Upload interrupted" } }));
  assert.match(failed, /Retry this recipe/);
  assert.match(failed, /Review recipe/);
  assert.match(failed, /Copy diagnostics/);
  assert.doesNotMatch(failed, /Install and export/);
});

test("installation instructions match platform, included kinds, and Web thread mode", () => {
  const render = (overrides: Record<string, unknown>) => renderToStaticMarkup(createElement(InstallGuide, {
    config: normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, ...overrides }),
  }));
  const windows = render({ platform: "windows", templateKinds: ["debug"] });
  assert.match(windows, /Only the debug template/);
  assert.match(windows, /windows_debug_x86_64.exe/);
  assert.doesNotMatch(windows, /windows_release_x86_64.exe/);
  const linux = render({ platform: "linux", templateKinds: ["release"] });
  assert.match(linux, /Disable Export With Debug/);
  assert.match(linux, /linux_release.x86_64/);
  const web = render({ platform: "web", architecture: "wasm32", webThreads: true });
  assert.match(web, /enable Thread Support/);
  assert.match(web, /COOP\/COEP/);
  assert.match(web, /web_release.zip/);
  const noThreads = render({ platform: "web", architecture: "wasm32", webThreads: false });
  assert.match(noThreads, /disable Thread Support/);
  assert.match(noThreads, /web_nothreads_release.zip/);
  assert.doesNotMatch(noThreads, /COOP\/COEP/);
  const android = render({ platform: "android", architecture: "arm64" });
  assert.match(android, /Enable only ARM64 \(arm64-v8a\)/);
  assert.match(android, /android_source.zip/);
  const macos = render({ platform: "macos", architecture: "universal", templateKinds: ["release", "debug"] });
  assert.match(macos, /Release and debug templates are included/);
  assert.match(macos, /Choose Universal/);
  assert.equal((macos.match(/<code>macos.zip<\/code>/g) ?? []).length, 1);
});
