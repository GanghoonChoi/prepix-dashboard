"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
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
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { userService, type Profile } from "@/lib/api/services/user.service";
import { primaryClass, secondaryClass } from "@/components/workspaces/shared";
import { CloudEntry } from "@/components/workspaces/cloud-entry";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";
import {
  InviteStep,
  NameStep,
  PayStep,
  ProfileStep,
  UseStep,
} from "./steps";

type Row = WorkspaceList["workspaces"][number];

/**
 * First run, for both kinds of account (spec:
 * docs/plans/onboarding-renewal-design-2026-10-08.md). One sequence; the
 * answer to "how will you use Prepix" only decides whether the team steps —
 * invite and pay — follow the name.
 */
export function StartExperience() {
  const { lang, t } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [state, setState] = useState<StartState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [list, setList] = useState<WorkspaceList | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
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
      .catch(() => undefined);
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

  function navigate(next: StartState) {
    window.history.pushState(null, "", startHref(next, lang));
    setState(next);
    window.scrollTo({ top: 0 });
  }

  const site = `https://www.prepix.ai${ko ? "/ko" : ""}`;
  if (!state)
    return (
      <main className="p-10" role="status">
        {copy("Loading your next step", "다음 단계를 불러오는 중")}
      </main>
    );
  const target = startHref(state, lang);

  const rows = personalFirst(list?.workspaces ?? []);
  const personal: Row | undefined = rows.find(isPersonal);
  // An explicit `?workspace=` (the team made here) wins; otherwise the
  // account's own space, which sorts first.
  const workspace: Row | undefined =
    rows.find((row) => row.id === state.workspace) ?? rows[0];
  const pending = list?.pendingInvitationCount ?? list?.invitations.length ?? 0;
  const intent: Intent | null =
    state.intent ?? (profile?.useType as Intent | null | undefined) ?? null;
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
  const go = (next: Partial<StartState>) => navigate({ ...state, ...next });
  const afterName = () =>
    state.next === "plan"
      ? window.location.assign("/dashboard/plan")
      : go({ step: "app" });
  const label: Record<StartStep, string> = {
    join: copy("Join", "참여"),
    use: copy("How you'll use it", "사용 방식"),
    profile: copy("About you", "소개"),
    workspace: copy("Workspace", "워크스페이스"),
    invite: copy("Invite", "초대"),
    pay: copy("Pay", "결제"),
    app: copy("Open the app", "앱 열기"),
    edit: copy("First edit", "첫 편집"),
  };
  const heading: Record<StartStep, [string, string]> = {
    join: ["You have been invited", "초대를 받았습니다"],
    use: ["How will you use Prepix?", "Prepix를 어떻게 쓰실 건가요?"],
    profile: ["Tell us a little about your work", "어떤 일을 하시나요?"],
    workspace:
      intent === "team"
        ? ["Create your team workspace", "팀 워크스페이스를 만드세요"]
        : ["Name your workspace", "워크스페이스 이름을 정하세요"],
    invite: ["Invite your team", "함께할 팀원을 초대하세요"],
    pay: ["Review seats and pay", "좌석을 확인하고 결제하세요"],
    app: ["Open Prepix on your computer", "컴퓨터에서 Prepix를 여세요"],
    edit: ["Make your first edit", "첫 편집을 만들어 보세요"],
  };
  const intro: Record<StartStep, [string, string]> = {
    join: [
      "Someone has already made a space for you. Joining it puts your work alongside theirs.",
      "이미 만들어 둔 공간에 초대받았습니다. 참여하면 동료와 같은 곳에서 작업하게 됩니다.",
    ],
    use: [
      "Only the next steps change. You can make a team any time.",
      "답에 따라 다음 단계만 달라집니다. 나중에 언제든 팀을 만들 수 있어요.",
    ],
    profile: [
      "Only used to tailor what we show you. Skip if you like.",
      "더 맞는 안내를 위해서만 씁니다. 건너뛰어도 됩니다.",
    ],
    workspace:
      intent === "team"
        ? [
            "Your team works here together. You stay the owner; your own space is kept too.",
            "팀이 함께 쓰는 공간입니다. 만든 사람이 소유자가 되고, 개인 공간도 그대로 남습니다.",
          ]
        : [
            "Your own space, made with your account. Rename it if you like.",
            "계정과 함께 만들어진 내 공간입니다. 원하면 이름을 바꾸세요.",
          ],
    invite: [
      "Invitations go out the moment payment completes.",
      "결제가 끝나는 순간 초대 메일이 발송됩니다.",
    ],
    pay: [
      "Seats are you plus everyone you invited. Payment happens on the team's plan page.",
      "좌석은 나와 초대한 팀원 수입니다. 결제는 팀 플랜 화면에서 진행됩니다.",
    ],
    app: [
      "Editing happens in the desktop app, on your computer. Your work stays local.",
      "편집은 컴퓨터의 데스크톱 앱에서 합니다. 작업물은 로컬에 저장됩니다.",
    ],
    edit: [
      "Keep this page open if you need the next step. Downloading does not require an account.",
      "다음 단계가 필요할 때 이 페이지로 돌아오세요. 다운로드에는 계정이 필요하지 않습니다.",
    ],
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
        <a href={site} aria-label="Prepix">
          <Lockup />
        </a>
        <Link
          className={secondaryClass}
          href={signedIn ? "/dashboard" : loginHref({ returnTo: target, lang })}
        >
          {copy(
            signedIn ? "Your account" : "Sign in",
            signedIn ? "내 계정" : "로그인",
          )}
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10 sm:py-16">
        {step === "edit" && (
          <button
            className="flex items-center gap-2 text-sm text-muted"
            onClick={() => go({ step: "app" })}
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            {copy("Installation help", "설치 안내 다시 보기")}
          </button>
        )}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">
            {copy("Get started with Prepix", "Prepix 시작하기")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight break-keep text-balance sm:text-4xl">
            {copy(...heading[step])}
          </h1>
          <p className="text-sm leading-7 text-muted">{copy(...intro[step])}</p>
        </div>

        {signedIn && step !== "edit" && (
          <ol
            className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
            aria-label={copy("Getting started steps", "시작 단계")}
          >
            {sequence.map((entry, index) => (
              <li
                key={entry}
                aria-current={entry === step ? "step" : undefined}
                className={
                  entry === step ? "font-medium text-foreground" : undefined
                }
              >
                {index + 1}. {label[entry]}
              </li>
            ))}
          </ol>
        )}

        {!signedIn ? (
          <section className="space-y-5 rounded-lg border border-border p-6">
            <h2 className="font-medium">
              {copy("First, connect your account", "먼저 계정을 연결하세요")}
            </h2>
            <p className="text-sm leading-6 text-muted">
              {copy(
                "Your workspace is made with your account. If a teammate invited you, use the address they invited.",
                "계정을 만들면 워크스페이스가 함께 준비됩니다. 팀원이 초대했다면 초대받은 이메일을 사용하세요.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                className={primaryClass}
                href={signupHref({ returnTo: target, lang })}
              >
                {copy("Create account", "계정 만들기")}
              </Link>
              <Link
                className={secondaryClass}
                href={loginHref({ returnTo: target, lang })}
              >
                {copy("I have an account", "기존 계정으로 로그인")}
              </Link>
            </div>
          </section>
        ) : status === "loading" ? (
          <p role="status" className="text-sm text-muted">
            {copy("Loading your workspace", "워크스페이스를 불러오는 중")}
          </p>
        ) : status === "error" ? (
          <section className="space-y-4 rounded-lg border border-border p-6">
            <p role="alert" className="text-sm leading-6">
              {copy(
                "We could not reach your workspace. Nothing is lost — try again, or go straight to the app.",
                "워크스페이스를 불러오지 못했습니다. 잃어버린 것은 없습니다. 다시 시도하거나 앱으로 바로 갈 수 있습니다.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryClass}
                onClick={() => setAttempt((value) => value + 1)}
              >
                {copy("Try again", "다시 시도")}
              </button>
              <button
                className={secondaryClass}
                onClick={() => go({ step: "app" })}
              >
                {copy("Open the app", "앱 열기")}
              </button>
            </div>
          </section>
        ) : provisioning ? (
          // Deliberately not a create button. Every account has a workspace; an
          // empty list means the server has not finished, and asking the user
          // to fix that by making one is how you end up with two.
          <section className="space-y-4 rounded-lg border border-border p-6">
            <p role="status" className="text-sm leading-6">
              {copy(
                "Your workspace is being prepared. This usually takes a moment.",
                "워크스페이스를 준비하고 있습니다. 보통 잠시면 끝납니다.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryClass}
                onClick={() => setAttempt((value) => value + 1)}
              >
                {copy("Check again", "다시 확인")}
              </button>
              <button
                className={secondaryClass}
                onClick={() => go({ step: "app" })}
              >
                {copy("Open the app meanwhile", "먼저 앱 열기")}
              </button>
            </div>
          </section>
        ) : step === "join" && list ? (
          <JoinStep
            list={list}
            onSkip={() => go({ step: intent ? "profile" : "use" })}
          />
        ) : step === "use" ? (
          <UseStep onPick={(picked) => go({ step: "profile", intent: picked })} />
        ) : step === "profile" ? (
          <ProfileStep onDone={() => go({ step: "workspace" })} />
        ) : step === "workspace" && personal ? (
          intent === "team" && team ? (
            // Back here after the team exists: never a second create form.
            <section className="space-y-5 rounded-lg border border-border p-6">
              <p className="font-medium">{team.name}</p>
              <button
                className={primaryClass}
                onClick={() => go({ step: "invite", workspace: team.id })}
              >
                {copy("Continue", "계속하기")}
              </button>
            </section>
          ) : (
            <NameStep
              intent={intent ?? "personal"}
              personal={personal}
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
          )
        ) : step === "invite" && team ? (
          <InviteStep
            workspaceId={team.id}
            self={String(profile?.email ?? "")}
            onNext={() => go({ step: "pay", workspace: team.id })}
          />
        ) : step === "pay" && team ? (
          <PayStep
            workspaceId={team.id}
            onLater={() =>
              window.location.assign(`/dashboard/workspaces/${team.id}`)
            }
          />
        ) : null}

        {signedIn && (step === "app" || step === "edit") && (
          <>
            {workspace && step === "app" && (
              <aside className="space-y-2 rounded-lg border border-border bg-surface p-5">
                <p className="font-medium">
                  {isPersonal(workspace) ? t("team.kind.personal") : workspace.name}
                </p>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "Edits in the desktop app stay on your computer. Manage people and shared originals here on the web.",
                    "앱에서 편집한 내용은 컴퓨터에 남습니다. 멤버와 공유 원본은 웹에서 관리합니다.",
                  )}
                </p>
                <Link
                  className="text-sm underline"
                  href={`/dashboard/workspaces/${workspace.id}`}
                >
                  {copy("Manage workspace", "워크스페이스 관리")}
                </Link>
                {!workspace.b2bEnrolled && (
                  <CloudEntry workspaceId={workspace.id} />
                )}
              </aside>
            )}
            {step === "app" ? (
              <section className="space-y-6 rounded-lg border border-border p-6">
                <div className="flex flex-wrap gap-3">
                  <a
                    className={primaryClass}
                    href={`${site}/download?${new URLSearchParams({
                      returnTo: new URL(
                        startHref({ ...state, step: "edit" }, lang),
                        window.location.origin,
                      ).toString(),
                    })}`}
                  >
                    <Download size={16} strokeWidth={1.5} aria-hidden="true" />
                    {copy(
                      "Download and installation guide",
                      "다운로드와 설치 안내",
                    )}
                  </a>
                  <button
                    className={secondaryClass}
                    onClick={() => go({ step: "edit" })}
                  >
                    {copy(
                      "I have the app — next steps",
                      "앱이 있어요 · 다음 단계",
                    )}
                  </button>
                </div>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "On a phone? Finish here, then open this same address on your Mac or Windows computer. If installation is restricted, ask your IT administrator to install the official app.",
                    "휴대폰에서는 여기까지 마친 뒤 Mac 또는 Windows 컴퓨터에서 이 주소를 다시 여세요. 회사 컴퓨터에서 설치가 제한되어 있다면 IT 관리자에게 공식 앱 설치를 요청하세요.",
                  )}
                </p>
              </section>
            ) : (
              <section className="space-y-6 rounded-lg border border-border p-6">
                <ol className="space-y-6">
                  {[
                    [
                      copy("Create a project", "프로젝트 만들기"),
                      copy(
                        "Open Prepix and choose New project. Choose the editing workflow that fits your video.",
                        "Prepix를 열고 새 프로젝트를 선택하세요. 영상에 맞는 편집 방식을 고릅니다.",
                      ),
                    ],
                    [
                      copy("Import a short clip", "짧은 영상 불러오기"),
                      copy(
                        "Start with one clip on your computer. Importing into a local project does not share it with your workspace.",
                        "컴퓨터에 있는 영상 한 개로 시작하세요. 로컬 프로젝트로 불러오는 것만으로 워크스페이스에 공유되지는 않습니다.",
                      ),
                    ],
                    [
                      copy(
                        "Connect your account when you use AI",
                        "AI를 사용할 때 계정 연결하기",
                      ),
                      copy(
                        "If the app offers Continue in browser, use your website account and confirm the email. Older apps can use the same email or Google account directly.",
                        "앱에 브라우저에서 계속하기가 보이면 웹 계정의 이메일을 확인하고 연결하세요. 이전 앱에서는 동일한 이메일 또는 Google 계정으로 로그인할 수 있습니다.",
                      ),
                    ],
                    [
                      copy("Review the edit", "편집 결과 확인하기"),
                      copy(
                        "Follow the project workflow, then play the result. Change a cut or undo it before exporting.",
                        "프로젝트의 안내에 따라 편집한 뒤 결과를 재생하세요. 컷을 수정하거나 되돌린 후 내보낼 수 있습니다.",
                      ),
                    ],
                  ].map(([title, body], i) => (
                    <li key={title}>
                      <h2 className="text-sm font-medium">
                        {i + 1}. {title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {body}
                      </p>
                    </li>
                  ))}
                </ol>
                <a className={secondaryClass} href={`${site}/contact`}>
                  {copy("Get help", "도움 요청")}
                </a>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Step 1 — rendered only when `pendingInvitationCount` says there is something
 * to join. Accepting happens on the workspaces page, which already handles the
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
  const { lang, t } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const count = list.pendingInvitationCount ?? list.invitations.length;
  return (
    <section className="space-y-5 rounded-lg border border-border p-6">
      {list.invitations.length > 0 ? (
        <ul className="divide-y divide-border">
          {list.invitations.map((invite) => (
            <li key={invite.id} className="py-3 first:pt-0">
              <p className="break-words text-sm font-medium">
                {invite.workspaceName}
              </p>
              <p className="mt-1 text-xs text-muted">
                {t(`team.role.${invite.role}`)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        // A verified account gets the rows above. An unverified one gets the
        // count and nothing else — deliberately, so an unverified address
        // cannot learn which teams invited it.
        <p className="text-sm leading-6">
          {t("team.verifyPending", { count })}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link className={primaryClass} href="/dashboard/workspaces">
          {copy("Review invitations", "초대 확인하기")}
        </Link>
        <button className={secondaryClass} onClick={onSkip}>
          {copy("Not now", "나중에 하기")}
        </button>
      </div>
    </section>
  );
}
