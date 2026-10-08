import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG } from "@mingd/build-config";
import { AssignmentSchema, BuildHeartbeatSchema, WorkerHelloSchema } from "../src/index.ts";

const id = "00000000-0000-4000-8000-000000000001";
const hello = { protocolVersion: 1, release: "0.2.0", recipeVersion: "9", target: "desktop", toolchainSha256: null };

test("worker negotiation requires v1 and verified macOS toolchain identity", () => {
  assert.equal(WorkerHelloSchema.parse(hello).target, "desktop");
  for (const value of [{ ...hello, protocolVersion: 2 }, { ...hello, target: "macos" }, { ...hello, token: "secret" }]) {
    assert.equal(WorkerHelloSchema.safeParse(value).success, false);
  }
  assert.equal(WorkerHelloSchema.safeParse({ ...hello, target: "macos", toolchainSha256: "a".repeat(64) }).success, true);
});

test("assignment accepts shared build contract but rejects compiler commands and nested unknown inputs", () => {
  const assignment = { protocolVersion: 1, assignmentId: id, buildId: id, configHash: "a".repeat(64),
    config: DEFAULT_BUILD_CONFIG, release: "0.2.0", recipeVersion: "9", dryRun: false,
    leaseExpiresAt: "2026-10-08T00:00:00Z" };
  assert.equal(AssignmentSchema.safeParse(assignment).success, true);
  for (const value of [
    { ...assignment, sourceUrl: "https://evil.example/source" },
    { ...assignment, config: { ...assignment.config, sconsArgs: ["arbitrary"] } },
    { ...assignment, config: { ...assignment.config, features: { ...assignment.config.features, customModule: true } } },
    { ...assignment, config: { ...assignment.config, platform: "unknown" } },
    { ...assignment, assignmentId: "../../work" },
  ]) assert.equal(AssignmentSchema.safeParse(value).success, false);
});

test("heartbeats cannot supply lease timestamps, terminal states or oversized diagnostics", () => {
  const heartbeat = { protocolVersion: 1, assignmentId: id, stage: "compiling", logTail: null, lastOutputAt: null, outputBytes: 12 };
  assert.equal(BuildHeartbeatSchema.safeParse(heartbeat).success, true);
  for (const value of [
    { ...heartbeat, stage: "complete" }, { ...heartbeat, leaseExpiresAt: "2099-01-01T00:00:00Z" },
    { ...heartbeat, logTail: "x".repeat(12_001) }, { ...heartbeat, outputBytes: -1 },
    { ...heartbeat, outputBytes: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(BuildHeartbeatSchema.safeParse(value).success, false);
});
