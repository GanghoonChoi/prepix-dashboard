"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import {
  b2bService,
  type ProjectPeople,
  type ProjectRequest,
  type ProjectRequestDetail,
  type ProjectRequestPerson,
  type ProjectRequestState,
  type ProjectRequestSubmission,
  type TeamFileVersion,
} from "@/lib/api/services/b2b.service";
import { RequestPending } from "./request-pending";
import {
  RequestReferencePicker,
  RequestReferenceFiles,
  ReferenceList,
} from "./request-references";
import type { ProjectRequestReferenceFile } from "@/lib/api/generated/b2b";
import {
  requestEvents,
  requestKey,
  type RequestScope,
} from "@/lib/b2b-requests/operations";
import {
  requestsService,
  requestScope,
} from "@/lib/api/services/b2b-requests.service";
import { fileApi } from "@/lib/b2b-files/api";
import { bytes } from "@/lib/workspaces/upload";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { cardClass, rowClass, tableClass, Tag, tdClass, thClass } from "@/components/ui";
import {
  BackLink,
  Block,
  Details,
  EmptyState,
  inputClass,
  KeyValues,
  Notice,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import {
  folderTabs,
  B2bError,
  accessEnded,
  errorCode,
  useCopy,
} from "./shared";

// SOT: prepix-backend backend/docs/b2b-requests.md
type Copy = [string, string];
const stateCopy: Record<ProjectRequestState, Copy> = {
  proposed: ["접수 대기", "Awaiting intake"],
  open: ["요청", "Requested"],
  submitted: ["확인 대기", "Awaiting confirmation"],
  confirmed: ["확인 완료", "Confirmed"],
  waived: ["면제", "Waived"],
  cancelled: ["취소", "Cancelled"],
  declined: ["반려", "Declined"],
};
const requestErrors: Record<string, Copy> = {
  B2B_REQUEST_NOT_FOUND: [
    "요청을 찾을 수 없거나 볼 수 있는 범위가 아닙니다.",
    "This request is unavailable to you.",
  ],
  B2B_REQUEST_REVISION_CHANGED: [
    "요청 기준이 바뀌었습니다. 바뀐 기준을 확인한 뒤 다시 제출해 주세요. 선택한 자료는 유지했습니다.",
    "The criteria changed. Review them and submit again; your selection is kept.",
  ],
  B2B_REQUEST_STATE_CONFLICT: [
    "요청 상태가 바뀌었습니다. 최신 상태를 확인해 주세요.",
    "The request changed. Review its current state.",
  ],
  B2B_REQUEST_CRITERIA_REQUIRED: [
    "필수 요청에는 확인 기준이 필요합니다.",
    "Required requests need confirmation criteria.",
  ],
  B2B_REQUEST_PERSON_INVALID: [
    "확인자는 현재 내부 참여자 중에서, 작업 담당은 현재 제작 참여자 중에서 지정해 주세요.",
    "Choose a current internal participant to confirm and a current producer to work on it.",
  ],
  B2B_REQUEST_REQUIRED_WAIVER_ONLY: [
    "필수 요청은 필수 해제 대신 사유를 남겨 면제해 주세요.",
    "Waive a required request with a reason instead of making it optional.",
  ],
  B2B_REQUEST_SUBMISSION_EMPTY: [
    "제출할 자료, 외부 전달 위치 또는 메모 중 하나를 입력해 주세요.",
    "Add a file, an external delivery or a note.",
  ],
  B2B_REQUEST_FILE_ACCESS_REQUIRED: [
    "열 수 없는 제출 자료가 있어 확인 완료할 수 없습니다. 자료 담당자에게 열람 허용을 요청하거나 보완을 요청해 주세요.",
    "You cannot open every submitted file. Ask the file steward for access or return the submission.",
  ],
  B2B_REQUEST_EXTERNAL_OPEN_REQUIRED: [
    "외부 전달은 받는 위치에서 실제로 열어 본 뒤 확인 완료할 수 있습니다.",
    "Open the external delivery before confirming it.",
  ],
  B2B_REQUEST_CONFIRMER_REQUIRED: [
    "지정된 내부 확인자만 판단할 수 있습니다.",
    "Only the designated internal confirmer can decide.",
  ],
  B2B_REQUEST_INPUT_INVALID: [
    "입력 내용을 확인해 주세요.",
    "Check the entered values.",
  ],
  B2B_REASON_REQUIRED: ["사유를 입력해 주세요.", "Enter a reason."],
  B2B_PROJECT_PRODUCER_REQUIRED: [
    "제작 참여자만 제출할 수 있습니다.",
    "Only producers can submit.",
  ],
};
function RequestError({ code, retry }: { code: string; retry?: () => void }) {
  const c = useCopy();
  const message = requestErrors[code];
  if (!message) return <B2bError code={code} retry={retry} />;
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{c(...message)}</p>
      {retry && (
        <button
          type="button"
          className={`${secondaryClass} mt-3`}
          onClick={retry}
        >
          {c("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}
const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });
// datetime-local values are Korea time; the server stores instants.
const toLocal = (iso: string | null) =>
  iso
    ? new Date(iso)
        .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
        .slice(0, 16)
        .replace(" ", "T")
    : "";
const fromLocal = (value: string) =>
  value ? new Date(`${value}:00+09:00`).toISOString() : null;

function useScope() {
  const context = useWorkspace()!;
  return {
    team: context.data.workspace.id,
    me: context.data.currentUserId ?? "",
    permitted: !!context.b2b?.enrolled && context.b2b.allowedActions.projects,
  };
}
function usePerson() {
  const c = useCopy();
  const { me } = useScope();
  return (p: ProjectRequestPerson | null) =>
    p
      ? `${p.name || c("이름 없음", "Unnamed")}${p.userId === me ? c(" (나)", " (you)") : ""}`
      : c("미지정", "Unassigned");
}
/** Keeps one request key per intent until the server answers definitively,
 * so a lost response is retried with the same key and never applied twice. */
function useMutation(projectId: string) {
  const { team, me } = useScope();
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expected = requestScope(team, projectId, me);
    let disposed = false;
    const confirmed = (event: Event) => {
      const scope = (event as CustomEvent<RequestScope>).detail;
      if (!scope || requestKey(scope) !== requestKey(expected)) return;
      void requestsService
        .pending(team, projectId, me)
        .then((records) => {
          if (disposed) return;
          setLocked(records.length > 0);
          if (!records.length) pending.current = null;
        })
        .catch(() => {
          if (!disposed) setLocked(true);
        });
    };
    window.addEventListener(requestEvents, confirmed);
    return () => {
      disposed = true;
      window.removeEventListener(requestEvents, confirmed);
    };
  }, [team, projectId, me]);
  const run = useCallback(
    async <T,>(
      input: object,
      call: (key: string) => Promise<T>,
    ): Promise<{ result: T | null; error: string }> => {
      const fingerprint = JSON.stringify(input);
      if (pending.current && pending.current.fingerprint !== fingerprint) {
        setError("B2B_REQUEST_KEY_CONFLICT");
        return { result: null, error: "B2B_REQUEST_KEY_CONFLICT" };
      }
      pending.current ??= { fingerprint, key: crypto.randomUUID() };
      setBusy(true);
      setLocked(true);
      setError("");
      try {
        const result = await call(pending.current.key);
        pending.current = null;
        setLocked(false);
        return { result, error: "" };
      } catch (e) {
        const code = errorCode(e);
        setError(code);
        const records = await requestsService
          .pending(team, projectId, me)
          .catch(() => [{}]);
        setLocked(!!records.length);
        if (!records.length) pending.current = null;
        return { result: null, error: code };
      } finally {
        setBusy(false);
      }
    },
    [team, projectId, me],
  );
  return { run, busy, locked, error };
}
/** A definitive 4xx (revoked access) clears cached content; a transient
 * failure keeps the screen so forms keep their pending request keys. */
function useLoader<T>(read: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const loaded = useRef(false),
    sequence = useRef(0),
    mounted = useRef(false);
  useEffect(() => {
    const serial = sequence;
    mounted.current = true;
    return () => {
      mounted.current = false;
      serial.current++;
    };
  }, [read]);
  const load = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const value = await read();
      if (!mounted.current || ticket !== sequence.current) return;
      setData(value);
      loaded.current = true;
      setError("");
    } catch (e) {
      if (!mounted.current || ticket !== sequence.current) return;
      if (!loaded.current || accessEnded(e)) {
        loaded.current = false;
        setData(null);
        setError(errorCode(e));
      }
    }
  }, [read]);
  useReload(load);
  return { data, error, load };
}
function useReload(load: () => Promise<void>) {
  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(requestEvents, refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      clearTimeout(start);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(requestEvents, refresh);
      clearInterval(timer);
    };
  }, [load]);
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

