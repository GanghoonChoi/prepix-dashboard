"use client";
import { useCallback, useEffect, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Pencil } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { TeamLoading, TeamShell } from "@/components/workspaces/shared";
import { Avatar, Badge, Button, EmptyState, Field, Meter, StatStrip, inputClass, tableClass, tdClass, thClass } from "@/components/ui";
import { b2bService } from "@/lib/api/services/b2b.service";
import type { TeamAiUsageView } from "@/lib/api/generated/b2b";
import { formatPeriod } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { B2bError, errorCode, useCopy } from "./shared";
import { roleName, type TeamRole } from "./team-roles";

/**
 * 사용량 (2026-10-12): the team's AI time is one pool — the per-seat value ×
 * the seats, 600분 × 5 = 3,000분 — and every member's work draws on it. This
 * page shows what is left of it this period and who used how much.
 * Owners and admins only (the nav entry and the server agree).
 *
 * 한도 (2026-10-19): a manager may cap one person — an outside editor given
 * one project, say — inside that pool. Only the owner caps the owner or an
 * admin, as with roles.
 */
type Person = TeamAiUsageView["people"][number];

export function TeamUsage() {
  const { data: ws, b2b } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const [view, setView] = useState<TeamAiUsageView | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Person | null>(null);
  const limitDialog = useOverlayState();
  const id = ws.workspace.id;
  const load = useCallback(async () => {
    try {
      setView(await b2bService.teamUsage(id));
      setError("");
    } catch (e) {
      setError(errorCode(e));
    }
  }, [id]);
  useEffect(() => {
    // Work in the app moves it; a glance every minute is enough.
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (!b2b?.enrolled || !b2b.allowedActions.manage) return <B2bError code="B2B_TEAM_MANAGER_REQUIRED" />;
  if (error && !view) return <B2bError code={error} retry={() => void load()} />;
  if (!view) return <TeamLoading />;
  const title = c("사용량", "Usage");
  if (!view.period || !view.poolSeconds)
    return (
      <TeamShell title={title}>
        <EmptyState
          title={c("이번 기간의 AI 시간이 아직 없어요.", "No AI time for this period yet.")}
          description={c("결제한 이용 기간이 시작되면 여기에 팀 사용량이 보여요.", "Team usage shows here once a paid period starts.")}
        />
      </TeamShell>
    );
  // Only the owner limits the owner or an admin (the server agrees).
  const mayLimit = (p: Person) =>
    p.member && (ws.role === "owner" || (p.role !== "owner" && p.role !== "admin"));
  const left = Math.max(0, view.poolSeconds - view.usedSeconds);
  const percent = (view.usedSeconds / view.poolSeconds) * 100;
  // In minutes, the unit the plan is sold in (600분 × 5 = 3,000분).
  const time = (s: number) =>
    s > 0 && s < 60
      ? c("1분 미만", "<1 min")
      : c(`${Math.floor(s / 60).toLocaleString("ko-KR")}분`, `${Math.floor(s / 60).toLocaleString("en-US")} min`);
  return (
    <TeamShell title={title}>
      <section className="space-y-3" aria-label={c("팀 AI 시간", "Team AI time")}>
        <StatStrip
          items={[
            { label: c("남은 시간", "Left"), value: time(left) },
            { label: c("사용한 시간", "Used"), value: time(view.usedSeconds) },
            {
              label: c("팀 전체", "Team total"),
              value: time(view.poolSeconds),
              foot: c(
                `좌석 ${view.seats}개 × ${time(view.perSeatSeconds)}`,
                `${view.seats} seats × ${time(view.perSeatSeconds)}`,
              ),
            },
          ]}
        />
        <div className="space-y-1.5">
          <Meter value={percent} label={c("팀 AI 시간 사용률", "Team AI time used")} />
          <p className="flex flex-wrap justify-between gap-x-4 text-xs text-muted">
            <span>{formatPeriod(view.period.startsAt, view.period.endsAt, lang)}</span>
            <span>{c("멤버가 쓰면 팀 전체 시간에서 차감돼요.", "Everyone's use comes out of the team total.")}</span>
          </p>
        </div>
      </section>

      <section className="space-y-2" aria-label={c("멤버별 사용량", "Usage by member")}>
        <h2 className="text-sm font-semibold">{c("멤버별 사용량", "By member")}</h2>
        <div className="overflow-x-auto">
          <table className={`${tableClass} table-fixed`}>
            <thead>
              <tr>
                <th className={thClass}>{c("이름", "Name")}</th>
                <th className={`${thClass} hidden w-24 sm:table-cell`}>{c("역할", "Role")}</th>
                <th className={`${thClass} w-24 text-right`}>{c("사용", "Used")}</th>
                <th className={`${thClass} w-24 text-right`}>{c("한도", "Limit")}</th>
                <th className={`${thClass} hidden w-40 sm:table-cell`}>
                  <span className="sr-only">{c("팀 전체 대비", "Share of the team total")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.people.map((p) => (
                <tr key={p.userId} data-person={p.email}>
                  <td className={tdClass}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar id={p.userId} name={p.name ?? p.email} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {p.name ?? p.email}
                          {p.userId === ws.currentUserId && <span className="ml-1 font-normal text-muted">{c("(나)", "(you)")}</span>}
                        </p>
                        <p className="truncate text-xs text-muted">{p.email}</p>
                      </div>
                      {!p.member && <Badge>{c("나간 멤버", "Left")}</Badge>}
                    </div>
                  </td>
                  <td className={`${tdClass} hidden text-[13px] text-muted sm:table-cell`}>
                    {p.role ? c(...roleName[p.role as TeamRole]) : "—"}
                  </td>
                  <td className={`${tdClass} text-right text-[13px] tabular-nums`}>{time(p.usedSeconds)}</td>
                  <td className={`${tdClass} text-right text-[13px] tabular-nums`}>
                    {mayLimit(p) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-2"
                        aria-label={c(`${p.name ?? p.email}의 한도`, `Limit for ${p.name ?? p.email}`)}
                        onClick={() => {
                          setEditing(p);
                          limitDialog.open();
                        }}
                      >
                        {p.limitSeconds === null ? <span className="text-muted">{c("없음", "None")}</span> : time(p.limitSeconds)}
                        <Pencil size={12} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                      </Button>
                    ) : p.limitSeconds === null ? (
                      <span className="text-muted">{c("없음", "None")}</span>
                    ) : (
                      time(p.limitSeconds)
                    )}
                  </td>
                  <td className={`${tdClass} hidden sm:table-cell`}>
                    {/* Against their own limit when they have one. */}
                    <Meter value={(p.usedSeconds / (p.limitSeconds || view.poolSeconds)) * 100} tone="neutral" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <B2bError code={error} retry={() => void load()} />}
      </section>
      {editing && (
        <Dialog state={limitDialog} title={c(`${editing.name ?? editing.email}의 AI 한도`, `AI limit for ${editing.name ?? editing.email}`)}>
          <LimitForm
            key={editing.userId}
            workspaceId={id}
            person={editing}
            onDone={async () => {
              limitDialog.close();
              await load();
            }}
          />
        </Dialog>
      )}
    </TeamShell>
  );
}

/** Minutes in, seconds to the server; empty or "한도 없애기" lifts the cap. */
function LimitForm({
  workspaceId,
  person,
  onDone,
}: {
  workspaceId: string;
  person: Person;
  onDone: () => Promise<void>;
}) {
  const c = useCopy();
  const [minutes, setMinutes] = useState(
    person.limitSeconds === null ? "" : String(Math.floor(person.limitSeconds / 60)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(limitSeconds: number | null) {
    setBusy(true);
    setError("");
    try {
      await b2bService.setAiLimit(workspaceId, person.userId, { requestKey: crypto.randomUUID(), limitSeconds });
      await onDone();
    } catch (e) {
      setError(errorCode(e));
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(minutes.trim() === "" ? null : Number(minutes) * 60);
      }}
    >
      <Field
        label={c("이번 기간 한도 (분)", "Limit this period (min)")}
        htmlFor="ai-limit"
        help={c(
          `지금까지 ${Math.floor(person.usedSeconds / 60)}분 썼어요. 팀 전체 시간 안에서 여기까지만 쓸 수 있고, 매 기간 다시 적용돼요.`,
          `Used ${Math.floor(person.usedSeconds / 60)} min so far. They can use up to this much of the team total, every period.`,
        )}
      >
        <input
          id="ai-limit"
          className={inputClass}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder={c("비우면 한도 없음", "Empty for no limit")}
          autoFocus
          disabled={busy}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </Field>
      {error && <B2bError code={error} />}
      <div className="flex flex-wrap justify-end gap-2">
        {person.limitSeconds !== null && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            {c("한도 없애기", "Remove limit")}
          </Button>
        )}
        <Button type="submit" aria-busy={busy} disabled={busy}>
          {c("저장", "Save")}
        </Button>
      </div>
    </form>
  );
}
