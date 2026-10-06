"use client";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  assertExistingAiScope,
  checkExistingAi,
} from "@/lib/b2b-home/existing-ai";
import type { AiResultDocument, AiResultBasis } from "@/lib/b2b-ai/result";
import { homeEnvironment } from "@/lib/b2b-home/home";
import { apiClient } from "@/lib/api/client";
import type {
  TeamAiCapabilities,
  TeamAiExecution,
  TeamAiOperation,
  TeamAiQuote,
  TeamFileVersion,
} from "@/lib/api/services/b2b.service";
import {
  aiApi,
  assertAiScope,
  checkExecution,
  checkQuote,
  notReached,
  rejected,
  runStore,
  verifyResultContent,
  type AiQuoteInput,
  type AiRunRecord,
  type AiScope,
} from "@/lib/b2b-ai/run";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";

const messages: Record<string, [string, string]> = {
  B2B_AI_CATALOG_NOT_CONFIGURED: [
    "AI 작업 설정이 확정되지 않아 실행할 수 없습니다.",
    "AI job settings are not configured, so jobs cannot run.",
  ],
  B2B_AI_OPERATION_NOT_CONFIGURED: [
    "이 작업 종류는 현재 설정되지 않아 실행할 수 없습니다.",
    "This job type is not configured.",
  ],
  B2B_AI_OPERATION_UNSUPPORTED: [
    "이 서비스에서 해당 AI 작업을 지원하지 않습니다.",
    "This AI operation is not supported by the service.",
  ],
  B2B_AI_INPUT_STREAM_MISSING: [
    "선택한 입력에 이 작업에 필요한 음성 또는 영상이 없습니다.",
    "A selected input lacks the audio or video this job needs.",
  ],
  B2B_AI_INPUT_LIMIT_EXCEEDED: [
    "입력 크기나 길이가 이 작업의 한도를 넘습니다.",
    "An input exceeds this job's size or duration limit.",
  ],
  B2B_AI_INPUT_INVALID: [
    "입력 버전을 다시 선택해 주세요.",
    "Select the input versions again.",
  ],
  B2B_AI_LANGUAGE_UNSUPPORTED: [
    "지원하지 않는 언어입니다.",
    "This language is not supported.",
  ],
  B2B_AI_INSTRUCTION_INVALID: [
    "작업 지시를 입력해 주세요. 제어 문자는 쓸 수 없습니다.",
    "Enter an instruction without control characters.",
  ],
  B2B_AI_QUOTE_EXPIRED: [
    "견적이 만료되었습니다. 새 견적을 받아 주세요.",
    "The quote expired. Request a new quote.",
  ],
  B2B_AI_QUOTE_STALE: [
    "견적 뒤에 입력, 권한 또는 참여가 바뀌었습니다. 새 견적을 받아 주세요.",
    "Inputs, permissions or participation changed after the quote. Request a new quote.",
  ],
  B2B_AI_CATALOG_CHANGED: [
    "가격 설정이 바뀌었습니다. 새 견적을 받아 주세요.",
    "Pricing changed. Request a new quote.",
  ],
  B2B_AI_MAXIMUM_NOT_APPROVED: [
    "견적의 최대량을 그대로 승인해야 실행할 수 있습니다.",
    "Approve the quote's exact maximum to run.",
  ],
  B2B_AI_PERSONAL_LIMIT_EXCEEDED: [
    "내 이번 기간 한도가 부족합니다. 팀 관리자에게 한도 조정을 요청하세요.",
    "Your period limit is insufficient. Ask a team admin to adjust it.",
  ],
  B2B_AI_TEAM_BALANCE_EXCEEDED: [
    "팀 공동 AI 잔량이 부족합니다. 결제 권한자에게 추가 구매를 요청하세요.",
    "The shared team balance is insufficient. Ask a billing manager to purchase more.",
  ],
  B2B_EDITING_LICENCE_REQUIRED: [
    "이 팀의 편집 이용권이 있어야 팀 AI를 실행할 수 있습니다.",
    "An editing licence in this team is required to run team AI.",
  ],
  B2B_AI_PROJECT_CLOSED: [
    "진행 중인 프로젝트에서만 AI를 실행할 수 있습니다.",
    "AI runs only in an active project.",
  ],
  B2B_AI_RESULT_ACCESS_ENDED: [
    "현재 권한으로는 이 결과를 받을 수 없습니다. 참여나 입력 자료 접근이 바뀌었습니다.",
    "Your current access no longer covers this result.",
  ],
  B2B_AI_ACCESS_ENDED: [
    "현재 권한으로는 이 견적이나 작업을 볼 수 없습니다. 참여나 입력 자료 접근이 바뀌었습니다.",
    "Your current access no longer covers this quote or job.",
  ],
  B2B_AI_INPUT_CONTAINER_UNSUPPORTED: [
    "이 영상 형식은 영상 분석에 쓸 수 없습니다.",
    "This video format cannot be used for video analysis.",
  ],
  B2B_AI_RESULT_HASH_MISMATCH: [
    "받은 결과의 해시가 서버 기록과 달라 표시하지 않았습니다.",
    "The received result did not match its recorded hash and was not shown.",
  ],
  B2B_AI_RESULT_FORMAT_INVALID: [
    "받은 결과의 형식을 확인할 수 없어 표시하지 않았습니다.",
    "The received result format could not be verified.",
  ],
  B2B_AI_RESULT_UNAVAILABLE: [
    "결과 파일을 지금 읽을 수 없습니다. 잠시 뒤 다시 받아 주세요.",
    "The result file is temporarily unavailable.",
  ],
  B2B_AI_RUN_STORAGE_UNAVAILABLE: [
    "브라우저 저장소를 쓸 수 없어 요청 기록을 남길 수 없습니다. 요청을 보내지 않았습니다.",
    "Browser storage is unavailable, so no request was sent.",
  ],
  B2B_AI_RUN_RECORD_INVALID: [
    "저장된 AI 작업 기록을 읽을 수 없습니다.",
    "The saved AI run record is unreadable.",
  ],
  B2B_AI_RESPONSE_SCOPE_MISMATCH: [
    "다른 계정, 팀 또는 요청의 응답이라 반영하지 않았습니다.",
    "A response for another account, team or request was ignored.",
  ],
  B2B_FILE_ACCOUNT_CHANGED: [
    "로그인한 계정이 바뀌었습니다. 이 작업은 원래 계정으로 다시 로그인하면 이어서 확인할 수 있습니다.",
    "The signed-in account changed. Sign in with the original account to continue this run.",
  ],
  B2B_FILE_SERVICE_CHANGED: [
    "연결된 서비스가 바뀌어 이 작업을 이어갈 수 없습니다.",
    "The connected service changed; this run cannot continue here.",
  ],
};
const code = (error: unknown) => {
  const m = (error as { response?: { data?: { message?: unknown } } })?.response
    ?.data?.message;
  if (typeof m === "string") return m;
  if (error instanceof Error && /^B2B_[A-Z_]+$/.test(error.message))
    return error.message;
  return "REQUEST_FAILED";
};
function AiError({ code: c, retry }: { code: string; retry?: () => void }) {
  const copy = useCopy();
  if (!messages[c]) return <B2bError code={c} retry={retry} />;
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{copy(...messages[c])}</p>
      {retry && (
        <button
          type="button"
          className={`${secondaryClass} mt-3`}
          onClick={retry}
        >
          {copy("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}
const operations: Record<TeamAiOperation, [string, string]> = {
  transcript: ["음성 전사", "Transcription"],
  vision: ["영상 분석", "Video analysis"],
  agent: ["러프컷 구성", "Build a rough cut"],
};
const states: Record<TeamAiExecution["job"]["state"], [string, string]> = {
  queued: ["접수됨 · 대기", "Queued"],
  running: ["처리 중", "Running"],
  cancel_requested: ["취소 처리 중", "Cancellation pending"],
  completed: ["완료", "Completed"],
  failed: ["실패 · 예약 전부 반환", "Failed · reservation returned"],
  cancelled: ["취소 완료", "Cancelled"],
  timed_out: ["시간 초과 · 예약 전부 반환", "Timed out · reservation returned"],
};
const instant = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const clock = (s: number) =>
  new Date(Math.round(s * 1000)).toISOString().slice(11, 22);

export function ProjectAiRun({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<TeamLoading />}>
      <AiRunEntry projectId={projectId} />
    </Suspense>
  );
}
function AiRunEntry({ projectId }: { projectId: string }) {
  const search = useSearchParams(),
    jobId = search.get("jobId");
  const context = useWorkspace();
  if (!context?.b2b?.enrolled || !context.data.currentUserId)
    return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  const scope: AiScope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    userId: context.data.currentUserId,
    workspaceId: context.data.workspace.id,
    projectId,
  };
  if (jobId !== null) {
    if (!context.b2b.allowedActions.projects)
      return <B2bError code="B2B_AI_ACCESS_ENDED" />;
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        jobId,
      )
    )
      return <B2bError code="B2B_AI_RESPONSE_SCOPE_MISMATCH" />;
    return (
      <ExistingAiRun
        key={JSON.stringify([scope, jobId])}
        scope={scope}
        jobId={jobId}
      />
    );
  }
  // A new account, service, team or project is a separate run and record.
  return <ScopedAiRun key={JSON.stringify(scope)} scope={scope} />;
}

// An exact home link reads its already accepted job without constructing a new
// quote/submit intent or overwriting another saved project run.
function ExistingAiRun({ scope, jobId }: { scope: AiScope; jobId: string }) {
  const c = useCopy(),
    context = useWorkspace()!;
  const lifetime = useRef<AbortController | null>(null),
    serial = useRef(0);
  const [view, setView] = useState<TeamAiExecution | null>(null),
    [error, setError] = useState("");
  const assertCurrent = useCallback(() => {
    if (!lifetime.current) throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
    assertExistingAiScope(
      scope,
      jobId,
      homeEnvironment(new URL(apiClient.defaults.baseURL!).origin),
      window.location.search,
      lifetime.current.signal,
    );
  }, [scope, jobId]);
  const [baseApi] = useState(() => aiApi(scope));
  const readExecution = useCallback(async () => {
    assertCurrent();
    const next = await baseApi.execution(jobId, lifetime.current!.signal);
    assertCurrent();
    return checkExistingAi(next, scope, jobId);
  }, [assertCurrent, baseApi, jobId, scope]);
  const poll = useCallback(async () => {
    const ticket = ++serial.current;
    try {
      const next = await readExecution();
      if (ticket !== serial.current) return;
      setView(next);
      setError("");
    } catch (e) {
      if (lifetime.current?.signal.aborted || ticket !== serial.current) return;
      setView(null);
      setError(code(e));
    }
  }, [readExecution]);
  const guarded = useCallback(
    async <T,>(send: () => Promise<T>) => {
      assertCurrent();
      try {
        const result = await send();
        assertCurrent();
        return result;
      } catch (e) {
        assertCurrent();
        throw e;
      }
    },
    [assertCurrent],
  );
  const api = {
    ...baseApi,
    result: async (id: string) => {
      const current = await readExecution();
      if (current.result?.id !== id)
        throw new Error("B2B_AI_RESULT_ACCESS_ENDED");
      return guarded(() => baseApi.result(id, lifetime.current!.signal));
    },
    content: (id: string, sha: string) =>
      guarded(() => baseApi.content(id, sha, lifetime.current!.signal)),
  };
  useLayoutEffect(() => {
    const controller = new AbortController(),
      counter = serial;
    lifetime.current = controller;
    return () => {
      controller.abort();
      counter.current++;
    };
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void poll(), 0),
      timer = window.setInterval(() => void poll(), 2000);
    window.addEventListener("focus", poll);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [poll]);
  return (
    <TeamShell
      title={c("접수된 AI 작업", "Accepted AI job")}
      description={c(
        "이미 접수된 작업의 현재 상태와 결과를 확인합니다.",
        "Review the current status and result of an already accepted job.",
      )}
    >
      <SpaceBadge workspace={context.data.workspace} />
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/dashboard/workspaces/${scope.workspaceId}`}
          className={secondaryClass}
        >
          {c("팀 홈", "Team home")}
        </Link>
        <Link
          href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/ai`}
          className={secondaryClass}
        >
          {c("프로젝트 AI 화면", "Project AI screen")}
        </Link>
      </div>
      {error ? (
        <AiError code={error} retry={() => void poll()} />
      ) : view ? (
        <JobView
          key={view.job.id}
          api={api}
          view={view}
          cancelKey={undefined}
          saveCancelKey={() => {}}
          pollError=""
          onPoll={poll}
          onNew={() => {}}
          scope={scope}
          existingOnly
          assertCurrent={assertCurrent}
          beforeSave={async () => {
            if (!view.result) throw new Error("B2B_AI_RESULT_ACCESS_ENDED");
            const meta = (await api.result(view.result.id)).result;
            if (meta.sha256 !== view.result.sha256)
              throw new Error("B2B_AI_RESULT_HASH_MISMATCH");
            assertCurrent();
          }}
        />
      ) : (
        <TeamLoading />
      )}
    </TeamShell>
  );
}

