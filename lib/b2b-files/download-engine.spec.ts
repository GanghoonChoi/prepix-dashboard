import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  DOWNLOAD_BLOCK,
  downloadUrl,
  receiveVerifiedFile,
  type DownloadStage,
} from "./download-engine";
import {
  downloadKey,
  downloadName,
  validDownload,
  type DownloadRecord,
} from "./download-store";
const identity = (content: Uint8Array) => ({
  size: content.length,
  sha256: createHash("sha256").update(content).digest("hex"),
});
class Stage implements DownloadStage {
  content = new Uint8Array();
  flushes = 0;
  size() {
    return this.content.length;
  }
  read(at: number, length: number) {
    return this.content.slice(at, at + length);
  }
  write(at: number, bytes: Uint8Array) {
    const next = new Uint8Array(Math.max(this.size(), at + bytes.length));
    next.set(this.content);
    next.set(bytes, at);
    this.content = next;
  }
  truncate(size: number) {
    this.content = this.content.slice(0, size);
  }
  flush() {
    this.flushes++;
  }
}
function fixture(content = new TextEncoder().encode("immutable original")) {
  const stage = new Stage(),
    expected = identity(content),
    ranges: string[] = [];
  let tickets = 0;
  const ticket = async () => {
    tickets++;
    return {
      ...expected,
      url: "https://storage.example.test/object",
      expiresIn: 60,
    };
  };
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.referrerPolicy, "no-referrer");
    const headers = new Headers(init?.headers);
    assert.deepEqual([...headers.keys()], ["range"]);
    const range = headers.get("range")!;
    ranges.push(range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
    const at = Number(match[1]),
      end = Number(match[2]);
    return new Response(content.slice(at, end + 1), {
      status: 206,
      headers: {
        "content-range": `bytes ${at}-${end}/${content.length}`,
        "content-length": String(end - at + 1),
      },
    });
  };
  return {
    content,
    stage,
    expected,
    ranges,
    ticket,
    fetcher,
    tickets: () => tickets,
    options: {
      identity: expected,
      stage,
      ticket,
      fetcher,
      signal: new AbortController().signal,
      development: false,
      progress: () => {},
    },
  };
}
test("bounded ranges reauthorize each block and verify the entire original", async () => {
  const f = fixture(new Uint8Array(DOWNLOAD_BLOCK + 37).fill(19));
  await receiveVerifiedFile(f.options);
  assert.deepEqual(f.ranges, [
    `bytes=0-${DOWNLOAD_BLOCK - 1}`,
    `bytes=${DOWNLOAD_BLOCK}-${DOWNLOAD_BLOCK + 36}`,
  ]);
  assert.equal(f.tickets(), 2);
  assert.deepEqual(f.stage.content, f.content);
  assert.ok(f.stage.flushes >= 2);
});
test("resume hashes the staged prefix and only requests the remaining bytes", async () => {
  const f = fixture();
  f.stage.write(0, f.content.slice(0, 5));
  const progress: Array<[string, number]> = [];
  await receiveVerifiedFile({
    ...f.options,
    progress: (phase, bytes) => progress.push([phase, bytes]),
  });
  assert.deepEqual(f.ranges, [`bytes=5-${f.content.length - 1}`]);
  assert.ok(progress.some(([p, n]) => p === "checking" && n === 5));
  assert.deepEqual(f.stage.content, f.content);
});
test("an already complete staged file is hashed again without network receipt", async () => {
  const f = fixture();
  f.stage.write(0, f.content);
  await receiveVerifiedFile(f.options);
  assert.equal(f.tickets(), 0);
  assert.equal(f.ranges.length, 0);
});
test("corrupted staged prefix or received content is never accepted and is cleared", async () => {
  const f = fixture();
  f.stage.write(0, new Uint8Array(3));
  await assert.rejects(receiveVerifiedFile(f.options), /DOWNLOAD_INTEGRITY/);
  assert.equal(f.stage.size(), 0);
  const g = fixture();
  g.options.fetcher = async () =>
    new Response(new Uint8Array(g.content.length), {
      status: 206,
      headers: {
        "content-range": `bytes 0-${g.content.length - 1}/${g.content.length}`,
        "content-length": String(g.content.length),
      },
    });
  await assert.rejects(receiveVerifiedFile(g.options), /DOWNLOAD_INTEGRITY/);
  assert.equal(g.stage.size(), 0);
});
test("invalid status, byte ranges, length and encoding fail before writing", async () => {
  for (const variation of [
    { status: 200 },
    { range: "bytes 1-17/18" },
    { length: "19" },
    { encoding: "gzip" },
  ]) {
    const f = fixture();
    f.options.fetcher = async () =>
      new Response(f.content, {
        status: variation.status ?? 206,
        headers: {
          "content-range":
            variation.range ??
            `bytes 0-${f.content.length - 1}/${f.content.length}`,
          "content-length": variation.length ?? String(f.content.length),
          ...(variation.encoding
            ? { "content-encoding": variation.encoding }
            : {}),
        },
      });
    await assert.rejects(
      receiveVerifiedFile(f.options),
      /DOWNLOAD_RANGE_INVALID/,
    );
    assert.equal(f.stage.size(), 0);
  }
});
test("interruption preserves the received prefix for a new engine invocation", async () => {
  const f = fixture();
  f.options.fetcher = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(f.content.slice(0, 5));
          controller.close();
        },
      }),
      {
        status: 206,
        headers: {
          "content-range": `bytes 0-${f.content.length - 1}/${f.content.length}`,
          "content-length": String(f.content.length),
        },
      },
    );
  await assert.rejects(receiveVerifiedFile(f.options), /DOWNLOAD_INTERRUPTED/);
  assert.equal(f.stage.size(), 5);
  await receiveVerifiedFile({ ...f.options, fetcher: f.fetcher });
  assert.deepEqual(f.ranges, [`bytes=5-${f.content.length - 1}`]);
  assert.deepEqual(f.stage.content, f.content);
});
test("pause stops further ranges while preserving the flushed bytes", async () => {
  const f = fixture(),
    controller = new AbortController();
  await assert.rejects(
    receiveVerifiedFile({
      ...f.options,
      signal: controller.signal,
      progress: (phase, bytes) => {
        if (phase === "receiving" && bytes > 0) controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.deepEqual(f.stage.content, f.content);
  assert.ok(f.stage.flushes > 0);
});
test("reauthorization denial and changed identity issue no storage fetch", async () => {
  const f = fixture();
  let fetched = 0;
  await assert.rejects(
    receiveVerifiedFile({
      ...f.options,
      ticket: async () => {
        throw new Error("access revoked");
      },
      fetcher: async () => {
        fetched++;
        throw new Error("unexpected");
      },
    }),
    /access revoked/,
  );
  assert.equal(fetched, 0);
  await assert.rejects(
    receiveVerifiedFile({
      ...f.options,
      ticket: async () => ({ ...(await f.ticket()), sha256: "0".repeat(64) }),
      fetcher: async () => {
        fetched++;
        throw new Error("unexpected");
      },
    }),
    /DOWNLOAD_INVALID/,
  );
  assert.equal(fetched, 0);
});
test("untrusted or credential-bearing storage URLs are rejected", () => {
  const expected = identity(new Uint8Array([1]));
  for (const url of [
    "http://storage.example.test/file",
    "https://token@storage.example.test/file",
    "file:///tmp/file",
    "javascript:alert(1)",
  ])
    assert.throws(
      () => downloadUrl({ ...expected, url, expiresIn: 60 }, expected, true),
      /DOWNLOAD_INVALID/,
    );
  assert.equal(
    downloadUrl(
      { ...expected, url: "http://127.0.0.1:3900/file", expiresIn: 60 },
      expected,
      true,
    ),
    "http://127.0.0.1:3900/file",
  );
});
test("durable receipt identities and private stage names are scoped to account, team, project and service", () => {
  const r: DownloadRecord = {
    schema: 1,
    scope: {
      origin: "https://api.example.test",
      userId: randomUUID(),
      workspaceId: randomUUID(),
      projectId: randomUUID(),
    },
    versionId: randomUUID(),
    ...identity(new Uint8Array([1])),
  };
  assert.equal(validDownload(r, r.scope), true);
  assert.match(downloadName(r), /^[a-f0-9]{64}$/);
  for (const key of ["userId", "workspaceId", "projectId", "origin"] as const) {
    const next = { ...r, scope: { ...r.scope, [key]: randomUUID() } };
    assert.notEqual(downloadKey(r), downloadKey(next));
    assert.notEqual(downloadName(r), downloadName(next));
    assert.equal(validDownload(r, next.scope), false);
  }
  assert.equal(validDownload({ ...r, size: 0 }, r.scope), false);
});
