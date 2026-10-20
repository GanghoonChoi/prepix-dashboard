import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCallbackUrl, parseAppRedirect, readConnectRequest } from "./device-connect";

// `/connect` hands out a live session in exchange for a redirect target the
// CALLER supplies. If that target can be anything, the page is an open redirect
// that mails a session to whoever wrote the link. This is the guard, so it gets
// the test.
//
// Run: npx tsx --test lib/device-connect.spec.ts

test("accepts a loopback address with an explicit port", () => {
  assert.ok(parseAppRedirect("http://127.0.0.1:53219/callback"));
  assert.ok(parseAppRedirect("http://[::1]:53219/callback"));
});

test("accepts the app's own links, exactly", () => {
  assert.ok(parseAppRedirect("prepix://auth/callback"));
  assert.ok(parseAppRedirect("prepix-dev://auth/callback"));
  assert.equal(parseAppRedirect("prepix://auth/callback?code=x"), null);
  assert.equal(parseAppRedirect("prepix://evil/callback"), null);
  assert.equal(parseAppRedirect("other://auth/callback"), null);
});

test("puts code and state on the app's link", () => {
  const url = buildCallbackUrl(parseAppRedirect("prepix://auth/callback")!, {
    code: "c0de",
    state: "s7ate",
  });
  assert.equal(url, "prepix://auth/callback?code=c0de&state=s7ate");
});

test("refuses localhost — it resolves through DNS", () => {
  // On a hostile network `localhost` is not guaranteed to be this machine.
  // RFC 8252 §7.3 names the literal loopback IP for exactly this reason.
  assert.equal(parseAppRedirect("http://localhost:53219/callback"), null);
});

test("refuses any host that is not loopback", () => {
  assert.equal(parseAppRedirect("https://evil.com/callback"), null);
  assert.equal(parseAppRedirect("http://evil.com:80/callback"), null);
  assert.equal(parseAppRedirect("//evil.com"), null);
});

test("refuses a target without a port", () => {
  // The app binds an ephemeral port; a portless target is not one of ours.
  assert.equal(parseAppRedirect("http://127.0.0.1/callback"), null);
});

test("refuses a target that already carries a query or fragment", () => {
  // We append `?code=`; a pre-existing one could shadow it depending on how
  // the receiver parses.
  assert.equal(parseAppRedirect("http://127.0.0.1:53219/cb?code=x"), null);
  assert.equal(parseAppRedirect("http://127.0.0.1:53219/cb#frag"), null);
});

test("refuses embedded credentials", () => {
  assert.equal(parseAppRedirect("http://user:pw@127.0.0.1:53219/cb"), null);
});

test("refuses junk", () => {
  assert.equal(parseAppRedirect("not a url"), null);
  assert.equal(parseAppRedirect(null), null);
});

const REDIRECT = encodeURIComponent("http://127.0.0.1:5001/callback");
const CHALLENGE = "a".repeat(43);

test("parses a well-formed request", () => {
  const parsed = readConnectRequest(
    `?redirect_uri=${REDIRECT}&state=abcdefghij&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
  );
  assert.ok(parsed);
  assert.equal(parsed.state, "abcdefghij");
});

test("refuses plain PKCE", () => {
  // `plain` would put the challenge on the same loopback redirect as the code
  // it is supposed to protect, which is no protection at all.
  assert.equal(
    readConnectRequest(
      `?redirect_uri=${REDIRECT}&state=abcdefghij&code_challenge=${CHALLENGE}&code_challenge_method=plain`,
    ),
    null,
  );
});

test("refuses a missing or short state", () => {
  assert.equal(
    readConnectRequest(
      `?redirect_uri=${REDIRECT}&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
    ),
    null,
  );
});
