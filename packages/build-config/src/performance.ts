export type BuildPerformanceMetrics = {
  schemaVersion: 1;
  stageDurationsMs: Record<string, number>;
  elapsedMs: number;
  peakRssKiB: number | null;
  memoryMeasurement: "gnu-time-max-child-rss";
  linkingMeasurement: "scons-program-output-until-process-exit" | "not-observed";
  cache: { hits: number; misses: number; usageVerified: boolean; counters: Record<string, number>; compiler: string; cacheVersion: string } | null;
  artifactCacheHit: boolean;
};

export function cachedArtifactPerformance(): BuildPerformanceMetrics {
  return { schemaVersion: 1, stageDurationsMs: {}, elapsedMs: 0, peakRssKiB: null,
    memoryMeasurement: "gnu-time-max-child-rss", linkingMeasurement: "not-observed",
    cache: null, artifactCacheHit: true };
}
