import { performance } from "node:perf_hooks";

import type { BuildPerformanceMetrics } from "@mingd/build-config";
export type BuildMeasurements = BuildPerformanceMetrics;

export class BuildPerformance {
  private started = performance.now();
  private stageStarted = this.started;
  private stage: string | null = null;
  private measurements: BuildMeasurements = {
    schemaVersion: 1, stageDurationsMs: {}, elapsedMs: 0, peakRssKiB: null,
    memoryMeasurement: "gnu-time-max-child-rss", linkingMeasurement: "not-observed",
    cache: null, artifactCacheHit: false,
  };
  transition(stage: string, now = performance.now()) {
    this.flush(now);
    this.stage = stage;
    this.stageStarted = now;
  }
  private flush(now: number) {
    if (this.stage) this.measurements.stageDurationsMs[this.stage] = (this.measurements.stageDurationsMs[this.stage] ?? 0) + Math.max(0, now - this.stageStarted);
    this.stageStarted = now;
  }
  markLinking() { this.measurements.linkingMeasurement = "scons-program-output-until-process-exit"; this.transition("linking"); }
  recordPeak(value: number | null) {
    if (value !== null) this.measurements.peakRssKiB = Math.max(this.measurements.peakRssKiB ?? 0, value);
  }
  setCache(cache: BuildMeasurements["cache"]) { this.measurements.cache = cache; }
  markArtifactCacheHit() { this.measurements.artifactCacheHit = true; }
  snapshot(now = performance.now()): BuildMeasurements {
    this.flush(now);
    return { ...this.measurements, elapsedMs: Math.max(0, now - this.started), stageDurationsMs: { ...this.measurements.stageDurationsMs } };
  }
  finish() { this.flush(performance.now()); this.stage = null; return this.snapshot(); }
}

/** SCons output can be split across pipe chunks. Only final engine executable/shared-library links count. */
export class LinkObserver {
  private buffer = "";
  private observed = false;
  constructor(private readonly onLink: () => void) {}
  record(chunk: Buffer) {
    this.buffer = (this.buffer + chunk.toString()).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    if (!this.observed && (/Linking Program\s+.*godot\.(?:windows|linuxbsd|web|macos)\.template_(?:release|debug)\.[a-z0-9_]+(?:\.nothreads)?(?:\.exe|\.js)?(?=[\s"'])/.test(this.buffer) || /Linking Shared Library\s+.*libgodot\.android\.template_(?:release|debug)\.(?:arm64|arm32|x86_64|x86_32)\.so(?=[\s"'])/.test(this.buffer))) {
      this.observed = true;
      this.onLink();
    }
    this.buffer = this.buffer.slice(-2048);
  }
}
