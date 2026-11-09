import assert from "node:assert/strict";
import test from "node:test";
import { identityAction } from "./analytics";

test("signed in: the account id, switched to once", () => {
  assert.equal(identityAction("acct", "px_visitor", false), "identify");
  assert.equal(identityAction("acct", "other_acct", true), "identify");
  assert.equal(identityAction("acct", "acct", true), "none");
});

test("signed out: an identified id is dropped, an anonymous one kept", () => {
  assert.equal(identityAction(null, "acct", true), "reset");
  assert.equal(identityAction(null, "px_visitor", false), "none");
  assert.equal(identityAction(null, undefined, false), "none");
});
