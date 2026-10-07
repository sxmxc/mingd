import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { TemplateSizeComparison } from "../components/size-comparison";

test("comparison UI shows savings, larger binaries and unavailable references accurately", () => {
  const base = { officialBytes: 100, customBytes: 25, savedBytes: 75, percentSaved: 75, measurement: "executables" as const, references: [] };
  assert.match(renderToStaticMarkup(createElement(TemplateSizeComparison, { comparison: base })), /75.0% smaller/);
  assert.match(renderToStaticMarkup(createElement(TemplateSizeComparison, { comparison: { ...base, customBytes: 125, savedBytes: -25, percentSaved: -25 } })), /25.0% larger/);
  const unavailable = renderToStaticMarkup(createElement(TemplateSizeComparison, { comparison: null }));
  assert.match(unavailable, /comparison unavailable/); assert.doesNotMatch(unavailable, /% smaller/);
});
