import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHistoryPage, removeOwnedBuilds } from "../lib/build-history-management";

function client(result: { error: unknown; count: number | null }) {
  const calls: unknown[][] = [];
  const query = {
    delete(options: unknown) { calls.push(["delete", options]); return this; },
    eq(key: string, value: unknown) { calls.push(["eq", key, value]); return this; },
    in(key: string, value: unknown) { calls.push(["in", key, value]); return this; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
  };
  return { calls, supabase: { from(table: string) { calls.push(["from", table]); return query; } } as unknown as SupabaseClient };
}

test("history page rejects malformed and unbounded offsets", () => {
  for (const value of [undefined, "0", "-1", "1.5", "Infinity", "1000001", ["2", "3"], "2junk"]) assert.equal(buildHistoryPage(value), 1);
  assert.equal(buildHistoryPage("3"), 3);
});

test("single deletion scopes owner and terminal status in the same query", async () => {
  const { supabase, calls } = client({ error: null, count: 1 });
  const id = "20000000-0000-4000-8000-000000000001";
  assert.equal((await removeOwnedBuilds(supabase, "owner", { mode: "single", id })).deleted, 1);
  assert.deepEqual(calls, [["from", "builds"], ["delete", { count: "exact" }], ["eq", "user_id", "owner"], ["eq", "id", id], ["in", "status", ["complete", "failed"]]]);
});

test("failed cleanup scopes the owner without a page limit", async () => {
  const { supabase, calls } = client({ error: null, count: 1200 });
  assert.equal((await removeOwnedBuilds(supabase, "owner", { mode: "failed", id: null })).deleted, 1200);
  assert.deepEqual(calls, [["from", "builds"], ["delete", { count: "exact" }], ["eq", "user_id", "owner"], ["eq", "status", "failed"]]);
});

test("invalid deletion never queries the database and database failures stay generic", async () => {
  const { supabase, calls } = client({ error: { message: "private database details" }, count: null });
  assert.ok((await removeOwnedBuilds(supabase, "owner", { mode: "all", id: null })).error);
  assert.ok((await removeOwnedBuilds(supabase, "owner", { mode: "single", id: "bad" })).error);
  assert.equal(calls.length, 0);
  const failure = await removeOwnedBuilds(supabase, "owner", { mode: "failed", id: null });
  assert.equal(failure.error, "Could not remove builds. Try again.");
  const empty = client({ error: null, count: 0 });
  assert.ok((await removeOwnedBuilds(empty.supabase, "owner", { mode: "single", id: "20000000-0000-4000-8000-000000000001" })).error);
});
