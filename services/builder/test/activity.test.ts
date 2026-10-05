import assert from "node:assert/strict";
import test from "node:test";
import { BuildActivity, sanitizeLog } from "../src/activity.js";
import { runProcess } from "../src/process.js";

test("activity combines split secrets, strips ANSI and records output independently of heartbeats", () => {
  const activity = new BuildActivity(["private-credential"]);
  const time = new Date("2026-01-01T00:00:00Z");
  activity.record("\x1b[31mprivate-", time);
  activity.record("credential\x1b[0m", time);
  const snapshot = activity.snapshot(new Date("2026-01-01T00:00:10Z"));
  assert.equal(snapshot.log_tail, "[REDACTED]");
  assert.equal(snapshot.last_output_at, time.toISOString());
  assert.equal(snapshot.heartbeat_at, "2026-01-01T00:00:10.000Z");
  assert.ok(snapshot.output_bytes > 0);
});
test("diagnostics are bounded and common credentials are redacted", () => {
  const activity = new BuildActivity();
  activity.record("x".repeat(50000));
  assert.equal(activity.snapshot().log_tail?.length, 12000);
  assert.equal(sanitizeLog("redis://user:password@host sb_secret_abc123"), "redis://[REDACTED]@host [REDACTED]");
  assert.equal(new BuildActivity().snapshot().last_output_at, null);
});
test("process forwards both output streams and rejects unsuccessful commands", async () => {
  const output: string[] = [];
  await runProcess(process.execPath, ["-e", "process.stdout.write('stdout'); process.stderr.write('stderr')"], { onOutput: chunk => output.push(chunk.toString()) });
  assert.match(output.join(""), /stdout/);
  assert.match(output.join(""), /stderr/);
  await assert.rejects(runProcess(process.execPath, ["-e", "process.exit(2)"]), /code 2/);
});