type Draft = {
  referenceVersionIds?: string[];
  title: string;
  body: string;
  criteria: string;
  format: string;
  required: boolean;
  confirmerId: string;
  assigneeId: string;
  due: string;
  shared: boolean;
};
const emptyDraft = (me: string): Draft => ({
  referenceVersionIds: [],
  title: "",
  body: "",
  criteria: "",
  format: "",
  required: false,
  confirmerId: me,
  assigneeId: "",
  due: "",
  shared: false,
});
function draftInput(d: Draft, lead: boolean) {
  return lead
    ? {
        ...(d.referenceVersionIds !== undefined
          ? { referenceVersionIds: d.referenceVersionIds }
          : {}),
        title: d.title.trim(),
        body: d.body.trim(),
        criteria: d.criteria.trim(),
        format: d.format.trim(),
        required: d.required,
        confirmerId: d.confirmerId || null,
        assigneeId: d.assigneeId || null,
        dueAt: fromLocal(d.due),
        shared: d.shared,
      }
    : {
        title: d.title.trim(),
        body: d.body.trim(),
        ...(d.referenceVersionIds !== undefined
          ? { referenceVersionIds: d.referenceVersionIds }
          : {}),
      };
}
function RequestFields({
  projectId,
  draft,
  set,
  lead,
  disabled,
  requiredLocked,
  references = [],
}: {
  projectId: string;
  draft: Draft;
  set: (d: Draft) => void;
  lead: boolean;
  disabled: boolean;
  requiredLocked?: boolean;
  references?: ProjectRequestReferenceFile[];
}) {
  const c = useCopy();
  const { team, me } = useScope();
  const scope = useMemo(
    () => requestScope(team, projectId, me),
    [team, projectId, me],
  );
  const [people, setPeople] = useState<ProjectPeople | null>(null);
  useEffect(() => {
    if (!lead) return;
    const timer = window.setTimeout(
      () =>
        void b2bService
          .people(team, projectId)
          .then(setPeople)
          .catch(() => setPeople({ people: [], canManage: false })),
      0,
    );
    return () => clearTimeout(timer);
  }, [lead, team, projectId]);
  const name = (p: ProjectPeople["people"][number]) => p.name || p.email;
  return (
    <div className="space-y-4">
      <label className="block space-y-2 text-sm">
        <span>{c("제목", "Title")}</span>
        <input
          className={inputClass}
          required
          maxLength={100}
          disabled={disabled}
          value={draft.title}
          onChange={(e) => set({ ...draft, title: e.target.value })}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>{c("내용", "Details")}</span>
        <textarea
          aria-label={c("내용", "Details")}
          className={`${inputClass} min-h-28`}
          required
          maxLength={5000}
          disabled={disabled}
          value={draft.body}
          onChange={(e) => set({ ...draft, body: e.target.value })}
        />
      </label>
      {lead && (
        <>
          <label className="block space-y-2 text-sm">
            <span>{c("확인 기준", "Confirmation criteria")}</span>
            <textarea
              aria-label={c("확인 기준", "Confirmation criteria")}
              className={inputClass}
              maxLength={2000}
              disabled={disabled}
              value={draft.criteria}
              onChange={(e) => set({ ...draft, criteria: e.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm">
              <span>{c("파일 형식", "File format")}</span>
              <input
                className={inputClass}
                maxLength={200}
                disabled={disabled}
                value={draft.format}
                onChange={(e) => set({ ...draft, format: e.target.value })}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{c("기한 (한국 시간)", "Due (Korea time)")}</span>
              <input
                type="datetime-local"
                className={inputClass}
                disabled={disabled}
                value={draft.due}
                onChange={(e) => set({ ...draft, due: e.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm">
              <span>{c("확인자", "Confirmer")}</span>
              <select
                aria-label={c("확인자", "Confirmer")}
                className={inputClass}
                disabled={disabled}
                value={draft.confirmerId}
                onChange={(e) => set({ ...draft, confirmerId: e.target.value })}
              >
                <option value="">{c("선택", "Select")}</option>
                {people?.people
                  .filter((p) => p.kind === "internal")
                  .map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {name(p)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm">
              <span>{c("작업 담당", "Assignee")}</span>
              <select
                aria-label={c("작업 담당", "Assignee")}
                className={inputClass}
                disabled={disabled}
                value={draft.assigneeId}
                onChange={(e) => set({ ...draft, assigneeId: e.target.value })}
              >
                <option value="">{c("미지정", "Unassigned")}</option>
                {people?.people
                  .filter((p) => p.role !== "reviewer")
                  .map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {name(p)}
                      {p.kind === "external" ? c(" · 외부", " · external") : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.required}
                disabled={disabled || requiredLocked}
                onChange={(e) => set({ ...draft, required: e.target.checked })}
              />
              {c("완료에 필수", "Required for completion")}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.shared}
                disabled={disabled}
                onChange={(e) => set({ ...draft, shared: e.target.checked })}
              />
              {c(
                "검토자와 외부 참여자 모두에게 공개",
                "Share with reviewers and external participants",
              )}
            </label>
          </div>
        </>
      )}
      <RequestReferencePicker
        scope={scope}
        value={draft.referenceVersionIds}
        onChange={(referenceVersionIds) =>
          set({ ...draft, referenceVersionIds })
        }
        existing={references}
        disabled={disabled}
      />
    </div>
  );
}
export function ProjectRequests({ projectId }: { projectId: string }) {
  const { team, me } = useScope();
  const origin = new URL(apiClient.defaults.baseURL!).origin;
  return (
    <ProjectRequestsInner
      key={`${origin}:${team}:${me}:${projectId}`}
      projectId={projectId}
    />
  );
}
function ProjectRequestsInner({ projectId }: { projectId: string }) {
  const c = useCopy();
  const person = usePerson();
  const router = useRouter();
  const { team, me, permitted } = useScope();
  const [tab, setTab] = useState<"all" | "mine" | "waiting" | "done">("all");
  const [cursor, setCursor] = useState<string>();
  const scope = useMemo(
    () => requestScope(team, projectId, me),
    [team, projectId, me],
  );
  const read = useCallback(async () => {
    const [project, list] = await Promise.all([
      b2bService.project(team, projectId),
      requestsService.list(team, projectId, me, {
        view: tab,
        ...(cursor ? { cursor } : {}),
      }),
    ]);
    return { project: project.project, list };
  }, [team, projectId, me, tab, cursor]);
  const { data, error, load } = useLoader(read);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(me));
  const mutation = useMutation(projectId);
  if (!permitted || !me) return <B2bError code="B2B_PROJECT_NOT_FOUND" />;
  if (error) return <RequestError code={error} retry={() => void load()} />;
  if (!data) return <TeamLoading />;
  const { project, list } = data;
  const lead = list.allowedActions.create;
  const base = `/dashboard/workspaces/${team}/projects/${projectId}`;
  const filtered = list.requests.filter((r) =>
    tab === "mine"
      ? (r.assignmentCurrent.assignee && r.assignee?.userId === me) ||
        (r.assignmentCurrent.confirmer && r.confirmer?.userId === me)
      : tab === "waiting"
        ? ["proposed", "submitted"].includes(r.state)
        : tab === "done"
          ? ["confirmed", "waived", "cancelled", "declined"].includes(r.state)
          : true,
  );
  const tabs: [typeof tab, Copy][] = [
    ["all", ["전체", "All"]],
    ["mine", ["내 담당", "Mine"]],
    ["waiting", ["확인 대기", "Waiting"]],
    ["done", ["완료", "Done"]],
  ];
  const canCreate = list.allowedActions.create || list.allowedActions.propose;
  return (
    <TeamShell
      title={c("요청사항", "Requests")}
      description={project.name}
      tabs={folderTabs(scope.workspaceId, project, c)}
      actions={
        canCreate && (
          <button
            type="button"
            className={primaryClass}
            onClick={() => setCreating(!creating)}
          >
            {lead ? c("요청 등록", "New request") : c("제안 등록", "Propose")}
          </button>
        )
      }
    >
      <RequestPending scope={scope} />
      {creating && canCreate && (
        <form
          className={`${cardClass} max-w-3xl space-y-5 p-5`}
          onSubmit={async (event) => {
            event.preventDefault();
            const input = draftInput(draft, lead);
            const { result } = await mutation.run(input, (requestKey) =>
              requestsService.create(team, projectId, me, {
                ...input,
                requestKey,
              }),
            );
            if (result) router.push(`${base}/requests/${result.request.id}`);
          }}
        >
          <div>
            <h2 className="text-[15px] font-medium">
              {lead
                ? c("새 요청", "New request")
                : c("새 제안", "New proposal")}
            </h2>
            {!lead && (
              <p className="mt-1 text-[13px] text-muted">
                {c(
                  "담당자가 접수하면 요청이 됩니다.",
                  "It becomes a request once the lead accepts it.",
                )}
              </p>
            )}
          </div>
          <RequestFields
            projectId={projectId}
            draft={draft}
            set={setDraft}
            lead={lead}
            disabled={mutation.busy || mutation.locked}
          />
          {mutation.error && <RequestError code={mutation.error} />}
          <button
            className={primaryClass}
            disabled={
              mutation.busy || !draft.title.trim() || !draft.body.trim()
            }
          >
            {mutation.busy
              ? c("저장 중…", "Saving…")
              : lead
                ? c("요청 저장", "Save request")
                : c("제안 보내기", "Send proposal")}
          </button>
        </form>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label={c("보기", "View")}
            className="inline-flex flex-wrap rounded-md border border-border p-0.5"
          >
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                className="rounded px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-foreground aria-pressed:bg-surface-secondary aria-pressed:font-medium aria-pressed:text-foreground"
                onClick={() => {
                  setTab(key);
                  setCursor(undefined);
                }}
              >
                {c(...label)}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-muted tabular-nums">
            {c(
              `필수 요청 ${list.required.total}건 중 ${list.required.satisfied}건 확인·면제`,
              `${list.required.satisfied} of ${list.required.total} required requests confirmed or waived`,
            )}
          </p>
        </div>
        {!filtered.length ? (
          <EmptyState
            title={c("표시할 요청이 없습니다.", "No requests to show.")}
            description={
              tab === "all" && !cursor
                ? c(
                    "시간에 걸린 의견은 영상 코멘트로, 확인이 필요한 결과물은 요청으로 남깁니다.",
                    "Leave time-based feedback as video comments; use requests for deliverables that need confirmation.",
                  )
                : undefined
            }
          />
        ) : (
          <table className={`${tableClass} table-fixed`}>
            <thead>
              <tr>
                <th className={thClass}>{c("제목", "Title")}</th>
                <th className={`${thClass} hidden w-[18%] sm:table-cell`}>{c("담당", "Assignee")}</th>
                <th className={`${thClass} hidden w-[22%] md:table-cell`}>{c("기한", "Due")}</th>
                <th className={`${thClass} w-[14%]`}>{c("상태", "State")}</th>
                <th className={`${thClass} w-10`}><span className="sr-only">{c("열기", "Open")}</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={rowClass}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a")) router.push(`${base}/requests/${r.id}`);
                  }}
                >
                  <td className={tdClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`${base}/requests/${r.id}`}
                        className="truncate font-medium outline-none focus-visible:underline"
                      >
                        {r.title}
                      </Link>
                      {r.required && <Tag>{c("필수", "Required")}</Tag>}
                      {((r.assignee && !r.assignmentCurrent.assignee) ||
                        (r.confirmer && !r.assignmentCurrent.confirmer)) && (
                        <Tag tone="danger">{c("업무 재지정 필요", "Duty reassignment needed")}</Tag>
                      )}
                    </div>
                    {r.evidenceMissing && (
                      <p className="mt-0.5 text-xs text-muted">
                        {c(
                          "제출 근거 사용 불가 · 완료 조건 미충족",
                          "Submission evidence unavailable · completion requirement unmet",
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-muted sm:hidden">
                      {r.state === "proposed" ? `${c("제안", "Proposed by")} ${person(r.createdBy)}` : person(r.assignee)}
                    </p>
                  </td>
                  <td className={`${tdClass} hidden truncate text-muted sm:table-cell`}>
                    {r.state === "proposed" ? `${c("제안", "Proposed by")} ${person(r.createdBy)}` : person(r.assignee)}
                  </td>
                  <td className={`${tdClass} hidden truncate text-muted md:table-cell`}>
                    {r.dueAt ? kst(r.dueAt) : c("기한 없음", "No due date")}
                  </td>
                  <td className={tdClass}>
                    <Badge>{c(...stateCopy[r.state])}</Badge>
                  </td>
                  <td className={`${tdClass} text-right text-muted`}>
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(cursor || list.nextCursor) && (
          <div className="flex flex-wrap gap-2">
            {cursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(undefined)}
              >
                {c("요청 처음으로", "First request page")}
              </button>
            )}
            {list.nextCursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(list.nextCursor!)}
              >
                {c("다음 요청", "More requests")}
              </button>
            )}
          </div>
        )}
      </div>
    </TeamShell>
  );
}

export function ProjectRequestView({
  projectId,
  requestId,
}: {
  projectId: string;
  requestId: string;
}) {
  const { team, me } = useScope();
  const origin = new URL(apiClient.defaults.baseURL!).origin;
  return (
    <ProjectRequestViewInner
      key={`${origin}:${team}:${me}:${projectId}:${requestId}`}
      projectId={projectId}
      requestId={requestId}
    />
  );
}
function ProjectRequestViewInner({
  projectId,
  requestId,
}: {
  projectId: string;
  requestId: string;
}) {
  const c = useCopy();
  const person = usePerson();
  const { team, me, permitted } = useScope();
  const read = useCallback(async () => {
    const [project, detail] = await Promise.all([
      b2bService.project(team, projectId),
      requestsService.detail(team, projectId, requestId, me),
    ]);
    return { project: project.project, detail };
  }, [team, projectId, requestId, me]);
  const scope = useMemo(
    () => requestScope(team, projectId, me),
    [team, projectId, me],
  );
  const { data, error, load } = useLoader(read);
  const [editing, setEditing] = useState(false);
  if (!permitted || !me) return <B2bError code="B2B_PROJECT_NOT_FOUND" />;
  if (error) return <RequestError code={error} retry={() => void load()} />;
  if (!data) return <TeamLoading />;
  const { project, detail } = data;
  const { request, revisions, submissions } = detail;
  const basis = revisions.find((r) => r.number === request.requestRevision)!;
  const latest = submissions.at(-1);
  const done = async () => {
    setEditing(false);
    await load();
  };
  const editable =
    request.allowedActions.update || request.allowedActions.accept;
  const reassign = c(" · 재지정 필요", " · reassignment needed");
  return (
    <>
      <div className="mb-3">
        <BackLink
          href={`/dashboard/workspaces/${team}/projects/${projectId}/requests`}
        >
          {c("요청 목록", "All requests")}
        </BackLink>
      </div>
      <TeamShell
        title={request.title}
        description={project.name}
        actions={
          editable && (
            <button
              type="button"
              className={secondaryClass}
              onClick={() => setEditing(!editing)}
            >
              {request.allowedActions.accept
                ? c("접수하기", "Accept proposal")
                : c("요청 변경", "Edit request")}
            </button>
          )
        }
      >
        <RequestPending scope={scope} />
        {request.evidenceMissing && (
          <Notice role="status">
            {c(
              "확인 이력은 보존되어 있지만 제출 버전을 이 폴더에서 쓸 수 없어 완료 근거가 되지 않습니다. 정확한 버전을 다시 연결하거나 요청을 다시 열어 주세요.",
              "The confirmation history is preserved, but the submitted version is unavailable in this folder, so it is not completion evidence. Relink the exact version or reopen the request.",
            )}
          </Notice>
        )}
        {request.resolution && (
          <Notice>
            <p>
              {c(...stateCopy[request.state])} · {person(request.resolution.by)}{" "}
              · {kst(request.resolution.at)}
            </p>
            <p>
              {c("사유", "Reason")}: {request.resolution.reason}
            </p>
          </Notice>
        )}
        {editing && editable ? (
          <RequestEditor
            projectId={projectId}
            key={`edit:${request.id}`}
            detail={detail}
            onDone={done}
          />
        ) : (
          <Block
            title={`${c("요청 내용", "Request")} · ${c(`요청 버전 ${basis.number}`, `Revision ${basis.number}`)}`}
          >
            <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6">
              {basis.body}
            </p>
            <KeyValues
              items={[
                [
                  c("상태", "Status"),
                  <span key="state" className="flex flex-wrap gap-2">
                    <Badge>{c(...stateCopy[request.state])}</Badge>
                    {request.required && (
                      <Badge>{c("완료에 필수", "Required")}</Badge>
                    )}
                  </span>,
                ],
                [
                  c("작업 담당", "Assignee"),
                  <>
                    {person(request.assignee)}
                    {request.assignee &&
                      !request.assignmentCurrent.assignee &&
                      reassign}
                  </>,
                ],
                [
                  c("확인자", "Confirmer"),
                  <>
                    {person(request.confirmer)}
                    {request.confirmer &&
                      !request.assignmentCurrent.confirmer &&
                      reassign}
                  </>,
                ],
                [
                  c("기한", "Due"),
                  request.dueAt ? kst(request.dueAt) : c("없음", "None"),
                ],
                [
                  c("확인 기준", "Criteria"),
                  <span key="criteria" className="whitespace-pre-wrap">
                    {basis.criteria || c("없음", "None")}
                  </span>,
                ],
                [
                  c("파일 형식", "Format"),
                  basis.format || c("지정 없음", "Any"),
                ],
                [
                  c("공개", "Audience"),
                  request.shared
                    ? c("참여자 전체", "All participants")
                    : c(
                        "내부 제작진과 지정된 사람",
                        "Internal crew and named people",
                      ),
                ],
                [c("등록", "Created by"), person(request.createdBy)],
                [
                  c("참고 자료", "References"),
                  <RequestReferenceFiles
                    key="references"
                    files={basis.references}
                    scope={scope}
                    invalidate={load}
                  />,
                ],
              ]}
            />
            <Details
              summary={c(
                `요청 변경 이력 ${revisions.length}건`,
                `${revisions.length} request revisions`,
              )}
            >
              <ol className="space-y-3">
                {[...revisions].reverse().map((r) => (
                  <li
                    key={r.number}
                    className="rounded-md border border-border p-3 text-foreground"
                  >
                    <p className="text-xs text-muted">
                      {c(`요청 버전 ${r.number}`, `Revision ${r.number}`)} ·{" "}
                      {person(r.createdBy)} · {kst(r.createdAt)}
                      {r.required ? ` · ${c("필수", "Required")}` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {r.body}
                    </p>
                    {!!r.references.length && (
                      <ReferenceList files={r.references} />
                    )}
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted">
                      {c("확인 기준", "Criteria")}:{" "}
                      {r.criteria || c("없음", "None")}
                      {" · "}
                      {c("형식", "Format")}: {r.format || c("지정 없음", "Any")}
                    </p>
                  </li>
                ))}
              </ol>
            </Details>
          </Block>
        )}
        {request.allowedActions.decide && latest && (
          <DecideForm
            projectId={projectId}
            key={latest.id}
            request={request}
            submission={latest}
            onDone={done}
          />
        )}
        {request.allowedActions.submit && (
          <SubmitForm
            projectId={projectId}
            key={`submit:${request.id}`}
            request={request}
            onDone={done}
          />
        )}
        <Block title={c("제출과 확인", "Submissions")}>
          {!submissions.length ? (
            <p className="text-[13px] text-muted">
              {c("아직 제출이 없습니다.", "Nothing submitted yet.")}
            </p>
          ) : (
            <ol className="divide-y divide-border border-y border-border">
              {[...submissions].reverse().map((s) => (
                <SubmissionItem
                  key={s.id}
                  submission={s}
                  current={request.requestRevision}
                  missingEvidence={
                    request.evidenceMissing &&
                    s.number === request.submissionCount
                  }
                />
              ))}
            </ol>
          )}
        </Block>
        {request.allowedActions.close && (
          <CloseForm
            projectId={projectId}
            key={`close:${request.id}`}
            request={request}
            onDone={done}
          />
        )}
        {request.allowedActions.reopen && (
          <CloseForm
            projectId={projectId}
            key={`reopen:${request.id}`}
            request={request}
            onDone={done}
            reopen
          />
        )}
      </TeamShell>
    </>
  );
}

function SubmissionItem({
  submission: s,
  current,
  missingEvidence,
}: {
  submission: ProjectRequestSubmission;
  current: number;
  missingEvidence: boolean;
}) {
  const c = useCopy();
  const person = usePerson();
  const decision = s.confirmation;
  return (
    <li className="space-y-1.5 py-3 text-sm">
      <p className="font-medium">
        {c(`제출 ${s.number}차`, `Submission ${s.number}`)} ·{" "}
        {c(`요청 버전 ${s.requestRevision}`, `revision ${s.requestRevision}`)}
        {s.requestRevision !== current &&
          ` · ${c("이전 기준", "earlier criteria")}`}
      </p>
      <p className="text-xs text-muted">
        {person(s.submittedBy)} · {kst(s.createdAt)}
      </p>
      {s.note && <p className="whitespace-pre-wrap break-words">{s.note}</p>}
      {!!s.files.length && (
        <ul className="space-y-1">
          {s.files.map((f) => (
            <li key={f.position} className="break-all">
              {f.access === "available"
                ? `${f.name} · ${c("버전", "Version")} ${f.ordinal} · ${bytes(f.size)}`
                : c("접근 제한된 자료", "Restricted file")}
            </li>
          ))}
        </ul>
      )}
      {s.external && (
        <p className="break-all">
          {c("외부 전달", "External delivery")}: {s.external.location} ·{" "}
          {s.external.files.join(", ")}
        </p>
      )}
      {decision && (
        <p className="rounded-md bg-surface-secondary px-3 py-2 text-[13px]">
          {decision.decision === "returned"
            ? c("보완 요청", "Returned")
            : decision.current
              ? c("확인 완료 · 현재 유효", "Confirmed · current")
              : missingEvidence
                ? c(
                    "이전 확인 · 현재 완료 근거로 사용되지 않음",
                    "Earlier confirmation · not current completion evidence",
                  )
                : c(
                    "이전 확인 · 기준 변경 또는 새 제출로 재확인 필요",
                    "Earlier confirmation · superseded",
                  )}
          {" · "}
          {person(decision.confirmer)} · {kst(decision.createdAt)}
          {decision.selfConfirmed &&
            ` · ${c("본인 제출을 본인이 확인", "Self-confirmed")}`}
          {decision.externalOpened &&
            ` · ${c("외부 전달 열기 확인", "External delivery opened")}`}
          {decision.note && (
            <>
              <br />
              {decision.note}
            </>
          )}
        </p>
      )}
    </li>
  );
}

function RequestEditor({
  projectId,
  detail,
  onDone,
}: {
  projectId: string;
  detail: ProjectRequestDetail;
  onDone: () => Promise<void>;
}) {
  const c = useCopy();
  const { team, me } = useScope();
  const { request, revisions } = detail;
  const basis = revisions.find((r) => r.number === request.requestRevision)!;
  const accept = request.allowedActions.accept;
  const [draft, setDraft] = useState<Draft>({
    referenceVersionIds: undefined,
    title: request.title,
    body: basis.body,
    criteria: basis.criteria,
    format: basis.format,
    required: request.required,
    confirmerId: request.confirmer?.userId ?? me,
    assigneeId: request.assignee?.userId ?? "",
    due: toLocal(request.dueAt),
    shared: request.shared,
  });
  // The draft is based on this revision; a concurrent change returns 409.
  const [revision] = useState(request.revision);
  const [reassignAssignee, setReassignAssignee] = useState(false);
  const [reassignConfirmer, setReassignConfirmer] = useState(false);
  const mutation = useMutation(projectId);
  const basisChanged =
    (draft.referenceVersionIds !== undefined &&
      JSON.stringify(draft.referenceVersionIds) !==
        JSON.stringify(
          basis.references.map((f) =>
            f.access === "available" ? f.versionId : null,
          ),
        )) ||
    draft.body.trim() !== basis.body ||
    draft.criteria.trim() !== basis.criteria ||
    draft.format.trim() !== basis.format ||
    draft.required !== basis.required;
  return (
    <Block
      title={
        accept
          ? c("제안 접수", "Accept proposal")
          : c("요청 편집", "Edit request")
      }
    >
      <form
        className="max-w-3xl space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const input = {
            ...draftInput(draft, true),
            revision,
            ...(reassignAssignee ? { reassignAssignee: true } : {}),
            ...(reassignConfirmer ? { reassignConfirmer: true } : {}),
          };
          const call = accept ? requestsService.accept : requestsService.update;
          const { result } = await mutation.run(input, (requestKey) =>
            call(team, projectId, me, request.id, { ...input, requestKey }),
          );
          if (result) await onDone();
        }}
      >
        <RequestFields
          projectId={projectId}
          draft={draft}
          set={setDraft}
          lead
          requiredLocked={request.required}
          references={basis.references}
          disabled={mutation.busy || mutation.locked}
        />
        {((request.assignee && !request.assignmentCurrent.assignee) ||
          (request.confirmer && !request.assignmentCurrent.confirmer)) && (
          <div className="space-y-1 rounded-md bg-surface-secondary px-3 py-2 text-sm">
            <p className="text-[13px]">
              {c(
                "참여가 끝난 사람의 지정은 재초대해도 복구되지 않습니다. 다른 사람을 고르거나 아래에서 다시 지정하세요.",
                "Reinviting someone does not restore their former duties. Pick someone else or reassign them below.",
              )}
            </p>
            {request.assignee &&
              !request.assignmentCurrent.assignee &&
              draft.assigneeId === request.assignee.userId && (
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reassignAssignee}
                    disabled={mutation.busy || mutation.locked}
                    onChange={(e) => setReassignAssignee(e.target.checked)}
                  />
                  {c(
                    "작업 담당을 현재 참여에 다시 지정",
                    "Reassign assignee to current participation",
                  )}
                </label>
              )}
            {request.confirmer &&
              !request.assignmentCurrent.confirmer &&
              draft.confirmerId === request.confirmer.userId && (
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reassignConfirmer}
                    disabled={mutation.busy || mutation.locked}
                    onChange={(e) => setReassignConfirmer(e.target.checked)}
                  />
                  {c(
                    "확인자를 현재 참여에 다시 지정",
                    "Reassign confirmer to current participation",
                  )}
                </label>
              )}
          </div>
        )}
        {basisChanged && ["submitted", "confirmed"].includes(request.state) && (
          <Notice role="status">
            {c(
              "저장하면 새 요청 버전이 만들어지고 다시 제출과 확인이 필요합니다.",
              "Saving creates a new revision; it must be submitted and confirmed again.",
            )}
          </Notice>
        )}
        {mutation.error && <RequestError code={mutation.error} />}
        <button className={primaryClass} disabled={mutation.busy}>
          {accept ? c("접수", "Accept") : c("변경 저장", "Save changes")}
        </button>
      </form>
    </Block>
  );
}

function SubmitForm({
  projectId,
  request,
  onDone,
}: {
  projectId: string;
  request: ProjectRequest;
  onDone: () => Promise<void>;
}) {
  const c = useCopy();
  const { team, me } = useScope();
  const scope = useMemo(
    () => ({
      origin: new URL(apiClient.defaults.baseURL!).origin,
      userId: me,
      workspaceId: team,
      projectId,
    }),
    [me, team, projectId],
  );
  const [versions, setVersions] = useState<TeamFileVersion[] | null>(null);
  const [search, setSearch] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const versionSerial = useRef(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [externalFiles, setExternalFiles] = useState("");
  const mutation = useMutation(projectId);
  const loadVersions = useCallback(async () => {
    const ticket = ++versionSerial.current;
    try {
      const result = await fileApi(scope).versions(search, cursor);
      if (ticket === versionSerial.current) {
        setVersions(result.versions);
        setNextCursor(result.nextCursor);
      }
    } catch {
      if (ticket === versionSerial.current) {
        setVersions([]);
        setNextCursor(null);
      }
    }
  }, [scope, search, cursor]);
  useEffect(() => {
    const sequence = versionSerial;
    const start = window.setTimeout(() => void loadVersions(), 0),
      timer = window.setInterval(() => void loadVersions(), 15000);
    return () => {
      sequence.current++;
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [loadVersions]);
  const disabled = mutation.busy || mutation.locked;
  return (
    <Block
      title={c("자료 제출", "Submit")}
      description={c(
        `요청 버전 ${request.requestRevision} 기준으로 제출합니다.`,
        `Submits against revision ${request.requestRevision}.`,
      )}
    >
      <form
        className="max-w-3xl space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const external = location.trim()
            ? {
                externalLocation: location.trim(),
                externalFiles: externalFiles
                  .split("\n")
                  .map((name) => name.trim())
                  .filter(Boolean),
              }
            : {};
          const input = {
            requestRevision: request.requestRevision,
            versionIds: selected,
            note: note.trim(),
            ...external,
          };
          const { result, error } = await mutation.run(input, (requestKey) =>
            requestsService.submit(team, projectId, me, request.id, {
              ...input,
              requestKey,
            }),
          );
          if (result) {
            setSelected([]);
            setNote("");
            setLocation("");
            setExternalFiles("");
          }
          // Show the changed criteria; the selection stays for resubmission.
          if (result || error === "B2B_REQUEST_REVISION_CHANGED")
            await onDone();
        }}
      >
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2">
            {c("제출할 자료", "Files to submit")}
          </legend>
          <input
            className={`${inputClass} sm:max-w-xs`}
            aria-label={c("제출 자료 검색", "Search submission files")}
            placeholder={c("자료 검색", "Search files")}
            value={search}
            disabled={disabled}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(undefined);
            }}
          />
          {versions === null ? (
            <TeamLoading />
          ) : !versions.length ? (
            <p className="text-[13px] text-muted">
              {c(
                "열 수 있는 자료가 없습니다. 자료 화면에서 먼저 올려 주세요.",
                "No files you can open here. Upload them on the files page first.",
              )}
            </p>
          ) : (
            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border px-3">
              {versions.map((v) => (
                <label key={v.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected.includes(v.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, v.id]
                          : selected.filter((id) => id !== v.id),
                      )
                    }
                  />
                  <span className="break-all">
                    {v.name} · {c("버전", "Version")} {v.ordinal} ·{" "}
                    {bytes(v.size)}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted tabular-nums">
            <span className="mr-auto">
              {c(
                `선택한 버전 ${selected.length}개`,
                `${selected.length} versions selected`,
              )}
            </span>
            {cursor && (
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setCursor(undefined)}
              >
                {c("자료 처음으로", "First files page")}
              </button>
            )}
            {nextCursor && (
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setCursor(nextCursor!)}
              >
                {c("다음 제출 자료", "More submission files")}
              </button>
            )}
          </div>
        </fieldset>
        <label className="block space-y-2 text-sm">
          <span>{c("제출 메모", "Submission note")}</span>
          <textarea
            aria-label={c("제출 메모", "Submission note")}
            className={inputClass}
            maxLength={2000}
            disabled={disabled}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-[13px] text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            />
            {c("NAS 등 외부 위치로 전달", "Delivered to an external location")}
          </summary>
          <div className="space-y-3 pt-1">
            <label className="block space-y-2">
              <span>{c("전달 위치", "Location")}</span>
              <input
                className={inputClass}
                maxLength={1000}
                disabled={disabled}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              <span>
                {c(
                  "전달한 파일 (한 줄에 하나)",
                  "Delivered files (one per line)",
                )}
              </span>
              <textarea
                aria-label={c(
                  "전달한 파일 (한 줄에 하나)",
                  "Delivered files (one per line)",
                )}
                className={inputClass}
                disabled={disabled}
                value={externalFiles}
                onChange={(e) => setExternalFiles(e.target.value)}
              />
            </label>
            <p className="text-[13px] text-muted">
              {c(
                "확인자가 실제로 열어 본 뒤에 충족됩니다.",
                "It counts once the confirmer has opened it.",
              )}
            </p>
          </div>
        </details>
        {mutation.error && <RequestError code={mutation.error} />}
        <button className={primaryClass} disabled={mutation.busy}>
          {mutation.busy ? c("제출 중…", "Submitting…") : c("제출", "Submit")}
        </button>
      </form>
    </Block>
  );
}

function DecideForm({
  projectId,
  request,
  submission,
  onDone,
}: {
  projectId: string;
  request: ProjectRequest;
  submission: ProjectRequestSubmission;
  onDone: () => Promise<void>;
}) {
  const c = useCopy();
  const { team, me } = useScope();
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState(false);
  const mutation = useMutation(projectId);
  const decide = async (decision: "confirmed" | "returned") => {
    const input = {
      decision,
      note: note.trim(),
      ...(submission.external ? { externalOpened: opened } : {}),
    };
    const { result } = await mutation.run(input, (requestKey) =>
      requestsService.decide(team, projectId, me, request.id, submission.id, {
        ...input,
        requestKey,
      }),
    );
    if (result) await onDone();
  };
  const disabled = mutation.busy || mutation.locked;
  return (
    <Block
      title={c(
        `제출 ${submission.number}차 확인`,
        `Decide submission ${submission.number}`,
      )}
      description={
        submission.submittedBy.userId === me
          ? c(
              "본인이 제출한 자료라 본인 확인으로 기록됩니다.",
              "You submitted this, so it is recorded as a self-confirmation.",
            )
          : undefined
      }
    >
      <div className="max-w-3xl space-y-4">
        <label className="block space-y-2 text-sm">
          <span>
            {c("확인 메모 (보완 요청 시 필수)", "Note (required to return)")}
          </span>
          <textarea
            aria-label={c(
              "확인 메모 (보완 요청 시 필수)",
              "Note (required to return)",
            )}
            className={inputClass}
            maxLength={2000}
            disabled={disabled}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {submission.external && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={opened}
              disabled={disabled}
              onChange={(e) => setOpened(e.target.checked)}
            />
            {c(
              "전달 위치에서 파일을 실제로 열어 확인했습니다",
              "I opened the delivered files at that location",
            )}
          </label>
        )}
        {mutation.error && <RequestError code={mutation.error} />}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryClass}
            disabled={mutation.busy || (!!submission.external && !opened)}
            onClick={() => void decide("confirmed")}
          >
            {c("확인 완료", "Confirm")}
          </button>
          <button
            type="button"
            className={secondaryClass}
            disabled={mutation.busy || !note.trim()}
            onClick={() => void decide("returned")}
          >
            {c("보완 요청", "Return for changes")}
          </button>
        </div>
      </div>
    </Block>
  );
}

function CloseForm({
  projectId,
  request,
  onDone,
  reopen = false,
}: {
  projectId: string;
  request: ProjectRequest;
  onDone: () => Promise<void>;
  reopen?: boolean;
}) {
  const c = useCopy();
  const { team, me } = useScope();
  const [reason, setReason] = useState("");
  const mutation = useMutation(projectId);
  const label: Copy = reopen
    ? ["다시 열기", "Reopen"]
    : request.state === "proposed"
      ? ["반려", "Decline"]
      : request.required
        ? ["면제", "Waive"]
        : ["취소", "Cancel request"];
  const title: Copy = reopen
    ? ["요청 다시 열기", "Reopen request"]
    : request.state === "proposed"
      ? ["제안 반려", "Decline proposal"]
      : request.required
        ? ["요청 면제", "Waive request"]
        : ["요청 취소", "Cancel request"];
  return (
    <Block
      title={c(...title)}
      description={
        request.required && !reopen
          ? c(
              "필수 요청은 취소 대신 사유를 남겨 면제합니다.",
              "Required requests are waived with a reason, never cancelled.",
            )
          : undefined
      }
    >
      <form
        className="max-w-3xl space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const input = { revision: request.revision, reason: reason.trim() };
          const { result } = await mutation.run(input, (requestKey) =>
            (reopen ? requestsService.reopen : requestsService.close)(
              team,
              projectId,
              me,
              request.id,
              {
                ...input,
                requestKey,
              },
            ),
          );
          if (result) await onDone();
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>
            {c(`${label[0]} 사유`, `Reason to ${label[1].toLowerCase()}`)}
          </span>
          <textarea
            aria-label={c(
              `${label[0]} 사유`,
              `Reason to ${label[1].toLowerCase()}`,
            )}
            className={inputClass}
            required
            maxLength={1000}
            disabled={mutation.busy || mutation.locked}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {mutation.error && <RequestError code={mutation.error} />}
        <button
          className={secondaryClass}
          disabled={mutation.busy || !reason.trim()}
        >
          {c(...label)}
        </button>
      </form>
    </Block>
  );
}