function ScopedAiRun({ scope }: { scope: AiScope }) {
  const c = useCopy();
  const { data } = useWorkspace()!;
  const lifetime = useRef<AbortController | null>(null);
  const owned = () => {
    if (!lifetime.current) throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
    lifetime.current.signal.throwIfAborted();
    assertAiScope(scope);
  };
  const [api] = useState(() =>
    aiApi(scope, owned, () => lifetime.current!.signal),
  );
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const [record, setRecord] = useState<AiRunRecord | null | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<TeamAiQuote | null>(null);
  const [execution, setExecution] = useState<TeamAiExecution | null>(null);
  const [pollError, setPollError] = useState("");
  const persist = (next: AiRunRecord | null) => {
    owned();
    if (next) runStore.write(next);
    else runStore.clear(scope);
    setRecord(next);
  };

  const acceptQuote = (r: AiRunRecord, q: TeamAiQuote) => {
    const checked = checkQuote(q, r);
    persist({ ...r, quote: { ...r.quote, id: checked.id } });
    setQuote(checked);
  };
  const acceptExecution = (r: AiRunRecord, view: TeamAiExecution) => {
    const checked = checkExecution(view, r);
    if (r.submit && r.submit.jobId !== checked.job.id)
      persist({ ...r, submit: { ...r.submit, jobId: checked.job.id } });
    setExecution(checked);
  };
  const sendQuote = async (r: AiRunRecord) => {
    setBusy(true);
    setError("");
    try {
      const receipt = await api.quote({ requestKey: r.quote.requestKey, ...r.quote.input });
      acceptQuote(r, receipt.quote);
    } catch (e) {
      setError(code(e));
      // A processed rejection created nothing; anything else may have landed.
      if (rejected(e) && !notReached(e)) persist(null);
    } finally {
      setBusy(false);
    }
  };
  const recoverQuote = async (r: AiRunRecord) => {
    setBusy(true);
    try {
      acceptQuote(r, (await api.quoteByRequest(r.quote.requestKey)).quote);
      setError("");
    } catch (e) {
      if (notReached(e)) {
        setBusy(false);
        return sendQuote(r);
      }
      setError(code(e));
    } finally {
      setBusy(false);
    }
  };
  // Reopen at the quote step: the stored quote id is only read, never re-requested.
  const loadQuote = async (r: AiRunRecord) => {
    setBusy(true);
    try {
      acceptQuote(r, (await api.getQuote(r.quote.id!)).quote);
      setError("");
    } catch (e) {
      setError(code(e));
    } finally {
      setBusy(false);
    }
  };
  const sendSubmit = async (r: AiRunRecord) => {
    setBusy(true);
    setError("");
    try {
      acceptExecution(
        r,
        await api.submit({
          requestKey: r.submit!.requestKey,
          quoteId: r.quote.id!,
          approvedMaximumUnits: r.submit!.approvedMaximumUnits,
        }),
      );
    } catch (e) {
      setError(code(e));
      // Never drop a key whose job may exist: ask the server with the original key.
      try {
        acceptExecution(r, await api.submissionByRequest(r.submit!.requestKey));
        setError("");
      } catch (lookup) {
        if (notReached(lookup) && rejected(e)) persist({ ...r, submit: undefined });
      }
    } finally {
      setBusy(false);
    }
  };
  const recoverSubmit = async (r: AiRunRecord) => {
    setBusy(true);
    try {
      acceptExecution(r, await api.submissionByRequest(r.submit!.requestKey));
      setError("");
    } catch (e) {
      if (notReached(e)) {
        setBusy(false);
        return sendSubmit(r);
      }
      setError(code(e));
    } finally {
      setBusy(false);
    }
  };

  // Resume exactly where the stored record stopped.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    let stored: AiRunRecord | null = null;
    try {
      stored = runStore.read(scope);
    } catch (e) {
      setError(code(e));
    }
    setRecord(stored);
    if (!stored) return;
    if (!stored.quote.id) void recoverQuote(stored);
    else if (stored.submit && !stored.submit.jobId) void recoverSubmit(stored);
    else if (!stored.submit) void loadQuote(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jobId = record?.submit?.jobId;
  const finished = execution?.progress.phase === "finished";
  const poll = useCallback(async () => {
    if (!record?.submit?.jobId) return;
    try {
      acceptExecution(record, await api.execution(record.submit.jobId));
      setPollError("");
    } catch (e) {
      // A failed check is not "done" or "empty": keep the last state labelled.
      setPollError(code(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, jobId]);
  useEffect(() => {
    if (!jobId || finished) return;
    const first = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), 2000);
    const focus = () => void poll();
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [jobId, finished, poll]);

  if (record === undefined) return <TeamLoading />;
  return (
    <TeamShell
      title={c("AI 작업", "AI job")}
      description={c(
        "이 프로젝트에 등록된 입력 버전으로 견적을 받고, 승인한 최대량 안에서 실행합니다. 결과는 자동으로 게시하거나 덮어쓰지 않습니다.",
        "Quote with this project's registered input versions and run within the approved maximum. Results are never published or applied automatically.",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={data.workspace} />
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}`}
        >
          {c("프로젝트", "Project")}
        </Link>
        <Link className={secondaryClass} href={`/dashboard/workspaces/${scope.workspaceId}/ai`}>
          {c("팀 AI 사용량", "Team AI usage")}
        </Link>
      </div>
      {error && <AiError code={error} />}
      {!record ? (
        <Draft
          api={api}
          busy={busy}
          onQuote={async (input) => {
            const next: AiRunRecord = {
              schema: 1,
              scope,
              quote: { requestKey: crypto.randomUUID(), input },
            };
            try {
              persist(next);
            } catch (e) {
              return setError(code(e));
            }
            await sendQuote(next);
          }}
        />
      ) : !record.quote.id ? (
        <Pending
          label={c("견적 요청 결과를 확인하지 못했습니다.", "The quote request outcome is unknown.")}
          busy={busy}
          onCheck={() => void recoverQuote(record)}
          onDiscard={() => {
            // A quote reserves nothing: abandoning an unknown quote request is safe.
            persist(null);
            setError("");
          }}
        />
      ) : !record.submit ? (
        quote ? (
          <QuoteView
            quote={quote}
            busy={busy}
            onSubmit={async () => {
              const next: AiRunRecord = {
                ...record,
                submit: {
                  requestKey: crypto.randomUUID(),
                  approvedMaximumUnits: quote.maximumUnits,
                },
              };
              try {
                persist(next);
              } catch (e) {
                return setError(code(e));
              }
              await sendSubmit(next);
            }}
            onRefresh={async () => {
              try {
                acceptQuote(record, (await api.getQuote(record.quote.id!)).quote);
                setError("");
              } catch (e) {
                setError(code(e));
              }
            }}
            onDiscard={() => {
              persist(null);
              setQuote(null);
            }}
          />
        ) : error ? (
          // The quote could not be read. Nothing was submitted (no submit key is
          // stored) and a quote costs nothing, so the record may always be dropped.
          <Pending
            label={c(
              "저장된 견적을 불러오지 못했습니다. 다시 확인하거나, 실행한 적 없는 이 기록을 지우고 새 견적을 받을 수 있습니다.",
              "The saved quote could not be loaded. Check again, or discard this record (nothing was run) and request a new quote.",
            )}
            busy={busy}
            onCheck={() => void loadQuote(record)}
            onDiscard={() => {
              persist(null);
              setQuote(null);
              setError("");
            }}
          />
        ) : (
          <TeamLoading />
        )
      ) : !record.submit.jobId ? (
        <Pending
          label={c(
            "실행 요청 결과를 확인하지 못했습니다. 같은 요청 번호로만 다시 확인하거나 보냅니다.",
            "The run request outcome is unknown. Only the same request key is checked or resent.",
          )}
          busy={busy}
          onCheck={() => void recoverSubmit(record)}
        />
      ) : execution ? (
        <JobView
          scope={scope}
          api={api}
          view={execution}
          cancelKey={record.submit.cancelKey}
          saveCancelKey={(key) => {
            const current = runStore.read(scope);
            if (current?.submit)
              persist({ ...current, submit: { ...current.submit, cancelKey: key ?? undefined } });
          }}
          pollError={pollError}
          onPoll={poll}
          onNew={() => {
            persist(null);
            setQuote(null);
            setExecution(null);
          }}
        />
      ) : pollError ? (
        <AiError code={pollError} retry={() => void poll()} />
      ) : (
        <TeamLoading />
      )}
    </TeamShell>
  );
}

function Pending({
  label,
  busy,
  onCheck,
  onDiscard,
}: {
  label: string;
  busy: boolean;
  onCheck: () => void;
  onDiscard?: () => void;
}) {
  const c = useCopy();
  return (
    <Block title={c("요청 확인 필요", "Request needs checking")} description={label}>
      <div className="flex flex-wrap gap-2">
        <button className={primaryClass} disabled={busy} onClick={onCheck}>
          {c("같은 요청 확인", "Check the same request")}
        </button>
        {onDiscard && (
          <button className={secondaryClass} disabled={busy} onClick={onDiscard}>
            {c("기록 지우기", "Discard record")}
          </button>
        )}
      </div>
    </Block>
  );
}

function Draft({
  api,
  busy,
  onQuote,
}: {
  api: ReturnType<typeof aiApi>;
  busy: boolean;
  onQuote: (input: AiQuoteInput) => Promise<void>;
}) {
  const c = useCopy();
  const [caps, setCaps] = useState<TeamAiCapabilities | null>(null);
  const [versions, setVersions] = useState<TeamFileVersion[] | null>(null);
  // More pages exist while this is set; an empty list is only "none" without it.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreFailure, setMoreFailure] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState("");
  const [operation, setOperation] = useState<TeamAiOperation>("transcript");
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [language, setLanguage] = useState("");
  const load = useCallback(async () => {
    try {
      const [capabilities, list] = await Promise.all([
        api.capabilities(),
        api.versions(),
      ]);
      setCaps(capabilities);
      setVersions(list.versions);
      setNextCursor(list.nextCursor);
      setFailure("");
    } catch (e) {
      // Failure is not an empty file list.
      setVersions(null);
      setFailure(code(e));
    }
  }, [api]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreFailure("");
    try {
      const page = await api.versions(nextCursor);
      // Append without duplicates; a failed page keeps what is already listed.
      setVersions((current) => [
        ...(current ?? []),
        ...page.versions.filter(
          (v) => !(current ?? []).some((x) => x.id === v.id),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setMoreFailure(code(e));
    } finally {
      setLoadingMore(false);
    }
  };
  if (failure) return <AiError code={failure} retry={() => void load()} />;
  if (!caps || !versions) return <TeamLoading />;
  const capability = caps.operations.find((o) => o.operation === operation)!;
  const usable = versions.filter(
    (v) =>
      v.allowedActions.ai &&
      v.metadata.durationMs !== null &&
      (capability.requiredStream === "video"
        ? v.metadata.video
        : v.metadata.audio
      ).length > 0,
  );
  const chosen = usable.filter((v) => selected.includes(v.id));
  const combinedBytes = chosen.reduce((sum, v) => sum + v.size, 0);
  const combinedDuration = chosen.reduce(
    (sum, v) =>
      sum +
      ((capability.requiredStream === "audio" &&
        v.metadata.audio[0]?.durationMs) ||
        v.metadata.durationMs!),
    0,
  );
  const exceeds =
    chosen.some(
      (v) =>
        v.size > capability.maxInputBytes ||
        ((capability.requiredStream === "audio" &&
          v.metadata.audio[0]?.durationMs) ||
          v.metadata.durationMs!) > capability.maxDurationMs,
    ) ||
    (capability.maxTotalInputBytes !== undefined &&
      combinedBytes > capability.maxTotalInputBytes) ||
    (capability.maxTotalDurationMs !== undefined &&
      combinedDuration > capability.maxTotalDurationMs);
  const lang = language || capability.languages[0] || "";
  return (
    <Block
      title={c("작업 준비", "Prepare a job")}
      description={c(
        "서버에 등록되고 이 프로젝트에 연결된 정확한 버전만 입력으로 쓸 수 있습니다. 앱의 로컬 원본은 먼저 등록해야 합니다.",
        "Only exact versions registered on the server and linked to this project can be inputs. Register local originals from the app first.",
      )}
    >
      {caps.blockedReason && <AiError code={caps.blockedReason} />}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {c("작업 종류", "Job type")}
        </legend>
        <div className="flex flex-wrap gap-4">
          {caps.operations.map((o) => (
            <label
              key={o.operation}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="operation"
                value={o.operation}
                checked={operation === o.operation}
                disabled={!o.available}
                onChange={() => {
                  setOperation(o.operation);
                  setSelected([]);
                  setLanguage("");
                }}
              />
              {c(...operations[o.operation])}
              {!o.available && (
                <span className="text-xs text-muted">
                  ({c("사용 불가", "unavailable")})
                </span>
              )}
            </label>
          ))}
        </div>
        {!capability.available && capability.blockedReason && (
          <AiError code={capability.blockedReason} />
        )}
      </fieldset>
      {capability.available && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {c("입력 버전", "Input versions")}{" "}
              <span className="text-xs text-muted">
                ({c("최대", "up to")} {capability.maxInputs})
              </span>
            </legend>
            {usable.length === 0 ? (
              <p className="text-sm text-muted">
                {nextCursor
                  ? c(
                      "지금까지 불러온 버전 중에는 이 작업에 쓸 수 있는 것이 없습니다. 더 불러와 확인하세요.",
                      "None of the versions loaded so far is usable for this job. Load more to check.",
                    )
                  : c(
                      "이 작업에 쓸 수 있는 등록 버전이 없습니다. 자료 화면에서 등록 상태와 AI 입력 허용을 확인하세요.",
                      "No registered version is usable for this job. Check registration and AI permission in Files.",
                    )}
              </p>
            ) : (
              <ul className="space-y-2">
                {usable.map((v) => (
                  <li key={v.id}>
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(v.id)}
                        disabled={
                          !selected.includes(v.id) &&
                          selected.length >= capability.maxInputs
                        }
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, v.id]
                              : selected.filter((id) => id !== v.id),
                          )
                        }
                      />
                      <span className="font-medium">{v.name}</span>
                      <span className="tabular-nums text-muted">
                        v{v.ordinal} ·{" "}
                        {seconds(
                          (capability.requiredStream === "audio" &&
                            v.metadata.audio[0]?.durationMs) ||
                            v.metadata.durationMs!,
                        )}{" "}
                        · sha256 {v.sha256.slice(0, 12)}…
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {nextCursor && (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  {c(
                    "이 프로젝트에 버전이 더 있습니다. 목록은 일부만 불러왔습니다.",
                    "This project has more versions; only part of the list is loaded.",
                  )}
                </p>
                {moreFailure && (
                  <AiError code={moreFailure} retry={() => void loadMore()} />
                )}
                <button
                  className={secondaryClass}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {c("버전 더 불러오기", "Load more versions")}
                </button>
              </div>
            )}
            {versions.length > usable.length && (
              <p className="text-xs text-muted">
                {c(
                  `AI 입력 허용이 없거나 필요한 스트림이 없는 버전 ${versions.length - usable.length}개는 제외했습니다.`,
                  `${versions.length - usable.length} versions without AI permission or the needed stream are excluded.`,
                )}
              </p>
            )}
          </fieldset>
          {operation === "agent" && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm leading-6">
              <p>
                {c(
                  "선택한 영상을 함께 분석해 컷 순서와 원본 범위를 담은 러프컷 편집안을 만듭니다. 받은 편집안은 앱에서 검토하고 적용할 수 있습니다.",
                  "Analyze the selected videos together to build an ordered rough cut with exact source ranges. Review and apply the received edit plan in the app.",
                )}
              </p>
              <p className="tabular-nums text-xs text-muted">
                {c("선택 길이", "Selected duration")}:{" "}
                {seconds(combinedDuration)}
                {capability.maxTotalDurationMs !== undefined
                  ? ` / ${seconds(capability.maxTotalDurationMs)}`
                  : ""}{" "}
                · {c("선택 크기", "Selected bytes")}:{" "}
                {combinedBytes.toLocaleString()}
                {capability.maxTotalInputBytes !== undefined
                  ? ` / ${capability.maxTotalInputBytes.toLocaleString()}`
                  : ""}{" "}
                bytes
              </p>
              {capability.maxClips !== undefined &&
                capability.maxTimelineDurationMs !== undefined && (
                  <p className="text-xs tabular-nums text-muted">
                    {c("편집안 최대", "Edit plan maximum")}:{" "}
                    {capability.maxClips} {c("컷", "cuts")} ·{" "}
                    {seconds(capability.maxTimelineDurationMs)}
                  </p>
                )}
            </div>
          )}
          {exceeds && <AiError code="B2B_AI_INPUT_LIMIT_EXCEEDED" />}
          {capability.languages.length > 0 && (
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{c("언어", "Language")}</span>
              <select
                className={inputClass}
                value={lang}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {capability.languages.map((l) => (
                  <option key={l} value={l}>
                    {l === "auto" ? c("자동 감지", "Detect") : l}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{c("작업 지시", "Instruction")}</span>
            <textarea
              className={`${inputClass} min-h-28`}
              maxLength={caps.instructionMaxLength}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <span className="text-xs text-muted tabular-nums">
              {instruction.length} / {caps.instructionMaxLength}
            </span>
          </label>
          <p className="text-xs leading-5 text-muted">
            {c(
              `단위: ${capability.unitSeconds}초마다 ${capability.unitsPerBlock}단위, 입력당 최소 ${capability.minimumUnits}단위(올림). 견적에서 정확한 예상량과 최대량을 확인합니다.`,
              `Units: ${capability.unitsPerBlock} per ${capability.unitSeconds}s, minimum ${capability.minimumUnits} per input (rounded up). The quote shows the exact estimate and maximum.`,
            )}
          </p>
          <button
            className={primaryClass}
            disabled={
              busy || !selected.length || !instruction.trim() || exceeds
            }
            onClick={() =>
              void onQuote({
                operation,
                inputVersionIds: selected,
                instruction: instruction.trim(),
                ...(capability.languages.length ? { language: lang } : {}),
              })
            }
          >
            {c("견적 받기", "Get a quote")}
          </button>
        </>
      )}
    </Block>
  );
}

function QuoteView({
  quote,
  busy,
  onSubmit,
  onRefresh,
  onDiscard,
}: {
  quote: TeamAiQuote;
  busy: boolean;
  onSubmit: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onDiscard: () => void;
}) {
  const c = useCopy();
  const [agree, setAgree] = useState(false);
  const a = quote.availability;
  const unit = a.unitLabel ?? c("단위", "units");
  return (
    <Block
      title={c("견적", "Quote")}
      description={c(
        `${c(...operations[quote.operation])} · 만료 ${instant(quote.expiresAt)} · 설정 ${quote.catalogVersion}`,
        `${c(...operations[quote.operation])} · expires ${instant(quote.expiresAt)} · settings ${quote.catalogVersion}`,
      )}
      actions={
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          {c("최신 상태 확인", "Refresh")}
        </button>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="py-1 font-normal">
              {c("입력 버전", "Input version")}
            </th>
            <th className="py-1 font-normal">{c("길이", "Length")}</th>
            <th className="py-1 text-right font-normal">
              {c("완료 단계 사용량", "Stage units")}
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {quote.inputs.map((i) => (
            <tr key={i.versionId} className="border-t border-border">
              <td className="min-w-0 break-words py-2">
                {i.name}
                <span className="block text-xs text-muted">
                  sha256 {i.sha256.slice(0, 16)}…
                </span>
              </td>
              <td className="py-2">{seconds(i.durationMs)}</td>
              <td className="py-2 text-right">{i.units}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {quote.operation === "agent" && quote.roughcut && (
        <p className="rounded-lg border border-border p-3 text-sm leading-6 tabular-nums">
          {c("이 견적의 러프컷 제한", "This quote’s rough cut limits")}:{" "}
          {quote.roughcut!.maxClips} {c("컷", "cuts")} ·{" "}
          {seconds(quote.roughcut!.maxTimelineDurationMs)}
          <span className="block text-xs text-muted">
            {c(
              "결과는 이 견적에 고정된 설정과 입력 버전을 기준으로 확인합니다.",
              "Results are checked against the settings and input versions fixed in this quote.",
            )}
          </span>
        </p>
      )}
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{c("예상 사용량", "Estimate")}</dt>
          <dd className="text-xl font-medium tabular-nums">
            {quote.estimatedUnits} {unit}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("최대 차감량 (예약)", "Maximum (reserved)")}
          </dt>
          <dd className="text-xl font-medium tabular-nums">
            {quote.maximumUnits} {unit}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("팀 공동 사용 가능량", "Shared team balance")}
          </dt>
          <dd className="tabular-nums">
            {a.reconciled && a.teamAvailableUnits !== null
              ? a.teamAvailableUnits
              : c("확인 필요", "Needs review")}
          </dd>
          <dd className="text-xs text-muted">
            {c(
              "팀 전체가 함께 쓰는 잔액입니다.",
              "The balance the whole team shares.",
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("내 이번 기간 잔여 한도", "My remaining period limit")}
          </dt>
          <dd className="tabular-nums">
            {a.personalRemainingUnits ??
              c("없음 또는 확인 필요", "None or needs review")}
          </dd>
          <dd className="text-xs text-muted">
            {c(
              "팀 잔액을 쓸 수 있는 내 상한이며 별도로 지급된 양이 아닙니다.",
              "A cap on how much of the team balance you may use, not a separate grant.",
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-muted">
        {c(
          "실행하면 최대량을 예약합니다. 결과가 확인된 완료 단계의 측정량만 정산하고 남은 예약은 반환합니다. 서비스 실패는 전부 반환하고, 취소하면 이미 완료된 단계만 정산합니다.",
          "Running reserves the maximum. Only verified completed stages settle; the rest returns. Service failures return everything; cancelling settles only completed stages.",
        )}
      </p>
      {a.blockedReason && <AiError code={a.blockedReason} />}
      {quote.jobId ? (
        <p role="status" className="text-sm">
          {c("이미 실행한 견적입니다.", "This quote was already run.")}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            {c(
              `최대 ${quote.maximumUnits} ${unit} 예약에 동의합니다.`,
              `I approve reserving up to ${quote.maximumUnits} ${unit}.`,
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={busy || !agree || !a.submittable}
              onClick={() => void onSubmit()}
            >
              {c("실행", "Run")}
            </button>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={onDiscard}
            >
              {c("견적 버리기", "Discard quote")}
            </button>
          </div>
        </>
      )}
    </Block>
  );
}

function JobView({
  api,
  view,
  cancelKey,
  saveCancelKey,
  pollError,
  onPoll,
  onNew,
  scope,
  existingOnly = false,
  assertCurrent,
  beforeSave,
}: {
  api: ReturnType<typeof aiApi>;
  view: TeamAiExecution;
  cancelKey: string | undefined;
  saveCancelKey: (key: string | null) => void;
  pollError: string;
  onPoll: () => Promise<void>;
  onNew: () => void;
  scope: AiScope;
  existingOnly?: boolean;
  assertCurrent?: () => void;
  beforeSave?: () => Promise<void>;
}) {
  const c = useCopy();
  const { job, progress, result } = view;
  const [confirm, setConfirm] = useState(false);
  // A stored cancel key means the earlier cancel request's outcome is unknown.
  const [cancelUnknown, setCancelUnknown] = useState(!!cancelKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState<{
    sha256: string;
    document: AiResultDocument;
    bytes: Uint8Array;
  } | null>(null);
  const cancel = async () => {
    setBusy(true);
    let key = cancelKey;
    try {
      if (!key) {
        // Written before the request, like every other key: a refresh resumes it.
        key = crypto.randomUUID();
        saveCancelKey(key);
      }
    } catch (e) {
      setError(code(e));
      setBusy(false);
      return;
    }
    try {
      await api.cancel(job.id, key);
      saveCancelKey(null);
      setCancelUnknown(false);
      setConfirm(false);
      await onPoll();
    } catch (e) {
      setError(code(e));
      setCancelUnknown(!rejected(e));
      if (rejected(e)) saveCancelKey(null);
    } finally {
      setBusy(false);
    }
  };
  const resultLifetime = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController();
    resultLifetime.current = controller;
    return () => controller.abort();
  }, []);
  const resultApi = aiApi(
    scope,
    () => {
      resultLifetime.current?.signal.throwIfAborted();
      assertCurrent?.();
    },
    () => resultLifetime.current!.signal,
  );
  const [receivedBasis, setReceivedBasis] = useState<AiResultBasis | null>(
    null,
  );
  const receive = async () => {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const fresh = await resultApi.execution(job.id);
      const checked = checkExistingAi(fresh, scope, job.id);
      if (
        checked.result?.id !== result.id ||
        checked.result.sha256 !== result.sha256
      )
        throw new Error("B2B_AI_RESULT_ACCESS_ENDED");
      const currentQuote = (await resultApi.getQuote(job.quoteId)).quote;
      const basis: AiResultBasis = {
        scope,
        job: checked.job,
        quote: currentQuote,
      };
      const meta = (await resultApi.result(result.id)).result;
      if (meta.sha256 !== result.sha256)
        throw new Error("B2B_AI_RESULT_HASH_MISMATCH");
      const received = verifyResultContent(
        await resultApi.content(result.id, result.sha256),
        meta,
        basis,
      );
      assertCurrent?.();
      setReceivedBasis(basis);
      setReceived(received);
    } catch (e) {
      setReceived(null);
      setError(code(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!received) return;
    try {
      setBusy(true);
      if (beforeSave) await beforeSave();
      const fresh = await resultApi.execution(job.id);
      checkExistingAi(fresh, scope, job.id);
      if (
        !receivedBasis ||
        fresh.result?.sha256 !== received.sha256 ||
        fresh.result.id !== result?.id
      )
        throw new Error("B2B_AI_RESULT_ACCESS_ENDED");
      const meta = (await resultApi.result(fresh.result.id)).result;
      if (meta.sha256 !== received.sha256)
        throw new Error("B2B_AI_RESULT_HASH_MISMATCH");
      resultLifetime.current?.signal.throwIfAborted();
      assertCurrent?.();
      const url = URL.createObjectURL(
        new Blob([received.bytes.slice().buffer as ArrayBuffer], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `prepix-ai-result-${received.sha256.slice(0, 12)}.json`;
      assertCurrent?.();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setReceived(null);
      setError(code(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block
      title={c("작업 진행", "Job progress")}
      description={`${c(...operations[job.operation])} · ${c("접수", "Accepted")} ${instant(job.acceptedAt)} · ${c("처리 종료 시각", "Deadline")} ${instant(job.deadline)}`}
      actions={
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void onPoll()}
        >
          {c("최신 상태 확인", "Refresh")}
        </button>
      }
    >
      {pollError && (
        <div className="space-y-2">
          <AiError code={pollError} retry={() => void onPoll()} />
          <p className="text-xs text-muted">
            {c(
              "아래는 마지막으로 확인한 상태입니다.",
              "Below is the last confirmed state.",
            )}
          </p>
        </div>
      )}
      <p role="status" className="text-sm font-medium">
        {c(...states[job.state])}
        {progress.phase === "needs_confirmation" &&
          ` · ${c("공급자 처리 확인 필요 (다시 호출하지 않음)", "provider outcome needs confirmation (not re-sent)")}`}
      </p>
      <div
        role="progressbar"
        aria-label={c("완료 단계", "Completed stages")}
        aria-valuemin={0}
        aria-valuemax={progress.totalStages}
        aria-valuenow={progress.completedStages}
        className="h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full bg-accent transition-[width]"
          style={{
            width: `${progress.totalStages ? (100 * progress.completedStages) / progress.totalStages : 0}%`,
          }}
        />
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums">
        {[
          [
            c("완료 단계", "Stages"),
            `${progress.completedStages} / ${progress.totalStages}`,
          ],
          [c("승인 최대량", "Approved maximum"), job.maximumUnits],
          [c("예약 중", "Reserved"), job.reservedUnits],
          [c("사용 확정", "Confirmed"), job.confirmedUnits],
          [c("예약 반환", "Returned"), job.returnedUnits],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="inline text-muted">{label} </dt>
            <dd className="inline">{value}</dd>
          </div>
        ))}
      </dl>
      {error && <AiError code={error} />}
      {!existingOnly &&
      (["queued", "running", "cancel_requested"].includes(job.state) ||
        cancelUnknown) ? (
        job.state !== "cancel_requested" || cancelUnknown ? (
          <button
            className={secondaryClass}
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            {cancelUnknown
              ? c("취소 결과 확인", "Check cancellation")
              : c("작업 취소", "Cancel job")}
          </button>
        ) : null
      ) : null}
      {confirm && (
        <ConfirmDialog
          label={c("AI 작업 취소 확인", "Confirm AI job cancellation")}
          onClose={() => !busy && setConfirm(false)}
        >
          <p className="text-sm leading-6">
            {c(
              "대기 중이면 예약 전부를 반환합니다. 실행 중이면 이미 완료된 단계만 정산하고 나머지를 반환합니다.",
              "Queued jobs return everything. Running jobs settle only completed stages and return the rest.",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void cancel()}
            >
              {cancelUnknown
                ? c("같은 취소 다시 확인", "Check same cancellation")
                : c("취소 요청", "Request cancellation")}
            </button>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {c("닫기", "Close")}
            </button>
          </div>
        </ConfirmDialog>
      )}
      {progress.phase === "finished" && (
        <div className="space-y-3 border-t border-border pt-4">
          {result ? (
            <>
              <p className="text-sm">
                {result.complete
                  ? c("결과가 준비되었습니다.", "The result is ready.")
                  : c(
                      `취소 전에 완료된 ${result.completedStages}/${result.totalStages} 단계의 부분 결과입니다.`,
                      `Partial result of ${result.completedStages}/${result.totalStages} stages completed before cancellation.`,
                    )}{" "}
                <span className="text-xs text-muted">
                  {result.size} bytes · sha256 {result.sha256.slice(0, 16)}…
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={primaryClass}
                  disabled={busy}
                  onClick={() => void receive()}
                >
                  {c("결과 받기", "Receive result")}
                </button>
                {received && (
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {c("JSON 파일로 저장", "Save JSON file")}
                  </button>
                )}
              </div>
              {received && (
                <ResultPreview
                  sha256={received.sha256}
                  document={received.document}
                  quote={receivedBasis?.quote}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              {c(
                "제공할 결과가 없습니다. 고객 사용량은 확정되지 않았고 예약은 반환되었습니다.",
                "No result is available. No usage was confirmed and the reservation was returned.",
              )}
            </p>
          )}
          {!existingOnly && (
            <button className={secondaryClass} onClick={onNew}>
              {c("새 작업 준비", "Prepare a new job")}
            </button>
          )}
        </div>
      )}
    </Block>
  );
}

function ResultPreview({
  sha256,
  document,
  quote,
}: {
  sha256: string;
  document: AiResultDocument;
  quote?: TeamAiQuote;
}) {
  const c = useCopy();
  return (
    <div className="space-y-3">
      <p role="status" className="break-all text-xs text-muted">
        {c(
          "받은 바이트의 SHA-256 확인됨",
          "SHA-256 of received bytes verified",
        )}
        : {sha256}
      </p>
      {document.format === "prepix.team-ai.roughcut/v1" ? (
        <RoughcutPreview document={document} quote={quote} />
      ) : (
        document.items.map((item) => (
          <article
            key={item.ordinal}
            className="space-y-2 rounded-lg border border-border p-3 text-sm"
          >
            <p className="text-xs text-muted">
              {c("입력", "Input")} {item.ordinal + 1} · sha256{" "}
              {item.inputSha256.slice(0, 12)}…
            </p>
            {item.output.kind === "transcript" ? (
              <ol className="space-y-1">
                {item.output.segments.slice(0, 50).map((s, i) => (
                  <li key={i} className="tabular-nums">
                    <span className="text-muted">
                      {clock(s.start)}–{clock(s.end)}
                      {s.speaker ? ` [${s.speaker}]` : ""}
                    </span>{" "}
                    {s.text}
                  </li>
                ))}
              </ol>
            ) : (
              <>
                <p>{item.output.summary}</p>
                <ol className="space-y-1">
                  {item.output.segments.slice(0, 50).map((s, i) => (
                    <li key={i} className="tabular-nums">
                      <span className="text-muted">
                        {clock(s.start)}–{clock(s.end)}
                      </span>{" "}
                      {s.description}
                      {s.tags?.length ? (
                        <span className="text-xs text-muted">
                          {" "}
                          · {s.tags.join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function RoughcutPreview({
  document,
  quote,
}: {
  document: import("@/lib/api/generated/b2b").TeamAiRoughcutResultDocument;
  quote?: TeamAiQuote;
}) {
  const c = useCopy();
  const time = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  const duration = document.plan.clips.reduce(
    (n, clip) => n + clip.endMs - clip.startMs,
    0,
  );
  const placements = document.plan.clips.reduce<
    { start: number; end: number }[]
  >((rows, clip) => {
    const start = rows.at(-1)?.end ?? 0;
    return [...rows, { start, end: start + clip.endMs - clip.startMs }];
  }, []);
  return (
    <section
      className="space-y-4"
      aria-label={c("러프컷 편집안", "Rough cut edit plan")}
    >
      <div className="space-y-2">
        <h3 className="font-medium">
          {c("러프컷 편집안", "Rough cut edit plan")}
        </h3>
        <p className="text-pretty text-sm leading-6">{document.plan.summary}</p>
        <p className="text-xs leading-5 text-muted">
          {c(
            "등록된 입력 버전으로 구성한 편집안입니다. 앱에서 컷 순서와 범위를 확인한 뒤 적용하세요.",
            "This edit plan uses registered input versions. Review its ordered cuts and ranges in the app before applying it.",
          )}
        </p>
        <p className="text-sm tabular-nums">
          {document.plan.clips.length} {c("컷", "cuts")} ·{" "}
          {c("전체 길이", "Timeline duration")} {time(duration)}
        </p>
      </div>
      <ol className="divide-y divide-border rounded-lg border border-border">
        {document.plan.clips.map((clip, i) => {
          const { start, end } = placements[i];
          const source = quote?.inputs.find(
            (v) => v.versionId === clip.inputVersionId,
          );
          return (
            <li
              key={i}
              className="space-y-2 p-4 text-sm"
              aria-label={`${c("컷", "Cut")} ${i + 1}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 break-words font-medium tabular-nums">
                  {c("컷", "Cut")} {i + 1} ·{" "}
                  {source?.name ??
                    `${c("입력", "Input")} ${(document.inputs.find((v) => v.inputVersionId === clip.inputVersionId)?.ordinal ?? 0) + 1}`}
                </span>
                <span className="tabular-nums text-muted">
                  {c("길이", "Duration")} {time(clip.endMs - clip.startMs)}
                </span>
              </div>
              <p className="tabular-nums">
                {c("원본 범위", "Source range")}: {time(clip.startMs)} —{" "}
                {time(clip.endMs)}
              </p>
              <p className="tabular-nums text-muted">
                {c("편집안 위치", "Timeline position")}: {time(start)} —{" "}
                {time(end)}
              </p>
              <p className="break-all text-xs text-muted">
                {c("입력 버전", "Input version")}: {clip.inputVersionId} ·
                sha256 {clip.inputSha256.slice(0, 16)}…
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
