import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "./return-to";

// A post-auth redirect that accepts arbitrary URLs is a phishing primitive:
// send `?returnTo=<lookalike>/login`, let the victim authenticate for real,
// bounce them to a copy, collect the password on the second try. This is the
// list that stops that, so this is the list that gets tested.

test("keeps internal paths", () => {
  assert.equal(safeReturnTo("/dashboard/plan"), "/dashboard/plan");
  assert.equal(safeReturnTo("/start?step=3"), "/start?step=3");
});

test("refuses protocol-relative URLs", () => {
  // `//evil.com` starts with a slash and leaves the site anyway.
  assert.equal(safeReturnTo("//evil.com"), "/dashboard");
});

test("allows our own hosts over https", () => {
  assert.equal(
    safeReturnTo("https://prepix.ai/ko/start"),
    "https://prepix.ai/ko/start",
  );
  assert.equal(
    safeReturnTo("https://dashboard.prepix.ai/dashboard"),
    "https://dashboard.prepix.ai/dashboard",
  );
});

test("refuses lookalike hosts", () => {
  // The reason the check is set membership and not `endsWith`.
  assert.equal(safeReturnTo("https://evil-prepix.ai/login"), "/dashboard");
  assert.equal(safeReturnTo("https://prepix.ai.evil.com/login"), "/dashboard");
  assert.equal(safeReturnTo("https://notprepix.ai/login"), "/dashboard");
});

test("refuses plaintext even on an allowed host", () => {
  assert.equal(safeReturnTo("http://prepix.ai/start"), "/dashboard");
});

test("refuses junk and empties", () => {
  assert.equal(safeReturnTo("javascript:alert(1)"), "/dashboard");
  assert.equal(safeReturnTo("not a url"), "/dashboard");
  assert.equal(safeReturnTo(null), "/dashboard");
  assert.equal(safeReturnTo(undefined), "/dashboard");
});

test("honours a caller-supplied fallback", () => {
  assert.equal(safeReturnTo(null, "/plan"), "/plan");
});
