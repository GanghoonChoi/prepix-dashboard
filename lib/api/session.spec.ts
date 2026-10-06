import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  readApiSession,
  sameApiSession,
  freeable,
  notSent,
  freeIntent,
  releaseRejected,
  discardUnapplied,
  sessionChanged,
  localRefusal,
  accessEnded,
  serverRejected,
  type ApiSession,
} from "./session";
import { storeSession, endSession } from "./session";
import { rejected as aiRejected } from "../b2b-ai/run";
import { pendingOutcome } from "../b2b-billing/operations";
const original: ApiSession = {
  serviceBase: "https://api.example.test/v2",
  userId: "actor",
  lineage: "original-lineage",
  accessToken: "original-access",
  refreshToken: "original-refresh",
};
test("request authority is service, actor and login lineage; tokens are only credentials", () => {
  assert.equal(sameApiSession(original, { ...original }), true);
  // A refresh rotation (this tab's or another tab's) keeps the same session.
  assert.equal(sameApiSession(original, { ...original, accessToken: "rotated", refreshToken: "rotated-refresh" }), true);
  assert.equal(sameApiSession(original, { ...original, accessToken: null, refreshToken: null }), true);
  for (const patch of [
    { serviceBase: "https://other.example.test/v2" },
    { serviceBase: "https://api.example.test/v3" },
    { userId: "different" },
    { userId: null },
    // The same account signing in again starts a new lineage.
    { lineage: "new-login-lineage" },
    { lineage: null },
  ]) assert.equal(sameApiSession(original, { ...original, ...patch }), false);
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
    const read = readApiSession(original.serviceBase);
    assert.equal(read.userId, null);
    // A corrupt actor cache never hides the credentials: refresh and sign-out need them.
    assert.equal(read.accessToken, "token");
    assert.equal(read.refreshToken, "token");
  }
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => {
      if (key === "userInfo") return '{"id":"actor"}';
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readApiSession(original.serviceBase), {
    serviceBase: original.serviceBase,
    // The actor cache and the credentials are read independently.
    userId: "actor",
    lineage: null,
    accessToken: null,
    refreshToken: null,
  });
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) =>
      ({
        userInfo: '{"id":"actor"}',
        sessionLineage: "original-lineage",
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
  // Local refusals are raised only through localRefusal() so they stay marked.
  const synthetic = files.filter((f) => /response:\s*\{\s*status/.test(readFileSync(f, "utf8")));
  assert.deepEqual(synthetic, [], "raise synthetic 4xx with localRefusal(code, status)");
  // Mutation flows (anything that frees a pending key) never read a status inline.
  const mutating = files.filter((f) => /rejectFirst|releaseRejected|pending\.current = null|freeIntent/.test(readFileSync(f, "utf8")));
  // licences.tsx reads (access ended); delivery's `missing` is a receipt lookup answer.
  const lookups = ["components/b2b/licences.tsx", "lib/b2b-delivery/operations.ts"];
  const inlineStatus = mutating.filter((f) => !lookups.includes(f) && /status\)?\s*(===|!==|>=|<=|<|>)\s*4\d\d/.test(readFileSync(f, "utf8")));
  assert.deepEqual(inlineStatus, [], "mutation outcome comes from the shared policy, not an inline status check");
  // Component mutations (members, invitations, licences, ...) share this alias.
  assert.match(readFileSync("components/b2b/shared.tsx", "utf8"), /serverRejected as definitivelyRejected/);
  const guarded = files.filter((f) => /releaseRejected\(/.test(readFileSync(f, "utf8")));
  assert.ok(guarded.length >= 9, guarded.join());
  // A bare rejectFirst on any error would free a key regardless of attempt.
  const bare = files.filter((f) => /await store\.rejectFirst/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bare, [], "free pending keys through releaseRejected()");
  // Nor may a path finish (free) a failed record itself, e.g. on its own list
  // of "final" server codes: only releaseRejected's lookup decides.
  const ownRule = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    // Text from `open` to its matching close (balanced in these sources).
    const span = (from: number, open: string, close: string) => {
      const start = src.indexOf(open, from);
      let depth = 0;
      for (let i = start; i < src.length; i++)
        if (src[i] === open) depth++;
        else if (src[i] === close && --depth === 0) return src.slice(start, i + 1);
      return src.slice(start);
    };
    // A direct finish in a catch body, outside the callbacks handed to
    // releaseRejected (the shared rule's own discard), frees a record itself.
    return [...src.matchAll(/catch\s*\([^)]*\)\s*\{/g)].some((m) => {
      let body = span(m.index!, "{", "}");
      for (let at = body.indexOf("releaseRejected("); at >= 0; at = body.indexOf("releaseRejected(")) {
        const local = body.indexOf("(", at);
        let depth = 0, end = local;
        for (; end < body.length; end++)
          if (body[end] === "(") depth++;
          else if (body[end] === ")" && --depth === 0) break;
        body = body.slice(0, at) + body.slice(end + 1);
      }
      return /\bstore\.finish\(/.test(body);
    });
  });
  assert.deepEqual(ownRule, [], "a failed send frees its record only through releaseRejected()");
  assert.ok(guarded.includes("lib/b2b-billing/operations.ts"), "billing (incl. termination and re-consent) uses the shared rule");
});

