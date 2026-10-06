import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyAiResult, type AiResultBasis } from "./result";
import type {
  TeamAiResultContent,
  TeamAiResultSummary,
  TeamAiRoughcutResultDocument,
  TeamAiResultDocument,
} from "../api/generated/b2b";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const scope = {
    origin: "http://localhost:3338",
    userId: id(1),
    workspaceId: id(2),
    projectId: id(3),
  };
  const inputs = [0, 1].map((n) => ({
    ordinal: n,
    versionId: id(10 + n),
    assetId: id(20 + n),
    name: `source ${n}.mov`,
    sha256: String(n + 1).repeat(64),
    size: 100 + n,
    durationMs: 4000 + n * 1000,
    units: 2,
  }));
  const basis = {
    scope,
    job: {
      id: id(4),
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      quoteId: id(5),
      operation: "agent",
      maximumUnits: 5,
      confirmedUnits: 3,
    },
    quote: {
      id: id(5),
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      jobId: id(4),
      operation: "agent",
      catalogVersion: "original-v1",
      instructionSha256: "a".repeat(64),
      maximumUnits: 5,
      inputs,
      roughcut: {
        model: "original-model",
        maxClips: 4,
        maxTimelineDurationMs: 7000,
      },
    },
  } as AiResultBasis;
  const document: TeamAiRoughcutResultDocument = {
    format: "prepix.team-ai.roughcut/v1",
    operation: "agent",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    jobId: id(4),
    quoteId: id(5),
    catalogVersion: "original-v1",
    instructionSha256: "a".repeat(64),
    complete: true,
    inputs: inputs.map((i) => ({
      ordinal: i.ordinal,
      inputVersionId: i.versionId,
      inputSha256: i.sha256,
      size: i.size,
      durationMs: i.durationMs,
    })),
    plan: {
      kind: "roughcut",
      provider: "gemini",
      model: "original-model",
      summary: "두 번째 영상으로 시작하고 첫 장면을 반복합니다.",
      clips: [
        {
          inputVersionId: inputs[1].versionId,
          inputSha256: inputs[1].sha256,
          startMs: 2500,
          endMs: 5000,
        },
        {
          inputVersionId: inputs[0].versionId,
          inputSha256: inputs[0].sha256,
          startMs: 0,
          endMs: 1000,
        },
        {
          inputVersionId: inputs[0].versionId,
          inputSha256: inputs[0].sha256,
          startMs: 0,
          endMs: 1000,
        },
      ],
    },
  };
  return { basis, document };
}
function content(
  document: unknown,
  patch: Partial<TeamAiResultSummary> = {},
  raw?: Buffer,
) {
  const bytes = raw ?? Buffer.from(JSON.stringify(document));
  const result = {
    id: id(30),
    jobId: id(4),
    format: "prepix.team-ai.roughcut/v1",
    mediaType: "application/json",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    complete: true,
    completedStages: 1,
    totalStages: 1,
    units: 3,
    createdAt: "2026-10-06T00:00:00Z",
    ...patch,
  } as TeamAiResultSummary;
  return {
    result,
    contentBase64: bytes.toString("base64"),
  } as TeamAiResultContent;
}
test("roughcut preserves exact ordered and repeated source cuts using original quote limits", () => {
  const { basis, document } = fixture(),
    c = content(document),
    value = verifyAiResult(c, c.result, basis);
  assert.deepEqual(value.document, document);
  assert.deepEqual(
    (value.document as TeamAiRoughcutResultDocument).plan.clips.map(
      (i) => i.inputVersionId,
    ),
    [id(11), id(10), id(10)],
  );
  assert.equal(Buffer.from(value.bytes).toString(), JSON.stringify(document));
  assert.throws(
    () => verifyAiResult(c, c.result),
    /FORMAT_INVALID/,
    "roughcut must never use the legacy two-argument bypass",
  );
});
test("roughcut rejects transplanted identity, instruction, catalogue, model and input manifest", () => {
  const mutations: ((d: TeamAiRoughcutResultDocument) => void)[] = [
    (d) => {
      d.workspaceId = id(99);
    },
    (d) => {
      d.projectId = id(99);
    },
    (d) => {
      d.jobId = id(99);
    },
    (d) => {
      d.quoteId = id(99);
    },
    (d) => {
      d.catalogVersion = "current-v2";
    },
    (d) => {
      d.instructionSha256 = "b".repeat(64);
    },
    (d) => {
      d.plan.model = "current-model";
    },
    (d) => {
      d.inputs[0].size++;
    },
    (d) => {
      d.inputs[0].durationMs++;
    },
    (d) => {
      d.inputs.reverse();
    },
    (d) => {
      d.inputs.pop();
    },
    (d) => {
      d.inputs[0].inputSha256 = "b".repeat(64);
    },
    (d) => {
      d.plan.clips[0].inputVersionId = id(99);
    },
    (d) => {
      d.plan.clips[0].inputSha256 = "b".repeat(64);
    },
    (d) => {
      d.complete = false as true;
    },
    (d) => {
      (d.plan.clips[0] as unknown as Record<string, unknown>).path =
        "/tmp/arbitrary";
    },
  ];
  for (const mutate of mutations) {
    const { basis, document } = fixture();
    mutate(document);
    const c = content(document);
    assert.throws(() => verifyAiResult(c, c.result, basis), /FORMAT_INVALID/);
  }
});
test("roughcut enforces exact integer milliseconds, input duration, clip count and total timeline", () => {
  const mutations: ((d: TeamAiRoughcutResultDocument) => void)[] = [
    (d) => {
      d.plan.clips[0].startMs = -1;
    },
    (d) => {
      d.plan.clips[0].startMs = 0.5;
    },
    (d) => {
      d.plan.clips[0].endMs = 5001;
    },
    (d) => {
      d.plan.clips[0].endMs = d.plan.clips[0].startMs;
    },
    (d) => {
      d.plan.clips = [];
    },
    (d) => {
      d.plan.clips = Array(5).fill(d.plan.clips[0]);
    },
    (d) => {
      d.plan.clips = Array(3).fill(d.plan.clips[0]);
    },
    (d) => {
      d.plan.summary = " ";
    },
    (d) => {
      d.plan.clips[0].endMs = Number.MAX_SAFE_INTEGER + 1;
    },
  ];
  for (const mutate of mutations) {
    const { basis, document } = fixture();
    mutate(document);
    const c = content(document);
    assert.throws(() => verifyAiResult(c, c.result, basis), /FORMAT_INVALID/);
  }
  const { basis, document } = fixture();
  basis.quote.roughcut = undefined;
  const c = content(document);
  assert.throws(() => verifyAiResult(c, c.result, basis), /FORMAT_INVALID/);
});
test("result bytes, canonical JSON and all returned summary fields are bound before decoding", () => {
  const { basis, document } = fixture(),
    c = content(document);
  const tampered = Buffer.from(c.contentBase64, "base64");
  tampered[50] ^= 1;
  assert.throws(
    () =>
      verifyAiResult(
        { ...c, contentBase64: tampered.toString("base64") },
        c.result,
        basis,
      ),
    /HASH_MISMATCH/,
  );
  for (const patch of [
    { jobId: id(99) },
    { units: 4 },
    { format: "prepix.team-ai.result/v1" as const },
    { completedStages: 2 },
    { totalStages: 2 },
    { complete: false },
    { mediaType: "text/plain" as const },
  ])
    assert.throws(
      () =>
        verifyAiResult(
          {
            ...c,
            result: { ...c.result, ...patch } as unknown as TeamAiResultSummary,
          },
          c.result,
          basis,
        ),
      /FORMAT_INVALID/,
    );
  for (const raw of [
    Buffer.from(JSON.stringify(document, null, 2)),
    Buffer.from([0xff, 0xfe]),
  ]) {
    const other = content(document, {}, raw);
    assert.throws(
      () => verifyAiResult(other, other.result, basis),
      /FORMAT_INVALID/,
    );
  }
  for (const mutate of [
    (b: AiResultBasis) => {
      b.scope.userId = id(99);
    },
    (b: AiResultBasis) => {
      b.job.quoteId = id(99);
    },
    (b: AiResultBasis) => {
      b.quote.jobId = id(99);
    },
    (b: AiResultBasis) => {
      b.job.maximumUnits = 2;
    },
  ]) {
    const f = fixture();
    mutate(f.basis);
    const other = content(f.document);
    assert.throws(
      () => verifyAiResult(other, other.result, f.basis),
      /FORMAT_INVALID/,
    );
  }
});
function analysis(operation: "transcript" | "vision", partial = false) {
  const { basis } = fixture();
  basis.job.operation = basis.quote.operation = operation;
  const output = (n: number) =>
    operation === "transcript"
      ? {
          kind: "transcript",
          provider: "assemblyai",
          language: "ko",
          durationMs: basis.quote.inputs[n].durationMs,
          fullText: "text",
          segments: [
            {
              start: 0,
              end: 1,
              text: "text",
              words: [{ start: 0.1, end: 0.5, text: "word" }],
            },
          ],
        }
      : {
          kind: "vision",
          provider: "gemini",
          model: "model",
          summary: "summary",
          segments: [{ start: 0, end: 1, description: "scene", tags: ["tag"] }],
        };
  const document = {
    format: "prepix.team-ai.result/v1",
    operation,
    catalogVersion: basis.quote.catalogVersion,
    complete: !partial,
    items: (partial ? [1] : [0, 1]).map((n) => ({
      ordinal: n,
      inputVersionId: basis.quote.inputs[n].versionId,
      inputSha256: basis.quote.inputs[n].sha256,
      output: output(n),
    })),
  } as TeamAiResultDocument;
  const c = content(document, {
    format: document.format,
    complete: !partial,
    completedStages: document.items.length,
    totalStages: 2,
  });
  return { basis, document, c };
}
test("existing multi-input transcript and vision preserve complete and noncontiguous partial results", () => {
  for (const operation of ["transcript", "vision"] as const)
    for (const partial of [false, true]) {
      const { basis, document, c } = analysis(operation, partial);
      assert.deepEqual(verifyAiResult(c, c.result, basis).document, document);
    }
});
test("analysis rejects wrong source identity and segments outside their exact measured duration", () => {
  for (const operation of ["transcript", "vision"] as const) {
    for (const mutate of [
      (d: TeamAiResultDocument) => {
        d.items.reverse();
      },
      (d: TeamAiResultDocument) => {
        d.items[0].inputVersionId = id(99);
      },
      (d: TeamAiResultDocument) => {
        d.items[0].output.segments[0].end = 100;
      },
      (d: TeamAiResultDocument) => {
        d.items[0].ordinal = 1;
      },
    ]) {
      const { basis, document } = analysis(operation);
      mutate(document);
      const c = content(document, {
        format: document.format,
        completedStages: 2,
        totalStages: 2,
      });
      assert.throws(() => verifyAiResult(c, c.result, basis), /FORMAT_INVALID/);
    }
  }
  const { basis, document } = analysis("transcript");
  const output = document.items[0].output;
  if (output.kind === "transcript") output.segments[0].words![0].start = -1;
  const c = content(document, {
    format: document.format,
    completedStages: 2,
    totalStages: 2,
  });
  assert.throws(() => verifyAiResult(c, c.result, basis), /FORMAT_INVALID/);
});
