"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Lockup } from "@/components/brand";
import { useI18n } from "@/lib/i18n/context";
import { loginHref, signupHref } from "@/lib/auth-entry";
import {
  readStartState,
  startHref,
  type Intent,
  type StartState,
  type StartStep,
} from "@/lib/onboarding";
import { homeFor } from "@/lib/home";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { userService, type Profile } from "@/lib/api/services/user.service";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";
import {
  AppStep,
  EditStep,
  InviteStep,
  NameStep,
  PayStep,
  ProfileStep,
  StepActions,
  UseStep,
  primaryButton,
  quietButton,
  useCopy,
  type PreviewUpdate,
} from "./steps";
import { StartPreview, type PreviewState } from "./preview";

type Row = WorkspaceList["workspaces"][number];

/**
 * First run, for both kinds of account (spec:
 * docs/plans/onboarding-renewal-design-2026-10-08.md). One sequence; the
 * answer to "how will you use Prepix" only decides whether the team steps —
 * invite and pay — follow the name.
 *
 * The frame follows Cal.com's open-source onboarding: one card, the question
 * on the left, a live drawing of the workspace on the right (hidden below
 * lg), progress as dots under the card.
 */
export function StartExperience() {
  const { lang } = useI18n();
  const copy = useCopy();
  const ko = lang === "ko";
  const [state, setState] = useState<StartState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [list, setList] = useState<WorkspaceList | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Until the profile answers, the step is unknown: a returning user would
  // otherwise see the first question flash before it is skipped.
  const [profileSettled, setProfileSettled] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  // What the preview draws while the left side is still being filled in.
  const [hover, setHover] = useState<Intent | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreviewUpdate>({});
  const [home, setHome] = useState("/dashboard");
  // Whether the visitor arrived already having answered (the site's Business
  // button sends intent=team). Then "use" is not part of their sequence.
  const arrivedWithIntent = useRef<boolean | null>(null);

  useEffect(() => {
    const read = () => {
      const next = readStartState(window.location.search);
      arrivedWithIntent.current ??= next.intent !== null;
      setState(next);
      setAttempt((value) => value + 1);
      try {
        setSignedIn(
          !!(
            localStorage.getItem("accessToken") ||
            localStorage.getItem("refreshToken")
          ),
        );
      } catch {
        setSignedIn(false);
      }
    };
    read();
    // No `focus` listener: this page's whole job is to send people to the
    // desktop app and have them come back, and re-reading on every alt-tab
    // blanked the panel and refetched. History and cross-tab sign-in are the
    // only things that actually change what `read` returns.
    window.addEventListener("popstate", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await workspaceService.list();
    setList(next);
    setStatus("ready");
    return next;
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    setStatus("loading");
    void workspaceService
      .list()
      .then((next) => {
        if (!active) return;
        setList(next);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [signedIn, attempt]);

  // The profile only steers; failing to read it changes nothing but defaults.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void userService
      .getProfile()
      .then((value) => active && setProfile(value))
      .catch(() => undefined)
      .finally(() => active && setProfileSettled(true));
    return () => {
      active = false;
    };
  }, [signedIn]);

  // An answer that came from the site is saved once, the same as one given here.
  const urlIntent = state?.intent ?? null;
  useEffect(() => {
    if (!profile || profile.useType || !urlIntent) return;
    void userService.updateProfile({ useType: urlIntent }).catch(() => undefined);
  }, [profile, urlIntent]);

  const navigate = useCallback(
    (next: StartState) => {
      window.history.pushState(null, "", startHref(next, lang));
      setState(next);
      setDraftName(null);
      window.scrollTo({ top: 0 });
    },
    [lang],
  );

  const rows = personalFirst(list?.workspaces ?? []);
  const intent: Intent | null =
    state?.intent ?? (profile?.useType as Intent | null | undefined) ?? null;
  useEffect(() => {
    if (!signedIn) return;
    void homeFor(intent).then(setHome);
  }, [signedIn, intent, list]);

  const site = `https://www.prepix.ai${ko ? "/ko" : ""}`;
  const settling = signedIn && (status === "loading" || !profileSettled);
  if (!state)
    return (
      <main className="p-10" role="status">
        {copy("Loading your next step", "다음 단계를 불러오는 중")}
      </main>
    );
  const target = startHref(state, lang);

  const personal: Row | undefined = rows.find(isPersonal);
  // An explicit `?workspace=` (the team made here) wins; otherwise the
  // account's own space, which sorts first.
  const workspace: Row | undefined =
    rows.find((row) => row.id === state.workspace) ?? rows[0];
  const pending = list?.pendingInvitationCount ?? list?.invitations.length ?? 0;
  // "With my team" for someone who already runs one means that team, never a
  // second create form.
  const team: Row | undefined =
    workspace && !isPersonal(workspace)
      ? workspace
      : intent === "team"
        ? rows.find(
            (row) =>
              !isPersonal(row) && (row.role === "owner" || row.role === "admin"),
          )
        : undefined;
  // "No workspace yet" is a server still catching up, never a prompt to make
  // one. It is a waiting state with a retry, never a dead end.
  const provisioning = status === "ready" && !workspace;

  // The join offer only exists when there is something to join, and the first
  // question is only asked of someone who has not answered it.
  let step: StartStep = state.step;
  if (step === "join" && pending === 0) step = intent ? "profile" : "use";
  if (step === "use" && intent) step = "profile";
  if ((step === "invite" || step === "pay") && !team) step = "workspace";
  // Seats and held invitations are B2B team things; an older team has neither.
  if ((step === "invite" || step === "pay") && team?.b2bEnrolled === false)
    step = "app";
  const sequence: StartStep[] = [
    ...(pending > 0 ? (["join"] as StartStep[]) : []),
    ...(arrivedWithIntent.current ? [] : (["use"] as StartStep[])),
    "profile",
    "workspace",
    ...(intent === "team" ? (["invite", "pay"] as StartStep[]) : []),
    "app",
  ];
  const position = Math.max(
    0,
    sequence.indexOf(step === "edit" ? "app" : step),
  );
  const go = (next: Partial<StartState>) => navigate({ ...state, ...next });
  const afterName = () =>
    state.next === "plan"
      ? window.location.assign("/dashboard/plan")
      : go({ step: "app" });

  const heading: Record<StartStep, [string, string]> = {
    join: ["You've been invited", "초대가 도착했어요"],
    use: ["How will you use Prepix?", "Prepix를 어떻게 쓰실 건가요?"],
    profile: ["Tell us a bit about you", "어떤 일을 하시나요?"],
    workspace:
      intent === "team"
        ? ["Create your team workspace", "팀 워크스페이스를 만들어요"]
        : ["Name your workspace", "워크스페이스 이름을 정해 주세요"],
    invite: ["Invite your team", "팀원을 초대해 주세요"],
    pay: ["Review your plan", "결제 내용을 확인해 주세요"],
    app: ["Get the desktop app", "데스크톱 앱을 설치해 주세요"],
    edit: ["Make your first edit", "첫 편집을 해 볼까요?"],
  };
  const intro: Record<StartStep, [string, string]> = {
    join: [
      "A teammate already made a space for you. Join to work alongside them.",
      "동료가 만들어 둔 공간이 있어요. 참여하면 같은 곳에서 함께 작업해요.",
    ],
    use: [
      "We'll set things up to match. You can change this later.",
      "맞춤으로 준비해 드릴게요. 나중에 바꿀 수 있어요.",
    ],
    profile: [
      "Pick any that fit, or skip.",
      "해당하는 걸 골라 주세요. 건너뛰어도 괜찮아요.",
    ],
    workspace:
      intent === "team"
        ? [
            "Use your company or team name so teammates can find it. Your own space stays too.",
            "회사나 팀 이름이면 팀원이 찾기 쉬워요. 개인 공간도 그대로 남아요.",
          ]
        : [
            "Your projects live here. Rename it anytime.",
            "프로젝트가 모이는 곳이에요. 언제든 바꿀 수 있어요.",
          ],
    invite: [
      "Paste their emails. We'll send the invitations once you've paid.",
      "이메일을 붙여 넣어 주세요. 결제가 끝나면 초대 메일을 보내 드릴게요.",
    ],
    pay: [
      "Seats are you plus everyone you invited.",
      "좌석은 나와 초대한 팀원 수만큼이에요.",
    ],
    app: [
      "Editing happens in the app, on your computer. Sign in and your workspace is ready.",
      "편집은 컴퓨터의 앱에서 해요. 로그인하면 워크스페이스가 바로 열려요.",
    ],
    edit: [
      "Four steps to your first cut. Come back here anytime.",
      "네 단계면 첫 컷이 나와요. 필요할 때 이 페이지로 돌아오세요.",
    ],
  };

  const previewState: PreviewState = {
    intent: hover ?? intent,
    name:
      draftName ??
      ((hover ?? intent) === "team" ? (team?.name ?? "") : (personal?.name ?? "")),
    people: [String(profile?.email ?? "you"), ...(draft.people ?? [])],
    seats: (hover ?? intent) === "team" ? (draft.seats ?? null) : null,
    surface: step === "app" || step === "edit" ? "app" : "workspace",
  };

  let body: React.ReactNode = null;
  if (!signedIn)
    body = (
      <div className="space-y-6">
        <p className="text-sm leading-6 text-muted text-pretty">
          {copy(
            "Your workspace is made with your account. If a teammate invited you, use the address they invited.",
            "계정을 만들면 워크스페이스가 함께 준비돼요. 팀원이 초대했다면 초대받은 이메일로 가입해 주세요.",
          )}
        </p>
        <StepActions
          secondary={
            <Link className={quietButton} href={loginHref({ returnTo: target, lang })}>
              {copy("I have an account", "이미 계정이 있어요")}
            </Link>
          }
          primary={
            <Link className={primaryButton} href={signupHref({ returnTo: target, lang })}>
              {copy("Create account", "계정 만들기")}
            </Link>
          }
        />
      </div>
    );
  else if (settling)
    body = (
      <div className="space-y-3" role="status" aria-label={copy("Loading your workspace", "워크스페이스를 불러오는 중")}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-[10px] bg-surface-secondary" />
        ))}
      </div>
    );
  else if (status === "error" || provisioning)
    body = (
      <div className="space-y-6">
        <p role={status === "error" ? "alert" : "status"} className="text-sm leading-6">
          {status === "error"
            ? copy(
                "We couldn't reach your workspace. Nothing is lost — try again, or go straight to the app.",
                "워크스페이스를 불러오지 못했어요. 잃어버린 건 없으니 다시 시도하거나 앱으로 바로 가세요.",
              )
            : copy(
                "Your workspace is being prepared. This usually takes a moment.",
                "워크스페이스를 준비하고 있어요. 보통 잠깐이면 끝나요.",
              )}
        </p>
        <StepActions
          secondary={
            <button className={quietButton} onClick={() => go({ step: "app" })}>
              {copy("Open the app meanwhile", "먼저 앱 열기")}
            </button>
          }
          primary={
            <button className={primaryButton} onClick={() => setAttempt((value) => value + 1)}>
              {copy("Try again", "다시 시도")}
            </button>
          }
        />
      </div>
    );
  else if (step === "join" && list)
    body = (
      <JoinStep list={list} onSkip={() => go({ step: intent ? "profile" : "use" })} />
    );
  else if (step === "use")
    body = (
      <UseStep
        onHover={setHover}
        onPick={(picked) => {
          setHover(null);
          go({ step: "profile", intent: picked });
        }}
      />
    );
  else if (step === "profile") body = <ProfileStep onDone={() => go({ step: "workspace" })} />;
  else if (step === "workspace" && personal)
    body =
      intent === "team" && team ? (
        // Back here after the team exists: never a second create form.
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-[10px] bg-surface p-3">
            <span className="grid size-9 place-items-center rounded-lg bg-foreground font-semibold text-background">
              {team.name.trim()[0]?.toUpperCase()}
            </span>
            <span className="font-medium">{team.name}</span>
          </div>
          <StepActions
            primary={
              <button
                className={primaryButton}
                onClick={() => go({ step: "invite", workspace: team.id })}
              >
                {copy("Continue", "계속하기")}
              </button>
            }
          />
        </div>
      ) : (
        <NameStep
          key={intent ?? "personal"}
          intent={intent ?? "personal"}
          personal={personal}
          onName={setDraftName}
          onPersonal={() => {
            void reload().catch(() => undefined);
            afterName();
          }}
          onTeam={async (teamId) => {
            const next = await reload();
            if (!next.workspaces.some((row) => row.id === teamId))
              throw new Error("Team destination unavailable");
            go({ step: "invite", workspace: teamId });
          }}
        />
      );
  else if (step === "invite" && team)
    body = (
      <InviteStep
        workspaceId={team.id}
        self={String(profile?.email ?? "")}
        onPreview={setDraft}
        onNext={() => go({ step: "pay", workspace: team.id })}
      />
    );
  else if (step === "pay" && team)
    body = (
      <PayStep
        workspaceId={team.id}
        onPreview={setDraft}
        onPaid={() => go({ step: "app" })}
        onLater={() => window.location.assign(`/dashboard/workspaces/${team.id}`)}
      />
    );
  else if (step === "app")
    body = (
      <AppStep
        onInstalled={() => go({ step: "edit" })}
        guideHref={`${site}/download?${new URLSearchParams({
          returnTo: new URL(startHref({ ...state, step: "edit" }, lang), window.location.origin).toString(),
        })}`}
      />
    );
  else if (step === "edit") body = <EditStep homeHref={home} helpHref={`${site}/contact`} />;

  const canGoBack = signedIn && position > 0 && !settling;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col bg-surface text-foreground">
        {/* A line grid that fades out under the card (Dub). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:60px_60px] [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-60"
        />
        <header className="relative mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 py-5 sm:px-6">
          <a href={site} aria-label="Prepix" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
            <Lockup />
          </a>
          <Link
            className="text-sm text-muted transition-colors hover:text-foreground"
            href={signedIn ? home : loginHref({ returnTo: target, lang })}
          >
            {copy(signedIn ? "Go to dashboard" : "Sign in", signedIn ? "대시보드" : "로그인")}
          </Link>
        </header>

        <main className="relative mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 pb-10 sm:px-6">
          <div className="grid overflow-hidden lg:flex-1 rounded-2xl bg-background shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.08)] lg:min-h-[640px] lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
            <section className="flex flex-col px-6 py-7 sm:px-10 sm:py-9">
              <div className="h-8">
                {canGoBack && (
                  <button
                    onClick={() => window.history.back()}
                    className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                  >
                    <ArrowLeft size={14} strokeWidth={1.5} />
                    {copy("Back", "뒤로")}
                  </button>
                )}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${step}-${status}-${signedIn}-${settling}`}
                  className="flex flex-1 flex-col py-6 lg:justify-center lg:py-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="mx-auto w-full max-w-[440px] space-y-8">
                    {settling ? (
                      <div className="space-y-3" aria-hidden="true">
                        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-surface-secondary" />
                        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-secondary" />
                      </div>
                    ) : (
                    <div className="space-y-2">
                      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px] sm:leading-9">
                        {signedIn
                          ? copy(...heading[step])
                          : copy("First, connect your account", "먼저 계정을 연결해 주세요")}
                      </h1>
                      {signedIn && (
                        <p className="text-[15px] leading-6 text-muted text-pretty">
                          {copy(...intro[step])}
                        </p>
                      )}
                    </div>
                    )}
                    {body}
                  </div>
                </motion.div>
              </AnimatePresence>
            </section>
            <StartPreview state={previewState} />
          </div>

          {signedIn && step !== "edit" && (
            <ol
              className="mt-6 flex items-center justify-center gap-2"
              aria-label={copy("Getting started steps", "시작 단계")}
            >
              {sequence.map((entry, index) => (
                <li
                  key={entry}
                  aria-current={index === position ? "step" : undefined}
                  aria-label={copy(`Step ${index + 1} of ${sequence.length}`, `${sequence.length}단계 중 ${index + 1}단계`)}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                    index === position
                      ? "w-5 bg-foreground"
                      : index < position
                        ? "w-1.5 bg-muted"
                        : "w-1.5 bg-surface-tertiary"
                  }`}
                />
              ))}
            </ol>
          )}
        </main>
      </div>
    </MotionConfig>
  );
}

/**
 * Rendered only when `pendingInvitationCount` says there is something to
 * join. Accepting happens on the workspaces page, which already handles the
 * email-mismatch, expiry and revocation cases; this is the offer, not a second
 * copy of that.
 */
function JoinStep({
  list,
  onSkip,
}: {
  list: WorkspaceList;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const copy = useCopy();
  const count = list.pendingInvitationCount ?? list.invitations.length;
  return (
    <div className="space-y-6">
      {list.invitations.length > 0 ? (
        <ul className="divide-y divide-border rounded-[10px] bg-surface px-3">
          {list.invitations.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 py-3">
              <span className="grid size-8 place-items-center rounded-lg bg-foreground text-sm font-semibold text-background">
                {invite.workspaceName.trim()[0]?.toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{invite.workspaceName}</span>
                <span className="block text-[13px] text-muted">{t(`team.role.${invite.role}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        // A verified account gets the rows above. An unverified one gets the
        // count and nothing else — deliberately, so an unverified address
        // cannot learn which teams invited it.
        <p className="text-sm leading-6">{t("team.verifyPending", { count })}</p>
      )}
      <StepActions
        secondary={
          <button className={quietButton} onClick={onSkip}>
            {copy("Not now", "나중에 하기")}
          </button>
        }
        primary={
          <Link className={primaryButton} href="/dashboard/workspaces">
            {copy("Review invitations", "초대 확인하기")}
          </Link>
        }
      />
    </div>
  );
}