test("sign-in writes a fresh lineage and drops the previous actor; sign-out removes all four keys", (t) => {
  const store = new Map<string, string>([["userInfo", '{"id":"old"}']]);
  const previousWindow = (globalThis as { window?: unknown }).window,
    previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  t.after(() => {
    (globalThis as { window?: unknown }).window = previousWindow;
    (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
  });
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  storeSession("a1", "r1");
  const first = readApiSession(original.serviceBase);
  assert.equal(first.userId, null);
  assert.ok(first.lineage);
  store.set("userInfo", '{"id":"same"}');
  const signedIn = readApiSession(original.serviceBase);
  store.set("accessToken", "a2");
  store.set("refreshToken", "r2");
  assert.equal(sameApiSession(signedIn, readApiSession(original.serviceBase)), true);
  storeSession("a3", "r3", { id: "same" });
  assert.equal(sameApiSession(signedIn, readApiSession(original.serviceBase)), false);
  endSession();
  assert.deepEqual([...store.keys()], []);
});
test("an unsent refusal frees a first attempt; later attempts free only through a receipt lookup", async () => {
  const server = Object.assign(new Error("server"), { response: { status: 409 } });
  const unsent = sessionChanged(true), sentThenFenced = sessionChanged(), proxy = localRefusal("B2B_X", 403, true);
  assert.equal(notSent(unsent) && notSent(proxy), true);
  assert.equal(notSent(sentThenFenced), false);
  assert.equal(freeable(unsent), true);
  assert.equal(freeable(sentThenFenced), false);
  assert.equal(freeable(server), true);
  assert.equal(aiRejected(unsent), false);
  const run = async (error: unknown, attempts: number, lookup: () => Promise<unknown>) => {
    const calls: string[] = [];
    await releaseRejected(error, attempts, async () => void calls.push("first"), async () => (calls.push("lookup"), lookup()), async () => void calls.push("discard"));
    return calls;
  };
  assert.deepEqual(await run(server, 1, async () => null), ["first"]);
  assert.deepEqual(await run(unsent, 1, async () => null), ["first"]);
  assert.deepEqual(await run(sentThenFenced, 1, async () => null), []);
  // Attempt 2+: a rejection cannot disprove an earlier lost success.
  assert.deepEqual(await run(server, 2, async () => null), ["lookup", "discard"]);
  assert.deepEqual(await run(server, 3, async () => ({ receipt: 1 })), ["lookup"]);
  assert.deepEqual(await run(server, 2, async () => Promise.reject(new Error("offline"))), ["lookup"]);
  assert.deepEqual(await run(unsent, 2, async () => null), []);
  assert.deepEqual(await run(new Error("Network Error"), 2, async () => null), []);
  assert.equal(await discardUnapplied(async () => ({ r: 1 }), async () => assert.fail("applied")), false);
  assert.equal(await discardUnapplied(async () => null, async () => undefined), true);
});
test("in-memory intents are freed only by the first failure", () => {
  const server = () => Object.assign(new Error("server"), { response: { status: 422 } });
  const a = {}, b = {};
  assert.equal(freeIntent(a, server()), true);
  assert.equal(freeIntent(b, new Error("Network Error")), false);
  assert.equal(freeIntent(b, server()), false, "a later rejection cannot disprove an earlier lost success");
  assert.equal(freeIntent(b, sessionChanged(true)), false);
  assert.equal(freeIntent(null, server()), false);
});
