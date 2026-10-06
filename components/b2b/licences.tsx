"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useId,
  useState,
  type FormEvent,
} from "react";
import {
  b2bService,
  type AssignLicence,
  type LicenceAssignment,
  type LicenceOverview,
  type EditingDeviceOverview,
  type RetireEditingDevice,
  type RevokeLicence,
  type ScheduleLicenceRevocation,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

type Period = LicenceOverview["periods"][number];
type Budget = LicenceOverview["budgets"][number];
const labels = {
  active: ["배정 중", "Assigned"],
  scheduled: ["다음 기간 배정", "Scheduled"],
  revoking: ["회수 대기", "Revocation pending"],
  released: ["회수 완료", "Released"],
  expired: ["기간 종료", "Expired"],
} as const;
const occupies = (assignment: LicenceAssignment) =>
  ["active", "scheduled", "revoking"].includes(assignment.state);
const number = (value: number) => new Intl.NumberFormat("ko-KR").format(value);
const instant = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(value));
const personName = (person?: TeamPerson) => person?.name || person?.email;

// Keep unknown outcomes in the form, including when a background refresh
// changes its revision. Retry the original input before starting another action.
function useLicenceMutation<T extends { requestKey: string }>(
  onSaved: () => Promise<void>,
) {
  const request = useRef<T | null>(null),
    inFlight = useRef(false);
  const [pending, setPending] = useState<T | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const run = async (create: () => T, send: (input: T) => Promise<unknown>) => {
    if (inFlight.current) return;
    setBusy(true);
    setError("");
    setSaved(false);
    inFlight.current = true;
    try {
      request.current ??= create();
      setPending(request.current);
      await send(request.current);
      request.current = null;
      setPending(null);
      setSaved(true);
      await onSaved();
    } catch (error) {
      setError(errorCode(error));
      if (freeIntent(request.current, error)) {
        request.current = null;
        setPending(null);
        await onSaved();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { pending, busy, error, saved, run, locked: busy || pending !== null };
}
function MutationStatus({
  pending,
  error,
  saved,
}: {
  pending: unknown;
  error: string;
  saved: boolean;
}) {
  const c = useCopy();
  return (
    <>
      {error && <B2bError code={error} />}
      {!!pending && !!error && (
        <p role="status" className="text-sm leading-6 text-muted">
          {c(
            "처리 결과가 아직 확인되지 않았습니다. 입력을 유지한 채 같은 요청을 다시 확인해 주세요.",
            "The outcome is unknown. Keep these inputs and check the same request again.",
          )}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          {c("변경을 확인했습니다.", "The change is confirmed.")}
        </p>
      )}
    </>
  );
}

export function TeamLicences() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy(),
    workspaceId = data.workspace.id,
    manager = !!b2b?.enrolled && b2b.allowedActions.manage;
  const [loaded, setLoaded] = useState<{
    workspaceId: string;
    manager: boolean;
    overview: LicenceOverview;
    devices: EditingDeviceOverview;
    people: TeamPerson[];
  } | null>(null);
  const [failure, setFailure] = useState<{
    workspaceId: string;
    manager: boolean;
    code: string;
  } | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const call = ++sequence.current;
    try {
      const [overview, roster, devices] = await Promise.all([
        b2bService.licences(workspaceId, !manager),
        manager ? b2bService.members(workspaceId) : Promise.resolve(null),
        b2bService.editingDevices(workspaceId),
      ]);
      if (call !== sequence.current) return;
      setLoaded({
        workspaceId,
        manager,
        overview,
        devices,
        people: roster?.people ?? [],
      });
      setFailure(null);
    } catch (error) {
      if (call !== sequence.current) return;
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401 || status === 403 || status === 404) setLoaded(null);
      setFailure({ workspaceId, manager, code: errorCode(error) });
    }
  }, [workspaceId, manager]);
  useEffect(() => {
    const calls = sequence,
      first = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      calls.current++;
    };
  }, [load]);
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  const view =
    loaded?.workspaceId === workspaceId && loaded.manager === manager
      ? loaded
      : null;
  const error =
    failure?.workspaceId === workspaceId && failure.manager === manager
      ? failure.code
      : "";
  if (b2b.team.currentState === "preparing")
    return (
      <TeamShell title={c("편집 이용권", "Editing licences")}>
        <SpaceBadge workspace={data.workspace} />
        <p className="text-sm leading-6 text-muted">
          {c(
            "첫 구매가 반영된 뒤 이용권을 배정할 수 있습니다. 무료 팀 참여에는 편집 이용권이 필요하지 않습니다.",
            "Assign licences after the first purchase is applied. Free team participation does not require an editing licence.",
          )}
        </p>
        {b2b.allowedActions.billing && (
          <Link
            className={secondaryClass}
            href={`/dashboard/workspaces/${workspaceId}/plan`}
          >
            {c("플랜과 결제", "Plan and billing")}
          </Link>
        )}
      </TeamShell>
    );
  const writable = b2b.team.currentState === "active";
  return (
    <TeamShell
      title={c(
        manager ? "편집 이용권" : "내 편집 이용권",
        manager ? "Editing licences" : "My editing licence",
      )}
      description={c(
        "팀 앱 편집과 팀 AI는 해당 팀의 이용권을 함께 확인합니다. AI는 좌석마다 따로 있으며, 배정과 재배정은 AI를 새로 만들지 않습니다.",
        "Team app editing and team AI use the same team licence. AI belongs to each seat; assigning or reassigning never creates new AI.",
      )}
    >
      <SpaceBadge workspace={data.workspace} />
      {error && <B2bError code={error} retry={() => void load()} />}
      {!view ? (
        !error && <TeamLoading />
      ) : (
        <>
          {manager ? (
            <>
              {view.overview.periods.length === 0 && (
                <p className="text-sm text-muted">
                  {c(
                    "현재 배정할 수 있는 구매 기간이 없습니다. 이용 상태와 구매 내역을 확인해 주세요.",
                    "No purchased period is available for assignment. Review the team status and purchases.",
                  )}
                </p>
              )}
              {view.overview.periods
                .toSorted((a, b) => b.startsAt.localeCompare(a.startsAt))
                .map((period) => (
                  <PeriodLicences
                    key={period.id}
                    period={period}
                    overview={view.overview}
                    people={view.people}
                    writable={
                      writable &&
                      ["active", "future"].includes(period.state) &&
                      Date.parse(period.endsAt) >
                        Date.parse(view.overview.serverTime)
                    }
                    onSaved={load}
                  />
                ))}
            </>
          ) : (
            <>
              {view.overview.assignments.filter(occupies).length === 0 && (
                <p className="text-sm leading-6 text-muted">
                  {c(
                    "현재 배정된 편집 이용권이 없습니다. 팀 관리자에게 배정을 요청하세요. 허용된 웹 참여·검토·업로드에는 이용권이 필요하지 않습니다.",
                    "No editing licence is currently assigned. Ask a team administrator. Permitted web participation, review and uploads do not require a licence.",
                  )}
                </p>
              )}
              <PersonalLicences overview={view.overview} onSaved={load} />
            </>
          )}
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {c(
              "회수 대기는 구매 정원을 계속 사용합니다. 이전 사용자의 모든 유효 장치가 허가를 반납하거나 만료된 뒤 정원을 다시 배정할 수 있습니다. 웹 참여와 구매 정원은 회수로 변경되지 않습니다.",
              "Pending revocations continue to occupy capacity until all valid device permissions are discarded or expire. Revocation does not change web participation or purchased capacity.",
            )}
          </p>
          {manager && b2b.allowedActions.billing && (
            <Link
              className={secondaryClass}
              href={`/dashboard/workspaces/${workspaceId}/plan`}
            >
              {c("플랜과 결제", "Plan and billing")}
            </Link>
          )}
          <PersonalDevices overview={view.devices} onSaved={load} />
        </>
      )}
    </TeamShell>
  );
}

