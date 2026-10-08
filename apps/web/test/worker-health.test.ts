import assert from "node:assert/strict";
import test from "node:test";
import { cacheHitRate, readingAge, workerHealth, workerTelemetry } from "../lib/worker-health";
test("worker status depends on authenticated receipt age, with revocation and drain states", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const worker = { disabled: false, draining: false, lastSeenAt: new Date(now - 10_000).toISOString() };
  assert.equal(workerHealth(worker, now), "Online");
  assert.equal(workerHealth({ ...worker, draining: true }, now), "Draining");
  assert.equal(workerHealth({ ...worker, lastSeenAt: new Date(now - 60_000).toISOString() }, now), "Stale");
  assert.equal(workerHealth({ ...worker, lastSeenAt: new Date(now - 90_001).toISOString() }, now), "Offline");
  assert.equal(workerHealth({ ...worker, lastSeenAt: null }, now), "Offline");
  assert.equal(workerHealth({ ...worker, disabled: true }, now), "Revoked");
  assert.equal(readingAge("invalid", now), null);
  assert.equal(readingAge(new Date(now + 60_000).toISOString(), now), null);
});
test("unavailable telemetry and caches with no lookups are not presented as zero-percent hits", () => {
  assert.equal(workerTelemetry(null), null);
  assert.equal(workerTelemetry({ schemaVersion: 2 }), null);
  assert.equal(cacheHitRate(0, 0), "No lookups");
  assert.equal(cacheHitRate(3, 1), "75.0%");
});
