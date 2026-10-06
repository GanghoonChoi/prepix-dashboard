import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo, withLocale } from "./return-to";

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

test('invitation destination survives authentication without accepting backslash redirects', () => {
  const destination = '/dashboard/invitations/' + 'a'.repeat(64);
  assert.equal(safeReturnTo(destination), destination);
  assert.equal(safeReturnTo('/\\evil.example'), '/dashboard');
  assert.equal(safeReturnTo('/\n/evil.example'), '/dashboard');
});

test('legacy desktop dashboard host preserves the team destination', () => {
  const target = 'https://dashboard.laskerstudio.com/dashboard/workspaces';
  assert.equal(safeReturnTo(target), target);
});

test("a known locale on the sign-in page follows an internal returnTo; unknown or existing ones do not", () => {
  assert.equal(withLocale("/dashboard/x?a=1#h", "?locale=en"), "/dashboard/x?a=1&locale=en#h");
  assert.equal(withLocale("/dashboard", "?locale=fr"), "/dashboard");
  assert.equal(withLocale("/dashboard?locale=ko", "?locale=en"), "/dashboard?locale=ko");
  assert.equal(withLocale("https://prepix.ai/start", "?locale=en"), "https://prepix.ai/start");
  assert.equal(withLocale("//evil.example", "?locale=en"), "//evil.example");
});