function PersonalDevices({
  overview,
  onSaved,
}: {
  overview: EditingDeviceOverview;
  onSaved: () => Promise<void>;
}) {
  const c = useCopy();
  const occupied = overview.devices.filter(
    (device) => device.state !== "retired",
  ).length;
  return (
    <Block
      title={c("내 등록 장치", "My registered devices")}
      description={c(
        "등록 해제는 새 편집 허가를 막습니다. 유효한 오프라인 허가가 모두 반납되거나 만료된 뒤 장치 정원에서 제외됩니다. 로컬 프로젝트와 사용자 이용권은 삭제되지 않습니다.",
        "Retirement blocks new editing grants. A device stops occupying capacity after all valid offline permissions are discarded or expire. Local projects and your licence assignment are preserved.",
      )}
    >
      <p className="text-sm tabular-nums">
        {c("사용 중·해제 대기", "Active or retiring")} {occupied}
        {overview.deviceLimit !== null && <> / {overview.deviceLimit}</>}
      </p>
      {overview.deviceLimit === null && (
        <p className="text-sm text-muted">
          {c(
            "신규 등록을 위한 장치 정책이 아직 준비되지 않았습니다. 기존 장치는 조회하거나 등록 해제할 수 있습니다.",
            "The policy for new registrations is not ready. Existing devices can still be viewed or retired.",
          )}
        </p>
      )}
      {overview.devices.length === 0 && (
        <p className="text-sm text-muted">
          {c(
            "이 팀에 등록된 내 장치가 없습니다.",
            "You have no registered devices in this team.",
          )}
        </p>
      )}
      {overview.devices
        .toSorted(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
        .map((device) => (
          <DeviceRow key={device.id} device={device} onSaved={onSaved} />
        ))}
    </Block>
  );
}
function DeviceRow({
  device,
  onSaved,
}: {
  device: EditingDeviceOverview["devices"][number];
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!,
    c = useCopy(),
    fieldId = useId();
  const [reason, setReason] = useState("");
  const mutation = useLicenceMutation<RetireEditingDevice>(onSaved);
  const active = device.state === "active";
  const name = c(
    `장치 ${device.id.slice(0, 8)}`,
    `Device ${device.id.slice(0, 8)}`,
  );
  const state = c(
    device.state === "retired"
      ? "등록 해제 완료"
      : active
        ? "사용 중"
        : "등록 해제 대기",
    device.state === "retired"
      ? "Retired"
      : active
        ? "Active"
        : "Retirement pending",
  );
  return (
    <section
      aria-label={`${name} · ${state}`}
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-medium">{name}</h3>
        <span className="text-muted">{state}</span>
      </div>
      <p className="break-all text-xs text-muted">
        {c("장치 식별자", "Device ID")} · {device.id}
      </p>
      <p className="text-muted tabular-nums">
        {c("등록", "Registered")} · {instant(device.createdAt)}
      </p>
      {device.state === "retiring" && (
        <p role="status" className="leading-6 text-muted">
          {device.latestExpiry
            ? c(
                `${device.pendingGrantCount}개 허가의 반납을 기다립니다. 반납 확인이 없으면 ${instant(device.latestExpiry)}까지 장치 정원을 유지합니다.`,
                `Waiting for ${device.pendingGrantCount} permissions to be discarded. Without acknowledgement, device capacity remains occupied until ${instant(device.latestExpiry)}.`,
              )
            : c(
                "장치 종료를 확인하고 있습니다.",
                "Checking device completion.",
              )}
        </p>
      )}
      {device.retirementReason && (
        <p className="break-words text-muted">
          {c("해제 사유", "Retirement reason")} · {device.retirementReason}
        </p>
      )}
      {(active || mutation.pending || mutation.error || mutation.saved) && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-muted">
            {c("장치 등록 해제", "Retire this device")}
          </summary>
          <form
            className="max-w-xl space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void mutation.run(
                () => ({
                  requestKey: crypto.randomUUID(),
                  revision: device.revision,
                  reason: reason.trim(),
                }),
                (input) =>
                  b2bService.retireEditingDevice(
                    data.workspace.id,
                    device.id,
                    input,
                  ),
              );
            }}
          >
            <fieldset
              disabled={mutation.locked || !active}
              className="space-y-2 disabled:opacity-70"
            >
              <label htmlFor={`${fieldId}-reason`}>
                {c("등록 해제 사유", "Retirement reason")}
              </label>
              <textarea
                id={`${fieldId}-reason`}
                className={inputClass}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </fieldset>
            <MutationStatus {...mutation} />
            <button
              className={primaryClass}
              disabled={
                mutation.busy ||
                (!mutation.pending && (!active || !reason.trim()))
              }
            >
              {c(
                mutation.busy
                  ? "장치 해제 확인 중…"
                  : mutation.pending
                    ? "같은 장치 해제 다시 확인"
                    : "장치 해제 확인",
                mutation.busy
                  ? "Checking retirement…"
                  : mutation.pending
                    ? "Check the same retirement"
                    : "Confirm device retirement",
              )}
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

function PersonalLicences({
  overview,
  onSaved,
}: {
  overview: LicenceOverview;
  onSaved: () => Promise<void>;
}) {
  const c = useCopy();
  // Personal views contain no team roster or purchased capacity. Couple my
  // seat's AI to its own assignment period so future and past stay distinct.
  const periods = [...new Set(overview.assignments.map((a) => a.periodId))]
    .map((periodId) => ({
      periodId,
      rows: overview.assignments.filter((a) => a.periodId === periodId),
      budget: overview.budgets.find((b) => b.periodId === periodId),
    }))
    .sort((a, b) => b.rows[0].startsAt.localeCompare(a.rows[0].startsAt));
  const now = Date.parse(overview.serverTime);
  return periods.map(({ periodId, rows, budget }) => {
    const future = Date.parse(rows[0].startsAt) > now,
      ended = Date.parse(rows[0].endsAt) <= now;
    return (
      <Block
        key={periodId}
        title={c(
          ended
            ? "이전 이용권 기간"
            : future
              ? "다음 이용권 기간"
              : "현재 이용권 기간",
          ended
            ? "Previous licence period"
            : future
              ? "Next licence period"
              : "Current licence period",
        )}
        description={`${instant(rows[0].startsAt)} — ${instant(rows[0].endsAt)} (KST)`}
      >
        {future && (
          <p className="text-sm text-muted">
            {c(
              "시작 시각 전에는 이 이용권과 AI를 사용할 수 없습니다.",
              "This licence and its AI cannot be used before the start time.",
            )}
          </p>
        )}
        {rows.map((assignment) => (
          <AssignmentRow
            key={assignment.id}
            assignment={assignment}
            wait={overview.deviceWaits.find(
              (w) => w.assignmentId === assignment.id,
            )}
            manager={false}
            onSaved={onSaved}
          />
        ))}
        {budget && (
          <>
            <p className="text-xs leading-5 text-muted">
              {budget.unitDescription}
            </p>
            <BudgetRow budget={budget} own />
          </>
        )}
      </Block>
    );
  });
}

function PeriodLicences({
  period,
  overview,
  people,
  writable,
  onSaved,
}: {
  period: Period;
  overview: LicenceOverview;
  people: TeamPerson[];
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  const c = useCopy(),
    now = Date.parse(overview.serverTime),
    future = Date.parse(period.startsAt) > now,
    ended =
      Date.parse(period.endsAt) <= now ||
      ["ended", "revoked"].includes(period.state);
  const rows = overview.assignments.filter((a) => a.periodId === period.id),
    budgets = overview.budgets.filter((b) => b.periodId === period.id);
  const counts = {
    active: rows.filter((a) => a.state === "active").length,
    scheduled: rows.filter((a) => a.state === "scheduled").length,
    revoking: rows.filter((a) => a.state === "revoking").length,
  };
  const free = ended
    ? 0
    : Math.max(
        0,
        period.capacity - counts.active - counts.scheduled - counts.revoking,
      );
  return (
    <Block
      title={c(
        ended
          ? "이전 구매 기간"
          : future
            ? "구매한 다음 기간"
            : "현재 구매 기간",
        ended
          ? "Previous purchased period"
          : future
            ? "Purchased next period"
            : "Current purchased period",
      )}
      description={`${instant(period.startsAt)} — ${instant(period.endsAt)} (KST)`}
    >
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
        {[
          [c("구매 정원", "Purchased capacity"), period.capacity],
          [c("배정 중", "Assigned"), counts.active],
          [c("다음 기간 배정", "Scheduled"), counts.scheduled],
          [c("회수 대기", "Revocation pending"), counts.revoking],
          [c("배정 가능", "Available"), free],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-2 text-lg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {future && (
        <p className="text-sm leading-6 text-muted">
          {c(
            "구매한 정원은 유지하고 다음 기간에 사용할 사람을 선택합니다. 시작 시각 전에는 이 이용권을 사용할 수 없습니다.",
            "Keep the purchased capacity and choose who will use it next period. These licences cannot be used before the start time.",
          )}
        </p>
      )}
      {rows.map((assignment) => (
        <AssignmentRow
          key={assignment.id}
          assignment={assignment}
          person={people.find((p) => p.userId === assignment.userId)}
          wait={overview.deviceWaits.find(
            (w) => w.assignmentId === assignment.id,
          )}
          manager
          onSaved={onSaved}
          editable={writable}
        />
      ))}
      <AssignForm
        period={period}
        assignments={rows}
        people={people}
        free={free}
        writable={writable}
        onSaved={onSaved}
      />
      {budgets.length > 0 && (
        <section
          aria-label={c("좌석별 AI 사용", "AI use per seat")}
          className="space-y-4 pt-4"
        >
          <h3 className="text-sm font-medium">
            {c("좌석별 AI 사용", "AI use per seat")}
          </h3>
          <p className="text-xs leading-5 text-muted">
            {period.aiUnitDescription}{" "}
            {c(
              "AI는 좌석마다 따로 있고 팀이 함께 쓰지 않습니다. 좌석의 AI는 구매 조건으로 정해지며 바꿀 수 없습니다. 좌석을 다른 사람에게 넘기면 그 좌석에 남은 양을 이어서 씁니다. 다 쓰면 다음 기간까지 기다립니다.",
              "AI belongs to each seat and is not shared across the team. A seat's AI is set by the purchase and cannot be changed. Moving a seat to someone else hands over what that seat has left. When it runs out, it waits for the next period.",
            )}
          </p>
          {[...budgets]
            .sort((a, b) => a.slot - b.slot)
            .map((budget) => {
              const holder = rows.find(
                (a) => a.slot === budget.slot && occupies(a),
              );
              return (
                <BudgetRow
                  key={budget.slot}
                  budget={budget}
                  person={
                    holder
                      ? people.find((p) => p.userId === holder.userId)
                      : undefined
                  }
                  empty={!holder}
                />
              );
            })}
        </section>
      )}
    </Block>
  );
}

function AssignForm({
  period,
  assignments,
  people,
  free,
  writable,
  onSaved,
}: {
  period: Period;
  assignments: LicenceAssignment[];
  people: TeamPerson[];
  free: number;
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!,
    c = useCopy();
  const [userId, setUserId] = useState("");
  const mutation = useLicenceMutation<AssignLicence>(onSaved);
  const fieldId = useId();
  const eligible = people.filter(
    (p) =>
      !p.suspendedAt &&
      !p.accountUnavailable &&
      !assignments.some((a) => a.userId === p.userId && occupies(a)),
  );
  const selected = people.find((p) => p.userId === userId);
  const options =
    selected && !eligible.some((p) => p.userId === userId)
      ? [selected, ...eligible]
      : eligible;
  const valid =
    writable &&
    !!userId &&
    eligible.some((p) => p.userId === userId) &&
    free > 0;
  if (!writable && !mutation.pending && !mutation.error && !mutation.saved)
    return null;
  return (
    <form
      aria-label={c("편집 이용권 배정", "Assign an editing licence")}
      className="max-w-2xl space-y-4 border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        void mutation.run(
          () => ({
            requestKey: crypto.randomUUID(),
            periodId: period.id,
            userId,
          }),
          (input) => b2bService.assignLicence(data.workspace.id, input),
        );
      }}
    >
      <fieldset
        disabled={mutation.locked || free === 0 || !writable}
        className="space-y-4 disabled:opacity-70"
      >
        <div className="space-y-2 text-sm">
          <label htmlFor={`${fieldId}-person`}>
            {c("배정 대상", "Participant")}
          </label>
          <select
            id={`${fieldId}-person`}
            className={inputClass}
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            required
          >
            <option value="">
              {c("수락한 참여자 선택", "Choose an accepted participant")}
            </option>
            {mutation.pending &&
              !options.some((p) => p.userId === mutation.pending?.userId) && (
                <option value={mutation.pending.userId}>
                  {c("원래 배정 대상", "Original participant")}
                </option>
              )}
            {options.map((p) => (
              <option key={p.userId} value={p.userId}>
                {personName(p)} ·{" "}
                {c(
                  p.kind === "external" ? "외부" : "내부",
                  p.kind === "external" ? "External" : "Internal",
                )}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs leading-5 text-muted">
          {c(
            `배정하면 빈 좌석 하나와 그 좌석의 이번 기간 AI를 함께 씁니다. AI 한도는 정하지 않으며, 다른 사람이 쓰던 좌석이면 남은 양을 이어서 씁니다. 단위: ${period.aiUnitLabel}`,
            `An assignment takes a free seat together with that seat's AI for the period. There is no limit to set; a seat someone used before hands over what it has left. Unit: ${period.aiUnitLabel}`,
          )}
        </p>
      </fieldset>
      {free === 0 && (
        <p role="status" className="text-sm leading-6 text-muted">
          {c(
            "배정 가능 정원이 없습니다. 회수 대기의 장치가 모두 종료될 때까지 기다리거나 결제 권한자에게 추가 구매를 요청하세요.",
            "No capacity is available. Wait for pending devices to end or ask a billing administrator for additional capacity.",
          )}
        </p>
      )}
      <MutationStatus {...mutation} />
      <button
        className={primaryClass}
        disabled={mutation.busy || (!mutation.pending && !valid)}
      >
        {c(
          mutation.busy
            ? "배정 확인 중…"
            : mutation.pending
              ? "같은 배정 다시 확인"
              : "이용권 배정",
          mutation.busy
            ? "Checking assignment…"
            : mutation.pending
              ? "Check the same assignment"
              : "Assign licence",
        )}
      </button>
    </form>
  );
}

type AssignmentChange =
  | { action: "revoke"; input: RevokeLicence }
  | { action: "schedule"; input: ScheduleLicenceRevocation };
function AssignmentRow({
  assignment,
  person,
  wait,
  manager,
  editable = false,
  onSaved,
}: {
  assignment: LicenceAssignment;
  person?: TeamPerson;
  wait?: LicenceOverview["deviceWaits"][number];
  manager: boolean;
  editable?: boolean;
  onSaved: () => Promise<void>;
}) {
  const c = useCopy();
  const stateLabel = c(
    labels[assignment.state][0],
    labels[assignment.state][1],
  );
  return (
    <section
      aria-label={`${manager ? (personName(person) ?? c("이전 참여자", "Former participant")) : c("내 배정", "My assignment")} · ${stateLabel}`}
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium break-all">
          {manager
            ? (personName(person) ?? c("이전 참여자", "Former participant"))
            : c("내 배정", "My assignment")}
        </p>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
          {stateLabel}
        </span>
      </div>
      <p className="tabular-nums text-muted">
        {instant(assignment.startsAt)} — {instant(assignment.endsAt)} (KST)
      </p>
      {assignment.scheduledRevokeAt && (
        <p className="tabular-nums">
          {c("예정 회수", "Scheduled revocation")} ·{" "}
          {instant(assignment.scheduledRevokeAt)}
        </p>
      )}
      {assignment.state === "revoking" && (
        <p role="status" className="leading-6 text-muted">
          {wait
            ? c(
                `${wait.deviceCount}개 장치의 종료를 기다립니다. 반납 확인이 없으면 ${instant(wait.latestExpiry)}까지 구매 정원을 유지합니다.`,
                `Waiting for ${wait.deviceCount} devices. Without acknowledgement, capacity remains occupied until ${instant(wait.latestExpiry)}.`,
              )
            : c(
                "장치 종료를 확인하고 있습니다. 최신 상태를 다시 확인해 주세요.",
                "Checking device completion. Refresh for the current state.",
              )}
        </p>
      )}
      {manager && (
        <AssignmentEditor
          assignment={assignment}
          editable={editable}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
function AssignmentEditor({
  assignment,
  editable,
  onSaved,
}: {
  assignment: LicenceAssignment;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!,
    c = useCopy();
  const [action, setAction] = useState<"revoke" | "schedule" | "clear">(
      "revoke",
    ),
    [reason, setReason] = useState(""),
    [cutoff, setCutoff] = useState("");
  type Pending = { requestKey: string } & AssignmentChange;
  const mutation = useLicenceMutation<Pending>(onSaved);
  const fieldId = useId();
  const canChange =
    editable && ["active", "scheduled"].includes(assignment.state);
  const valid =
    canChange && !!reason.trim() && (action !== "schedule" || !!cutoff);
  if (!canChange && !mutation.pending && !mutation.error && !mutation.saved)
    return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutation.run(
      () => {
        const requestKey = crypto.randomUUID(),
          base = {
            requestKey,
            revision: assignment.revision,
            reason: reason.trim(),
          };
        return action === "revoke"
          ? { requestKey, action: "revoke", input: base }
          : {
              requestKey,
              action: "schedule",
              input: {
                ...base,
                scheduledRevokeAt:
                  action === "clear"
                    ? null
                    : new Date(`${cutoff}+09:00`).toISOString(),
              },
            };
      },
      (input) =>
        input.action === "revoke"
          ? b2bService.revokeLicence(
              data.workspace.id,
              assignment.id,
              input.input,
            )
          : b2bService.scheduleLicence(
              data.workspace.id,
              assignment.id,
              input.input,
            ),
    );
  };
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-muted">
        {c("이용권 회수·예정 회수 변경", "Revoke or schedule this licence")}
      </summary>
      <form className="space-y-4" onSubmit={submit}>
        <fieldset
          disabled={mutation.locked || !canChange}
          className="space-y-4 disabled:opacity-70"
        >
          <div className="space-y-2">
            <label htmlFor={`${fieldId}-mode`}>
              {c("회수 방식", "Revocation mode")}
            </label>
            <select
              id={`${fieldId}-mode`}
              className={inputClass}
              value={action}
              onChange={(event) =>
                setAction(event.target.value as typeof action)
              }
            >
              <option value="revoke">
                {c("즉시 회수 요청", "Request immediate revocation")}
              </option>
              <option value="schedule">
                {c("예정 회수 시각 설정", "Set a scheduled cutoff")}
              </option>
              <option value="clear">
                {c("예정 회수 취소", "Clear the scheduled cutoff")}
              </option>
            </select>
          </div>
          {action === "schedule" && (
            <div className="space-y-2">
              <label htmlFor={`${fieldId}-cutoff`}>
                {c(
                  "예정 회수 시각 (한국 시간)",
                  "Scheduled cutoff (Korea time)",
                )}
              </label>
              <input
                id={`${fieldId}-cutoff`}
                className={inputClass}
                type="datetime-local"
                step="1"
                value={cutoff}
                onChange={(event) => setCutoff(event.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor={`${fieldId}-reason`}>
              {c("변경 사유", "Reason")}
            </label>
            <textarea
              id={`${fieldId}-reason`}
              className={inputClass}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
          <p className="text-xs leading-5 text-muted">
            {c(
              "즉시 회수는 새 편집·팀 AI를 막고 기존 모든 장치가 종료될 때까지 정원을 유지합니다. 이미 발급된 오프라인 허가보다 이른 예정 시각은 설정할 수 없습니다.",
              "Immediate revocation blocks new editing and team AI but retains capacity until every device ends. A scheduled cutoff cannot precede an issued offline grant.",
            )}
          </p>
        </fieldset>
        <MutationStatus {...mutation} />
        <button
          className={primaryClass}
          disabled={mutation.busy || (!mutation.pending && !valid)}
        >
          {c(
            mutation.busy
              ? "회수 확인 중…"
              : mutation.pending
                ? "같은 회수 요청 다시 확인"
                : "회수 변경 확인",
            mutation.busy
              ? "Checking revocation…"
              : mutation.pending
                ? "Check the same revocation"
                : "Confirm revocation change",
          )}
        </button>
      </form>
    </details>
  );
}
function BudgetRow({
  budget,
  person,
  own = false,
  empty = false,
}: {
  budget: Budget;
  person?: TeamPerson;
  own?: boolean;
  empty?: boolean;
}) {
  const c = useCopy();
  const seat = c(`${budget.slot}번 좌석`, `Seat ${budget.slot}`);
  const name = own
    ? c("내 좌석", "My seat")
    : `${seat} · ${empty ? c("비어 있음", "empty") : (personName(person) ?? c("참여자", "Participant"))}`;
  return (
    <section
      className="space-y-3 border-l border-border pl-4 text-sm"
      aria-label={`${name} · ${c("좌석 AI", "Seat AI")}`}
    >
      {!own && <p className="break-all font-medium">{name}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [c("좌석 AI", "Seat AI"), budget.limitUnits],
          [c("확정 사용", "Confirmed"), budget.confirmedUnits],
          [c("예약", "Reserved"), budget.reservedUnits],
          [
            c("이번 기간 남은 양", "Left this period"),
            budget.limitUnits - budget.confirmedUnits - budget.reservedUnits,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 tabular-nums">
              {number(Number(value))} {budget.unitLabel}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
