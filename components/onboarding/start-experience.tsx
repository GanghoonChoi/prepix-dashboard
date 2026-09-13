"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Film, Users } from "lucide-react";
import { Lockup } from "@/components/brand";
import { useI18n } from "@/lib/i18n/context";
import { loginHref, signupHref } from "@/lib/auth-entry";
import { readStartState, startHref, type StartState } from "@/lib/onboarding";
import {
  workspaceService,
  type WorkspaceDetail,
  type Capabilities,
} from "@/lib/api/services/workspace.service";
import { primaryClass, secondaryClass } from "@/components/workspaces/shared";
import { CloudEntry } from "@/components/workspaces/cloud-entry";

export function StartExperience() {
  const { lang } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [state, setState] = useState<StartState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [team, setTeam] = useState<WorkspaceDetail | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [teamStatus, setTeamStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const read = () => {
      setState(readStartState(window.location.search));
      setTeam(null);
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
    window.addEventListener("popstate", read);
    window.addEventListener("focus", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const workspace = state?.workspace;
  const mode = state?.mode;
  useEffect(() => {
    if (!signedIn || mode !== "team") return;
    let active = true;
    // Invalidate the previous account/workspace while the new server check runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeamStatus("loading");
    setTeam(null);
    const load = async () => {
      try {
        const caps = await workspaceService.capabilities();
        const detail =
          caps.enabled && workspace
            ? await workspaceService.detail(workspace)
            : null;
        if (active) {
          setCapabilities(caps);
          setTeam(detail);
          setTeamStatus("ready");
        }
      } catch {
        if (active) setTeamStatus("error");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [signedIn, mode, workspace, attempt]);
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
  const teamReady =
    state.mode === "team" &&
    signedIn &&
    teamStatus === "ready" &&
    !!team &&
    team.workspace.id === state.workspace;
  const choosing = state.mode === "choose";
  const setupTeam = state.mode === "team" && !teamReady;
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
        {!choosing && (
          <button
            className="flex items-center gap-2 text-sm text-muted"
            onClick={() =>
              navigate({ mode: "choose", step: "install", workspace: null })
            }
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            {copy("Ways to get started", "시작 방법 선택")}
          </button>
        )}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">
            {copy("Get started with Prepix", "Prepix 시작하기")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight break-keep text-balance sm:text-4xl">
            {choosing
              ? copy("Start with your first video", "첫 영상으로 시작하세요")
              : setupTeam
                ? copy("Set up your team", "함께 사용할 팀을 준비하세요")
                : state.step === "install"
                  ? copy(
                      "Bring Prepix to your computer",
                      "컴퓨터에서 Prepix를 실행하세요",
                    )
                  : copy("Make your first edit", "첫 편집을 만들어 보세요")}
          </h1>
          <p className="text-sm leading-7 text-muted">
            {choosing
              ? copy(
                  "Edit on your own, or prepare a workspace for your team. You can add a team later.",
                  "혼자 편집하거나, 팀이 사용할 워크스페이스를 준비할 수 있습니다. 팀은 나중에도 만들 수 있습니다.",
                )
              : setupTeam
                ? copy(
                    "Create one workspace. Invite people now or after setup. Team preview does not start a paid subscription.",
                    "워크스페이스 하나로 시작합니다. 초대는 지금 하거나 나중에 할 수 있습니다. 팀 미리보기는 유료 구독을 시작하지 않습니다.",
                  )
                : copy(
                    "Keep this page open if you need the next step. Downloading does not require an account.",
                    "다음 단계가 필요할 때 이 페이지로 돌아오세요. 다운로드에는 계정이 필요하지 않습니다.",
                  )}
          </p>
        </div>
        {choosing ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["personal", "team"] as const).map((choice) => (
                <button
                  key={choice}
                  className="group space-y-4 rounded-xl border border-border bg-surface p-6 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-4"
                  onClick={() =>
                    navigate({ mode: choice, step: "install", workspace: null })
                  }
                >
                  {choice === "personal" ? (
                    <Film strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Users strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <h2 className="font-medium">
                    {choice === "personal"
                      ? copy("Start editing", "내 영상 편집하기")
                      : copy("Start with a team", "팀과 함께 시작하기")}
                  </h2>
                  <p className="text-sm leading-6 text-muted">
                    {choice === "personal"
                      ? copy(
                          "Install, import footage, and make an edit. Sign in when you use AI.",
                          "설치 후 영상을 불러오고 편집합니다. AI를 사용할 때 로그인하세요.",
                        )
                      : copy(
                          "Create or join a workspace and bring your team together.",
                          "워크스페이스를 만들거나 참여하고 함께할 동료를 초대합니다.",
                        )}
                  </p>
                  <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">
              {copy(
                "Invited by a teammate? Open the invitation link from your email to join the right workspace.",
                "팀원이 초대했나요? 이메일의 초대 링크를 열면 해당 워크스페이스로 바로 이어집니다.",
              )}
            </p>
          </>
        ) : setupTeam ? (
          <section className="space-y-5 rounded-xl border border-border p-6">
            {!signedIn ? (
              <>
                <h2 className="font-medium">
                  {copy(
                    "First, connect your account",
                    "먼저 계정을 연결하세요",
                  )}
                </h2>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "Use the email your team invited. There is no need to create another workspace when joining an invitation.",
                    "초대받은 이메일로 로그인하세요. 초대로 참여할 때는 새 워크스페이스를 만들 필요가 없습니다.",
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
              </>
            ) : teamStatus === "loading" ? (
              <p role="status">
                {copy(
                  "Checking your workspace access",
                  "워크스페이스 접근 권한을 확인하는 중",
                )}
              </p>
            ) : teamStatus === "error" ? (
              <>
                <p role="alert" className="text-sm">
                  {copy(
                    "Could not load workspace access. Try again, or continue editing locally.",
                    "워크스페이스 정보를 불러오지 못했습니다. 다시 시도하거나 로컬 편집을 계속할 수 있습니다.",
                  )}
                </p>
                <button
                  className={secondaryClass}
                  onClick={() => setAttempt(attempt + 1)}
                >
                  {copy("Try again", "다시 시도")}
                </button>
              </>
            ) : capabilities?.enabled ? (
              <>
                <h2 className="font-medium">
                  {copy(
                    "Choose your workspace",
                    "사용할 워크스페이스를 선택하세요",
                  )}
                </h2>
                <p className="text-sm text-muted">
                  {copy(
                    "Existing teams and invitations appear together. Create a workspace only if your team needs a new one.",
                    "참여 중인 팀과 초대를 함께 확인합니다. 새 팀이 필요할 때만 워크스페이스를 만드세요.",
                  )}
                </p>
                <Link className={primaryClass} href="/dashboard/workspaces">
                  {copy("Continue to workspaces", "워크스페이스로 계속")}
                </Link>
              </>
            ) : (
              <>
                <h2 className="font-medium">
                  {copy(
                    "Team preview is not enabled for this service yet",
                    "아직 팀 미리보기가 열리지 않았습니다",
                  )}
                </h2>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "You can start editing locally or contact us about your team. Your personal plan stays the same.",
                    "로컬 편집을 먼저 시작하거나 팀 도입을 문의할 수 있습니다. 개인 플랜은 그대로 유지됩니다.",
                  )}
                </p>
                <a className={secondaryClass} href={`${site}/contact`}>
                  {copy("Contact us", "팀 도입 문의")}
                </a>
              </>
            )}
            <button
              className="block text-sm underline underline-offset-4"
              onClick={() =>
                navigate({ mode: "personal", step: "install", workspace: null })
              }
            >
              {copy(
                "Start editing on my computer",
                "내 컴퓨터에서 편집 먼저 시작",
              )}
            </button>
          </section>
        ) : (
          <>
            {teamReady && (
              <aside className="space-y-2 rounded-xl border border-border bg-surface p-5">
                <p className="font-medium">{team.workspace.name}</p>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "Workspace membership is ready. Edits in the desktop app remain local. Manage shared originals in team projects when enabled; editing changes are not automatically published to your team.",
                    "워크스페이스에 참여했습니다. 앱의 편집 내용은 로컬에 저장됩니다. 활성화된 팀 프로젝트에서 원본을 관리할 수 있으며, 앱에서 수정한 내용이 팀에 자동으로 발행되지는 않습니다.",
                  )}
                </p>
                <Link
                  className="text-sm underline"
                  href={`/dashboard/workspaces/${team.workspace.id}`}
                >
                  {copy("Manage workspace", "워크스페이스 관리")}
                </Link>
                <CloudEntry workspaceId={team.workspace.id} />
              </aside>
            )}
            <ol
              className="flex flex-wrap gap-6 text-sm text-muted"
              aria-label={copy("Getting started steps", "시작 단계")}
            >
              <li aria-current={state.step === "install" ? "step" : undefined}>
                {copy("1. Install and open", "1. 설치와 실행")}
              </li>
              <li aria-current={state.step === "edit" ? "step" : undefined}>
                {copy("2. First edit", "2. 첫 편집")}
              </li>
            </ol>
            {state.step === "install" ? (
              <section className="space-y-6 rounded-xl border border-border p-6">
                <div className="flex flex-wrap gap-3">
                  <a
                    className={primaryClass}
                    href={`${site}/download?${new URLSearchParams({ returnTo: new URL(startHref({ ...state, step: "edit" }, lang), window.location.origin).toString() })}`}
                  >
                    <Download size={16} strokeWidth={1.5} aria-hidden="true" />
                    {copy(
                      "Download and installation guide",
                      "다운로드와 설치 안내",
                    )}
                  </a>
                  <button
                    className={secondaryClass}
                    onClick={() => navigate({ ...state, step: "edit" })}
                  >
                    {copy(
                      "I have the app — next steps",
                      "앱이 있어요 · 다음 단계",
                    )}
                  </button>
                </div>
                <p className="text-sm leading-6 text-muted">
                  {copy(
                    "On a phone? Finish team setup here, then open this same address on your Mac or Windows computer. If installation is restricted, ask your IT administrator to install the official app.",
                    "휴대폰에서는 팀 설정을 마친 뒤 Mac 또는 Windows 컴퓨터에서 이 주소를 다시 여세요. 회사 컴퓨터에서 설치가 제한되어 있다면 IT 관리자에게 공식 앱 설치를 요청하세요.",
                  )}
                </p>
              </section>
            ) : (
              <section className="space-y-6 rounded-xl border border-border p-6">
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
                <div className="flex flex-wrap gap-3">
                  <button
                    className={secondaryClass}
                    onClick={() => navigate({ ...state, step: "install" })}
                  >
                    {copy("Installation help", "설치 안내 다시 보기")}
                  </button>
                  <a className={secondaryClass} href={`${site}/contact`}>
                    {copy("Get help", "도움 요청")}
                  </a>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
