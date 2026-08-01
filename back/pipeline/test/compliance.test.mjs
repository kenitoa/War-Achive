import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDeclaredCompliance, robotsAllows } from "../dist/compliance.js";

test("robots rules prefer the longest matching allow rule", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /archive/",
    "Allow: /archive/public/"
  ].join("\n");
  assert.equal(robotsAllows(robots, "https://example.com/archive/private/a"), false);
  assert.equal(robotsAllows(robots, "https://example.com/archive/public/a"), true);
});

test("URL source without reviewed policy is rejected", () => {
  assert.throws(
    () => assertDeclaredCompliance({ kind: "url", url: "https://example.com/history" }),
    /정책 확인 정보/
  );
});

test("API JSON source without reviewed policy is rejected", () => {
  assert.throws(
    () => assertDeclaredCompliance({ kind: "api-json", url: "https://example.com/history.json" }),
    /정책 확인 정보/
  );
});

test("declared policy enforces a minimum one-second interval", () => {
  assert.throws(
    () => assertDeclaredCompliance({
      kind: "url",
      url: "https://example.com/history",
      compliance: {
        reviewedAt: "2026-07-12",
        crawlAllowed: true,
        termsUrl: "https://example.com/terms",
        copyrightUrl: "https://example.com/copyright",
        minIntervalMs: 999
      }
    }),
    /1000/
  );
});
