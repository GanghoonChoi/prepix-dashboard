import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  readApiSession,
  sameApiSession,
  apiSessionKey,
  sessionChanged,
  localRefusal,
  accessEnded,
  serverRejected,
  type ApiSession,
} from "./session";
import { rejected as aiRejected } from "../b2b-ai/run";
import { pendingOutcome } from "../b2b-billing/operations";
const original: ApiSession = {
  serviceBase: "https://api.example.test/v2",
  userId: "actor",
  accessToken: "original-access",
  refreshToken: "original-refresh",
};
test("request authority includes exact service root, actor and both credential lifetimes", () => {
  assert.equal(sameApiSession(original, { ...original }), true);
  assert.equal(apiSessionKey(original), apiSessionKey({ ...original }));
  for (const patch of [
    { serviceBase: "https://other.example.test/v2" },
    { serviceBase: "https://api.example.test/v3" },
    { userId: "different" },
    { userId: null },
    { accessToken: "new-login-access" },
    { refreshToken: "new-login-refresh" },
    { accessToken: null },
    { refreshToken: null },
  ]) {
    const other = { ...original, ...patch };
    assert.equal(sameApiSession(original, other), false);
    assert.notEqual(apiSessionKey(original), apiSessionKey(other));
  }
});
test("missing, malformed and unavailable actor storage is never a confirmed refresh scope", (t) => {
  const previousWindow = (globalThis as { window?: unknown }).window,
    previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  t.after(() => {
    (globalThis as { window?: unknown }).window = previousWindow;
    (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
  });
  (globalThis as { window?: unknown }).window = {};
  for (const raw of [
    null,
    "null",
    "{",
    "{}",
    '{"id":null}',
    '{"id":33}',
    '{"id":""}',
  ]) {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => (key === "userInfo" ? raw : "token"),
    };
    assert.equal(readApiSession(original.serviceBase).userId, null);
  }
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => {
      if (key === "userInfo") return '{"id":"actor"}';
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readApiSession(original.serviceBase), {
    serviceBase: original.serviceBase,
    userId: null,
    accessToken: null,
    refreshToken: null,
  });
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) =>
      ({
        userInfo: '{"id":"actor"}',
        accessToken: "original-access",
        refreshToken: "original-refresh",
      })[key as "userInfo"],
  };
  assert.deepEqual(
    readApiSession("https://api.example.test/v2/?ignored=1#unused"),
    original,
  );
});
test("a local session fence ends a read but is never a server rejection of a mutation", () => {
  for (const local of [sessionChanged(), localRefusal("B2B_STATEMENT_ACCOUNT_CHANGED"), localRefusal("B2B_FILE_ACCOUNT_CHANGED", 403)]) {
    assert.equal(accessEnded(local), true);
    assert.equal(serverRejected(local), false);
    assert.equal(aiRejected(local), false);
    assert.equal(pendingOutcome(local), true);
  }
  for (const status of [400, 401, 403, 404, 409, 422])
    assert.equal(serverRejected(Object.assign(new Error("server"), { response: { status } })), true);
  for (const unknown of [{ response: { status: 408 } }, { response: { status: 429 } }, { response: { status: 500 } }, new Error("Network Error"), null, undefined]) {
    assert.equal(serverRejected(unknown), false);
    assert.equal(pendingOutcome(unknown), true);
  }
});
test("every mutation path classifies outcomes through the one shared policy", () => {
  const files = execFileSync("git", ["ls-files", "lib", "components", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".spec.ts") && f !== "lib/api/session.ts");
  const inline = files.filter((f) => />=\s*400\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(inline, [], "classify 4xx with serverRejected/accessEnded from lib/api/session");
  // Component mutations (members, invitations, licences, ...) share this alias.
  assert.match(readFileSync("components/b2b/shared.tsx", "utf8"), /serverRejected as definitivelyRejected/);
  const guarded = files.filter((f) => /rejectFirst\(/.test(readFileSync(f, "utf8")) && /await store\.rejectFirst/.test(readFileSync(f, "utf8")));
  assert.ok(guarded.length >= 9, guarded.join());
  for (const f of guarded)
    for (const line of readFileSync(f, "utf8").split("\n").filter((l) => /await store\.rejectFirst/.test(l)))
      assert.match(line, /serverRejected\(|pendingOutcome\(/, `${f}: ${line.trim()}`);
});
