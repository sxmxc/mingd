import assert from "node:assert/strict";
import test from "node:test";
import { readAnnouncementPreferences, siteAnnouncementsSchema } from "../lib/site-announcements.ts";

test("announcement input supports multiple messages and removes blanks and duplicates", () => {
  assert.deepEqual(siteAnnouncementsSchema.parse([" Maintenance ", "", "Build delay", "Maintenance"]), ["Maintenance", "Build delay"]);
  assert.deepEqual(siteAnnouncementsSchema.parse([]), []);
});

test("announcement input rejects oversized lists, messages and non-text values", () => {
  assert.equal(siteAnnouncementsSchema.safeParse(Array(11).fill("notice")).success, false);
  assert.equal(siteAnnouncementsSchema.safeParse(["x".repeat(501)]).success, false);
  assert.equal(siteAnnouncementsSchema.safeParse([{}]).success, false);
  assert.equal(siteAnnouncementsSchema.safeParse(["x".repeat(500)]).success, true);
});

test("malformed or outdated saved preferences recover without hiding new messages", () => {
  for (const value of [null, "invalid", "null", "{}", '{"dismissed":[1],"collapsed":[]}']) {
    assert.deepEqual(readAnnouncementPreferences(value), { dismissed: [], collapsed: [] });
  }
  const preferences = readAnnouncementPreferences('{"dismissed":["old"],"collapsed":["other"]}');
  assert.deepEqual(preferences, { dismissed: ["old"], collapsed: ["other"] });
  assert.equal(preferences.dismissed.includes("edited"), false);
});
