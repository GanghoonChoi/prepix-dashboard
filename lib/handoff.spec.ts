import { test } from "node:test";
import assert from "node:assert/strict";
import { readHandoff, clearHandoff } from "./handoff";

// The hand-off cookie is the credential for exactly one API call. Everything
// here is about not acting on something that is not one.

function withCookie(value: string) {
  (globalThis as { document?: { cookie: string } }).document = { cookie: value };
  withoutWindow();
}

/**
 * The other way it can arrive, and the one the cross-domain move needs.
 *
 * A cookie cannot travel from `prepix.ai` to `dashboard.laskerstudio.com`, so
 * the site puts the hand-off in the fragment instead. `window` is stubbed
 * rather than mocked wholesale: `readHandoff` only looks at
 * `location.hash`, and `clearHandoff` only at `history.replaceState`.
 */
function withHash(hash: string, path = "/session", search = "") {
  const calls: Array<[unknown, string, string]> = [];
  (globalThis as { window?: unknown }).window = {
    location: { hash, pathname: path, search },
    history: {
      replaceState: (a: unknown, b: string, c: string) => {
        calls.push([a, b, c]);
        (globalThis as { window: { location: { hash: string } } }).window.location.hash = "";
      },
    },
  };
  return calls;
}

function withoutWindow() {
  (globalThis as { window?: unknown }).window = undefined;
}

test("reads a well-formed hand-off", () => {
  withCookie(
    `px_handoff=${encodeURIComponent(JSON.stringify({ code: "c", verifier: "v" }))}`,
  );
  assert.deepEqual(readHandoff(), { code: "c", verifier: "v" });
});

test("finds it among other cookies", () => {
  withCookie(
    `px_aid=abc; px_handoff=${encodeURIComponent(
      JSON.stringify({ code: "c", verifier: "v" }),
    )}; other=1`,
  );
  assert.deepEqual(readHandoff(), { code: "c", verifier: "v" });
});

test("returns null when there is no cookie", () => {
  withCookie("px_aid=abc");
  assert.equal(readHandoff(), null);
});

test("returns null on malformed JSON rather than throwing", () => {
  // A half-written cookie must land the visitor on the sign-in form, not on a
  // blank page with an uncaught exception.
  withCookie("px_handoff=%7Bnot-json");
  assert.equal(readHandoff(), null);
});

test("returns null when a field is missing", () => {
  withCookie(
    `px_handoff=${encodeURIComponent(JSON.stringify({ code: "c" }))}`,
  );
  assert.equal(readHandoff(), null);
});

test("returns null when a field is the wrong type", () => {
  withCookie(
    `px_handoff=${encodeURIComponent(JSON.stringify({ code: 1, verifier: {} }))}`,
  );
  assert.equal(readHandoff(), null);
});

// ---------------------------------------------------------------- fragment --

test("reads the hand-off from the URL fragment", () => {
  withCookie("px_aid=abc");
  withHash("#code=c1&verifier=v1");
  assert.deepEqual(readHandoff(), { code: "c1", verifier: "v1" });
});

test("the fragment wins over a cookie", () => {
  // Both can be present: the site still writes the cookie so that a dashboard
  // build older than this one keeps working. Whichever is newer is the URL.
  withCookie(
    `px_handoff=${encodeURIComponent(JSON.stringify({ code: "old", verifier: "old" }))}`,
  );
  withHash("#code=new&verifier=new");
  assert.deepEqual(readHandoff(), { code: "new", verifier: "new" });
});

test("falls back to the cookie when the fragment is empty", () => {
  withCookie(
    `px_handoff=${encodeURIComponent(JSON.stringify({ code: "c", verifier: "v" }))}`,
  );
  withHash("");
  assert.deepEqual(readHandoff(), { code: "c", verifier: "v" });
});

test("a fragment missing one field does not half-redeem", () => {
  // Calling /auth/device/token with a code and no verifier burns the code and
  // fails, and the code is single-use — the visitor cannot simply retry.
  withCookie("px_aid=abc");
  withHash("#code=c1");
  assert.equal(readHandoff(), null);
});

test("a fragment that is not a query string is ignored, not thrown on", () => {
  withCookie("px_aid=abc");
  withHash("#some-anchor");
  assert.equal(readHandoff(), null);
});

// ------------------------------------------------------------------ clear --

test("clearHandoff rewrites the history entry rather than adding one", () => {
  // Assigning `location.hash` would push a SECOND entry holding the credential
  // and leave the first one behind, so Back would land on the code.
  withCookie("px_aid=abc");
  const calls = withHash("#code=c1&verifier=v1", "/session", "?returnTo=%2Fplan");
  clearHandoff();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], "/session?returnTo=%2Fplan");
  assert.equal(readHandoff(), null);
});

test("clearHandoff keeps returnTo, which the page still needs", () => {
  withCookie("px_aid=abc");
  const calls = withHash("#code=c&verifier=v", "/session", "?returnTo=%2Fdashboard");
  clearHandoff();
  assert.match(calls[0][2], /returnTo=%2Fdashboard/);
});
