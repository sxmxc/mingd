import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadWorkerDetails } from "../lib/worker-details";

const id = "10000000-0000-4000-8000-000000000001";
const buildId = "20000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-10-08T12:00:00Z");
const worker = {
  id, name: "worker", target: "web", release: "0.2.2", recipeVersion: "9", capacity: 1,
  disabled: false, draining: false, lastSeenAt: null, telemetryAt: null, telemetry: null,
};

function client(respond: (url: URL) => { body: unknown; status?: number }) {
  const requests: URL[] = [];
  const db = createClient("http://supabase.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      requests.push(url);
      const { body, status = 200 } = respond(url);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { db, requests };
}

test("worker detail queries use the requested ID and bounded assignment projections", async () => {
  const { db, requests } = client(url => {
    if (url.pathname.endsWith("build_workers")) return { body: [worker] };
    const build = { id: buildId, status: "compiling", stage: "Compiling export template" };
    return url.searchParams.has("state")
      ? { body: [{ leaseUntil: "2026-10-08T12:01:00Z", build: { ...build, progress: 25 } }] }
      : { body: [{ assignmentState: "active", build: { ...build, metrics: null } }] };
  });
  const result = await loadWorkerDetails(db, id, now);
  assert.equal(result?.id, id);
  assert.equal(result?.activeBuilds[0].progress, 25);
  assert.equal(result?.latestBuild?.assignmentState, "active");
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get("id"), `eq.${id}`);
  for (const request of requests) assert.doesNotMatch(request.searchParams.get("select")!, /credential|user_id|config|\*/);
  const active = requests.find(url => url.searchParams.has("state"))!;
  assert.equal(active.searchParams.get("worker_id"), `eq.${id}`);
  assert.equal(active.searchParams.get("state"), "eq.active");
  assert.equal(active.searchParams.get("lease_until"), "gt.2026-10-08T12:00:00.000Z");
  assert.equal(active.searchParams.get("limit"), "16");
  const latest = requests.find(url => url.searchParams.get("limit") === "1")!;
  assert.equal(latest.searchParams.get("worker_id"), `eq.${id}`);
  assert.equal(latest.searchParams.get("order"), "created_at.desc,id.desc");
});

test("missing workers stop before querying build activity, and invalid IDs never query", async () => {
  const { db, requests } = client(() => ({ body: [] }));
  assert.equal(await loadWorkerDetails(db, id, now), null);
  assert.equal(requests.length, 1);
  await assert.rejects(loadWorkerDetails(db, "invalid", now));
  assert.equal(requests.length, 1);
});

test("workers without assignments render empty activity and unavailable diagnostics", async () => {
  const { db } = client(url => ({ body: url.pathname.endsWith("build_workers") ? [worker] : [] }));
  const result = await loadWorkerDetails(db, id, now);
  assert.deepEqual(result?.activeBuilds, []);
  assert.equal(result?.latestBuild, null);
});

test("query failures are errors rather than missing workers or empty activity", async () => {
  for (const failWorker of [true, false]) {
    const { db } = client(url => url.pathname.endsWith("build_workers") && !failWorker
      ? { body: [worker] }
      : { status: 500, body: { message: "Database unavailable", code: "XX000" } });
    await assert.rejects(loadWorkerDetails(db, id, now), /unavailable/);
  }
});
