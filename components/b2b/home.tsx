"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { apiClient } from "@/lib/api/client";
import { useOverlayState } from "@heroui/react";
import { Lock, UserPlus } from "lucide-react";
import {
  b2bService,
  type B2bStatus,
  type TeamHome,
  type TeamPeople,
} from "@/lib/api/services/b2b.service";
import {
  assertHomeScope,
  homeEnvironment,
  homeScopeKey,
  type HomeScope,
} from "@/lib/b2b-home/home";
import {
  Details,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { Dialog } from "@/components/dialog";
import { ago, Avatar } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { href as notificationHref } from "@/lib/b2b-notifications/notifications";
import { B2bError, StateBadge, errorCode, useCopy } from "./shared";
import { InviteForm } from "./invitations";
import { Poster } from "./reviews";
import { OwnershipOffer } from "./ownership";
import { LeaveTeam } from "./leave-team";
import { MyDevices } from "./devices";
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const periods = {
  current: ["현재 이용기간", "Current period"],
  scheduled: ["다음 기간 예정", "Next period scheduled"],
  withheld: ["환불 확인 중 · 사용 보류", "Refund pending · use withheld"],
  ended: ["종료된 기간", "Ended period"],
} as const;
const licences = {
  active: ["편집 좌석 있음", "Editing seat"],
  scheduled: ["다음 기간 좌석 예정", "Seat next period"],
  revoking: ["좌석 해제 중", "Seat being released"],
  released: ["좌석 해제됨", "Seat released"],
  expired: ["좌석 종료", "Seat ended"],
} as const;
const transfers: Record<string, [string, string]> = {
  preparing: ["전송 준비", "Preparing"],
  uploading: ["전송 중", "Uploading"],
  verifying: ["서버 검증 중", "Server verification"],
  quarantined: ["검증 문제 · 확인 필요", "Verification needs attention"],
  expired: ["전송 만료 · 확인 필요", "Transfer expired"],
};
export function B2bHome({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const context = useWorkspace();
  const scope: HomeScope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    userId: context?.data.currentUserId ?? "",
    workspaceId: workspace.id,
  };
  const key = JSON.stringify([
    homeScopeKey(scope),
    status.team.currentState,
    status.allowedActions.projects,
  ]);
  return (
    <ScopedHome key={key} scope={scope} status={status} workspace={workspace} />
  );
}
function ScopedHome({
  scope,
  status,
  workspace,
}: {
  scope: HomeScope;
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy(),
    base = `/dashboard/workspaces/${workspace.id}`;
  const { lang } = useI18n();
  const invite = useOverlayState();
  const [data, setData] = useState<TeamHome | null>(null),
    [error, setError] = useState("");
  // Invitations typed in /start wait for the first payment; say how many.
  const [held, setHeld] = useState(0);
  const preparing = status.team.currentState === "preparing";
  useEffect(() => {
    if (!preparing) return;
    let live = true;
    void b2bService
      .invitations(workspace.id)
      .then(
        (r) =>
          live &&
          setHeld(
            r.invitations.filter((i) => i.deliveryState === "held" && !i.revokedAt)
              .length,
          ),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspace.id, preparing]);
  const lifetime = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const load = useCallback(async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    const ticket = ++sequence.current;
    try {
      const result = await b2bService.home(scope, controller.signal);
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(null);
      setError(errorCode(e));
    }
  }, [scope]);
  useLayoutEffect(() => {
    const calls = sequence,
      controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      calls.current++;
    };
  }, []);
  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const account = () => {
      try {
        assertHomeScope(
          scope,
          homeEnvironment(new URL(apiClient.defaults.baseURL!).origin),
          lifetime.current?.signal,
        );
      } catch {
        setData(null);
        setError("B2B_HOME_SCOPE_CHANGED");
        lifetime.current?.abort();
      }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", account);
    window.addEventListener("workspaces:changed", refresh);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", account);
      window.removeEventListener("workspaces:changed", refresh);
    };
  }, [load, scope]);
  const state = data?.currentState ?? status.team.currentState,
    readable = !!data && ["active", "read_only"].includes(state);
  const projectLink = (id: string, suffix = "") =>
    `${base}/projects/${id}${suffix}`;
  const listClass = "divide-y divide-border border-y border-border";
  const rowClass = "block min-h-14 py-3 transition-colors hover:bg-surface";
  const watch = data?.toWatch?.items ?? [];
  const current = data?.periods.find((p) => p.state === "current");
  return (
    <TeamShell
      title={workspace.name}
      actions={
        <div className="flex items-center gap-3">
          {status.allowedActions.manage && <Faces workspaceId={workspace.id} />}
          {status.allowedActions.manage && state === "active" && (
            <button type="button" className={secondaryClass} onClick={invite.open}>
              <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
              {c("초대", "Invite")}
            </button>
          )}
        </div>
      }
    >
      {/* An active team needs no sentence; any other state says what it
          means and links the one page it sends you to. */}
      {state !== "active" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-[13px]">
          <StateBadge state={state} />
          <span className="text-muted">
            {state === "preparing"
              ? held > 0
                ? c(
                    `결제하면 ${held}명에게 초대가 발송됩니다.`,
                    `Pay to send ${held === 1 ? "1 invitation" : `${held} invitations`}.`,
                  )
                : c(
                    "첫 이용권 반영 전에는 이용기간이 시작되지 않습니다.",
                    "The period starts when the first purchase is applied.",
                  )
              : state === "read_only"
                ? c(
                    "이용기간이 종료되어 열람과 다운로드만 가능합니다.",
                    "The period has ended. Reading and downloading remain.",
                  )
                : c(
                    "팀 자료 접근이 중지되었습니다.",
                    "Access to team content is paused.",
                  )}
          </span>
          {state === "preparing" ? (
            status.allowedActions.billing && (
              <>
                <Link className="text-foreground underline underline-offset-4" href={`${base}/plan`}>
                  {held > 0 ? c("결제하기", "Pay") : c("플랜과 결제", "Plan and billing")}
                </Link>
                {held > 0 && (
                  <Link
                    className="text-foreground underline underline-offset-4"
                    href={`/start?step=invite&intent=team&workspace=${workspace.id}`}
                  >
                    {c("초대 명단 보기", "See who is invited")}
                  </Link>
                )}
              </>
            )
          ) : (
            <Link className="text-foreground underline underline-offset-4" href={`${base}/status`}>
              {c("이용 상태", "Team status")}
            </Link>
          )}
        </div>
      )}
      <OwnershipOffer />
      {error && <B2bError code={error} retry={() => void load()} />}
      {!data && !error && <TeamLoading />}
      {data && readable && watch.length > 0 && (
        <Section title={c("확인할 영상", "To watch")} count={watch.length}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            {watch.slice(0, 4).map((w) => (
              <li key={w.reviewId}>
                <Link
                  href={notificationHref({
                    kind: "review",
                    workspaceId: workspace.id,
                    projectId: w.projectId,
                    reviewId: w.reviewId,
                    round: w.round,
                    versionId: w.versionId,
                  })}
                  className="group block outline-none"
                >
                  <span className="relative block">
                    <Poster url={w.posterUrl} className={thumbClass} />
                    <span
                      className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium backdrop-blur ${
                        w.reason === "approval" ? "bg-accent text-accent-foreground" : "bg-black/60 text-white"
                      }`}
                    >
                      {w.reason === "approval"
                        ? c("승인 요청", "Approve")
                        : w.reason === "version"
                          ? c(`새 버전 v${w.ordinal}`, `New v${w.ordinal}`)
                          : w.reason === "comment"
                            ? c(`코멘트 ${w.comments}`, `${w.comments} comment${w.comments > 1 ? "s" : ""}`)
                            : c("결정됨", "Decided")}
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-[13px] font-medium">{w.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {w.projectName} · {ago(w.at, lang)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data && readable && (
        <Section
          title={c("프로젝트", "Projects")}
          count={data.projects.items.length}
          action={
            data.projects.hasMore && (
              <Link href={`${base}/projects`} className={linkClass}>
                {c("전체 보기", "View all")}
              </Link>
            )
          }
        >
          {data.projects.items.length ? (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-x-4 sm:gap-y-6">
              {data.projects.items.map((p) => (
                <li key={p.id}>
                  <Link href={projectLink(p.id)} className="group block outline-none">
                    <span className="relative block">
                      <Poster url={p.posterUrl} className={thumbClass} />
                      {!!p.unread && (
                        <span className="absolute right-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-background">
                          <span className="sr-only">{c("새 소식", "New")}</span>
                        </span>
                      )}
                      {p.visibility === "private" && (
                        <span className="absolute bottom-2 left-2 grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur">
                          <Lock size={12} strokeWidth={2} aria-label={c("비공개", "Private")} />
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block truncate text-[13px] font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {p.videos ? c(`영상 ${p.videos}`, `${p.videos} video${p.videos > 1 ? "s" : ""}`) : c("영상 없음", "No videos")}
                      {" · "}
                      {ago(p.updatedAt, lang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">
              {c(
                "참여한 프로젝트가 없습니다. 앱에서 공유하면 여기에 나타나요.",
                "No projects yet. What you share from the app shows up here.",
              )}
            </p>
          )}
        </Section>
      )}
      {/* Only when something is moving: an idle transfer list is noise. */}
      {data && readable && data.transfers.items.length > 0 && (
        <Section title={c("내 원본 전송", "My source transfers")}>
          <ul className={listClass}>
            {data.transfers.items.map((t) => (
              <li key={t.id}>
                <Link href={projectLink(t.projectId, "/files")} className={rowClass}>
                  <p className="break-words text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 break-words text-xs text-muted">
                    {t.projectName} ·{" "}
                    {transfers[t.state] ? c(...transfers[t.state]) : t.state}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {/* My seat and devices: one line, the details folded away. */}
      {data && (
        <section aria-label={c("내 좌석", "My seat")} className="space-y-2 border-t border-border pt-5 text-[13px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <span className="font-medium text-foreground">{c("내 좌석", "My seat")}</span>
            <span>
              {!data.period
                ? c("첫 구매가 반영되면 이용기간이 시작됩니다.", "The first applied purchase starts the entitlement period.")
                : data.seat === "waiting"
                  ? c("좌석 대기 중 · 자리가 나면 자동으로 배정됩니다", "Waiting for a seat · assigned automatically")
                  : current?.licence
                    ? c(licences[current.licence.state][0], licences[current.licence.state][1])
                    : c("편집 좌석 없음 · 보기만", "No editing seat · view only")}
              {current && c(` · ${shortDate(current.endsAt)}까지`, ` · until ${shortDate(current.endsAt)}`)}
            </span>
          </p>
          {(data.periods.length > 0 || readable) && (
            <Details summary={c("기간과 장치", "Periods and devices")}>
              <div className="space-y-6 text-foreground">
                {data.periods.length > 0 && (
                  <ul className={listClass}>
                    {data.periods.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c(periods[p.state][0], periods[p.state][1])}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-muted">
                            {date(p.startsAt)} — {date(p.endsAt)} KST
                            {p.licence?.scheduledRevokeAt &&
                              ` · ${c("회수 예정", "Revocation scheduled")} ${date(p.licence.scheduledRevokeAt)}`}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
                          {p.licence
                            ? c(licences[p.licence.state][0], licences[p.licence.state][1])
                            : p.state === "current" && data.seat === "waiting"
                              ? c("좌석 대기", "Waiting for a seat")
                              : c("편집 좌석 없음 · 보기만", "No editing seat · view only")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {readable && <MyDevices />}
              </div>
            </Details>
          )}
        </section>
      )}
      {!status.allowedActions.manage && <LeaveTeam />}
      <Dialog state={invite} title={c("멤버 초대", "Invite people")}>
        <InviteForm onSent={() => undefined} />
      </Dialog>
    </TeamShell>
  );
}
const thumbClass =
  "aspect-video w-full rounded-lg ring-1 ring-black/5 ring-offset-2 ring-offset-background transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-foreground dark:ring-white/10";
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(value));
/** Who is on the team, at a glance; the stack links to People. */
function Faces({ workspaceId }: { workspaceId: string }) {
  const c = useCopy();
  const [people, setPeople] = useState<TeamPeople["people"] | null>(null);
  useEffect(() => {
    let live = true;
    void b2bService
      .members(workspaceId)
      .then((r) => live && setPeople(r.people.filter((p) => !p.suspendedAt)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspaceId]);
  if (!people?.length) return null;
  return (
    <Link
      href={`/dashboard/workspaces/${workspaceId}/members`}
      className="hidden items-center sm:flex"
      aria-label={c(`멤버 ${people.length}명`, `${people.length} members`)}
    >
      {people.slice(0, 4).map((p) => (
        <span key={p.userId} className="-ml-2 rounded-full ring-2 ring-background first:ml-0">
          <Avatar id={p.userId} name={p.name || p.email} size={28} />
        </span>
      ))}
      {people.length > 4 && (
        <span className="-ml-2 grid size-7 place-items-center rounded-full bg-surface-secondary text-[11px] font-medium text-muted ring-2 ring-background">
          +{people.length - 4}
        </span>
      )}
    </Link>
  );
}
const linkClass =
  "text-[13px] text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline";
/** A named region: the e2e suite and assistive tech find these by name, so it
 *  is a `<section aria-label>` rather than the shared `Block`. */
function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-[15px] font-medium">
          {title}
          {count !== undefined && <span className="text-[13px] font-normal tabular-nums text-muted">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
