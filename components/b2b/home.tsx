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
import { Folder, FolderOpen, Lock, UserPlus } from "lucide-react";
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
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { Dialog } from "@/components/dialog";
import {
  ago,
  AvatarStack,
  Badge,
  Button,
  buttonClass,
  CardHeader,
  EmptyState,
  Notice,
  ProgressTracker,
  type TrackerStep,
} from "@/components/ui";
import { startHref } from "@/lib/onboarding";
import { useI18n } from "@/lib/i18n/context";
import { href as notificationHref } from "@/lib/b2b-notifications/notifications";
import { B2bError, StateBadge, errorCode, useCopy } from "./shared";
import { InviteForm } from "./invitations";
import { Poster, posterLinkClass } from "./reviews";
import { OwnershipOffer } from "./ownership";
import { LeaveTeam } from "./leave-team";
import { MyDevices } from "./devices";
import { DemoStorage } from "./demo-storage";
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
  const role = useWorkspace()?.data.role;
  const c = useCopy(),
    base = `/dashboard/workspaces/${workspace.id}`;
  const { lang } = useI18n();
  const invite = useOverlayState();
  const [data, setData] = useState<TeamHome | null>(null),
    [error, setError] = useState("");
  // Invitations typed in /start wait for the first payment; say how many.
  // Any invitation at all ticks "invite your team" off the first-run list.
  const [held, setHeld] = useState(0),
    [invited, setInvited] = useState(false);
  const manage = status.allowedActions.manage;
  useEffect(() => {
    if (!manage) return;
    let live = true;
    void b2bService
      .invitations(workspace.id)
      .then((r) => {
        if (!live) return;
        const open = r.invitations.filter((i) => !i.revokedAt);
        setInvited(open.length > 0);
        setHeld(open.filter((i) => i.deliveryState === "held").length);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspace.id, manage]);
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
  const seatNotice = !data?.period
    ? null
    : data.seat === "waiting"
      ? c("편집 좌석을 기다리고 있어요. 자리가 나면 자동으로 배정돼요.", "Waiting for an editing seat. You'll get one as soon as one frees up.")
      : data.seat === "releasing"
        ? c("편집 좌석이 곧 해제돼요.", "Your editing seat is being released.")
        : data.seat === "none" && role && role !== "reviewer"
          ? c("편집 좌석이 없어 앱에서는 보기만 할 수 있어요.", "You don't have an editing seat, so the app is view-only.")
          : null;
  const link = "font-medium text-foreground underline underline-offset-4";
  // A new team's first three things, in /start's order, until something is
  // shared: the one place a manager sees what is left after /start.
  const shared = !!data?.projects.items.length;
  const starting =
    process.env.NEXT_PUBLIC_START_ONBOARDING === "1" &&
    manage &&
    !!data &&
    !shared &&
    (state === "preparing" || state === "active");
  const firstRun: TrackerStep[] = [
    { id: "invite", label: c("팀원 초대하기", "Invite your team"), done: invited },
    { id: "pay", label: c("결제하기", "Pay for the team"), done: state !== "preparing" },
    {
      id: "share",
      label: c("앱 설치하고 첫 영상 공유하기", "Get the app and share a first video"),
      done: shared,
    },
  ];
  const next = firstRun.find((s) => !s.done)?.id;
  return (
    <TeamShell
      title={workspace.name}
      actions={
        status.allowedActions.manage && (
          <>
            <Faces workspaceId={workspace.id} />
            {state === "active" && (
              <Button variant="secondary" onClick={invite.open}>
                <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("초대", "Invite")}
              </Button>
            )}
          </>
        )
      }
    >
      {/* An active team needs no sentence; any other state says what it
          means and links the one page it sends you to. */}
      {state !== "active" && (
        <Notice
          tone={state === "preparing" ? "neutral" : "warning"}
          action={
            // The first-run list below carries the same links.
            !(starting && state === "preparing") && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {state === "preparing" ? (
                status.allowedActions.billing && (
                  <>
                    <Link className={link} href={`${base}/plan`}>
                      {held > 0 ? c("결제하기", "Pay") : c("플랜과 결제", "Plan and billing")}
                    </Link>
                    {held > 0 && (
                      <Link
                        className={link}
                        href={`/start?step=invite&intent=team&workspace=${workspace.id}`}
                      >
                        {c("초대 명단 보기", "See who is invited")}
                      </Link>
                    )}
                  </>
                )
              ) : (
                <Link className={link} href={`${base}/status`}>
                  {c("이용 상태", "Team status")}
                </Link>
              )}
            </span>
            )
          }
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StateBadge state={state} />
            <span>
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
          </span>
        </Notice>
      )}
      {state === "active" && status.allowedActions.billing && (
        <DemoStorage workspaceId={workspace.id} />
      )}
      {starting && next && (
        <div className="flex max-w-sm flex-col items-start gap-3">
          <ProgressTracker title={c("다음 할 일", "Next steps")} steps={firstRun} current={next} />
          {next === "pay" ? (
            status.allowedActions.billing && (
              <Link className={buttonClass()} href={`${base}/plan`}>{c("결제하기", "Pay")}</Link>
            )
          ) : next === "invite" ? (
            state === "active" ? (
              <Button onClick={invite.open}>{c("팀원 초대", "Invite people")}</Button>
            ) : (
              <Link className={buttonClass()} href={startHref({ step: "invite", workspace: workspace.id, intent: "team", next: null }, lang)}>
                {c("팀원 초대", "Invite people")}
              </Link>
            )
          ) : (
            <Link className={buttonClass()} href={startHref({ step: "app", workspace: workspace.id, intent: null, next: null }, lang)}>
              {c("앱 설치하기", "Get the app")}
            </Link>
          )}
        </div>
      )}
      <OwnershipOffer />
      {error && <B2bError code={error} retry={() => void load()} />}
      {!data && !error && <TeamLoading />}
      {data && readable && watch.length > 0 && (
        <Section title={c("확인할 영상", "To watch")} count={watch.length}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
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
                  <Poster
                    url={w.posterUrl}
                    className={posterLinkClass}
                    badge={
                      w.reason === "approval" ? (
                        <Badge tone="warning" dot>
                          {c("승인 요청", "Approve")}
                        </Badge>
                      ) : (
                        <Badge>
                          {w.reason === "version"
                            ? c(`새 버전 v${w.ordinal}`, `New v${w.ordinal}`)
                            : w.reason === "comment"
                              ? c(`코멘트 ${w.comments}`, `${w.comments} comment${w.comments > 1 ? "s" : ""}`)
                              : c("결정됨", "Decided")}
                        </Badge>
                      )
                    }
                  />
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
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
              {data.projects.items.map((p) => (
                <li key={p.id}>
                  <Link href={projectLink(p.id)} className="group block outline-none">
                    <Poster url={p.posterUrl} icon={Folder} className={posterLinkClass}>
                      {!!p.unread && (
                        <span className="absolute right-2 top-2 size-2 rounded-full bg-accent ring-2 ring-background">
                          <span className="sr-only">{c("새 소식", "New")}</span>
                        </span>
                      )}
                      {p.visibility === "private" && (
                        <span className="absolute bottom-2 left-2 grid size-6 place-items-center rounded-md border border-border bg-background/90 text-foreground">
                          <Lock size={12} strokeWidth={2} aria-label={c("비공개", "Private")} />
                        </span>
                      )}
                    </Poster>
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
            <EmptyState
              icon={FolderOpen}
              title={c(
                "참여한 프로젝트가 없습니다. 앱에서 공유하면 여기에 나타나요.",
                "No projects yet. What you share from the app shows up here.",
              )}
            />
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
      {/* My seat is said only when it needs saying — waiting, on its way
          out, or an editing member without one. Periods are billing and live
          on 플랜과 결제; devices show only once one is registered, because a
          full device cap is the one time a member must act here. */}
      {seatNotice && (
        <section aria-label={c("내 좌석", "My seat")} className="border-t border-border pt-6 text-[13px] text-muted">
          <p>
            {seatNotice}
            {status.allowedActions.manage && data?.seat === "none" && (
              <>
                {" "}
                <Link className={link} href={`${base}/members`}>
                  {c("멤버에서 좌석 켜기", "Turn it on in People")}
                </Link>
              </>
            )}
          </p>
        </section>
      )}
      {readable && <MyDevices />}
      {!status.allowedActions.manage && <LeaveTeam />}
      <Dialog state={invite} title={c("멤버 초대", "Invite people")}>
        <InviteForm onSent={() => undefined} />
      </Dialog>
    </TeamShell>
  );
}
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
      className="hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex"
      aria-label={c(`멤버 ${people.length}명`, `${people.length} members`)}
    >
      <AvatarStack people={people.map((p) => ({ id: p.userId, name: p.name || p.email }))} max={4} size={28} />
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
    <section aria-label={title}>
      <CardHeader title={title} count={count} action={action} />
      {children}
    </section>
  );
}
