import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../lib/env.ts";
import { recipeRequestAllowed } from "../lib/recipe-request.ts";

test("deployment URLs and public keys are read when used, rather than when imported", t => {
  const keys = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const saved = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index];
  }));
  delete process.env.NEXT_PUBLIC_APP_URL;
  assert.equal(env.appUrl(), "http://localhost:3000");
  assert.equal(env.configuredAppUrl(), undefined);
  assert.equal(recipeRequestAllowed(new Request("https://app.example.com/api/recipes", {
    headers: { origin: "http://localhost:3000", host: "app.example.com", "content-type": "application/json" },
  }), env.configuredAppUrl()), false);
  for (const origin of ["http://localhost:3000", "https://mingd.voidmoose.net"]) {
    process.env.NEXT_PUBLIC_APP_URL = `${origin}/`;
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${origin}/api`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `public-${origin}`;
    assert.equal(env.appUrl(), origin);
    assert.equal(env.supabaseUrl(), `${origin}/api`);
    assert.equal(env.supabasePublishableKey(), `public-${origin}`);
  }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.throws(env.supabaseUrl, /Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL/);
});
