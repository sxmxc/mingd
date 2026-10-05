import assert from "node:assert/strict";
import test from "node:test";
import { formatBuildTime } from "../lib/format-build-time.ts";

test("build timestamp is identical in server and browser timezones", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Chicago", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      assert.equal(formatBuildTime("2026-10-05T02:09:49+00:00"), "2026-10-05 02:09:49 UTC");
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
test("explicit offsets normalize to the same UTC instant", () => {
  assert.equal(formatBuildTime("2026-10-04T21:09:49-05:00"), "2026-10-05 02:09:49 UTC");
});
test("invalid dates use a stable fallback", () => {
  assert.equal(formatBuildTime("invalid"), "Unknown date");
});
