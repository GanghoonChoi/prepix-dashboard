"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Download, Pencil } from "lucide-react";
import { Lockup } from "@/components/brand";
import { useI18n } from "@/lib/i18n/context";
import { loginHref, signupHref } from "@/lib/auth-entry";
import {
  readStartState,
  startHref,
  type StartState,
  type StartStep,
} from "@/lib/onboarding";
import {
  workspaceService,
  type WorkspaceDetail,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import {
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { CloudEntry } from "@/components/workspaces/cloud-entry";
import { InviteForm } from "@/components/workspaces/invite-form";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { isPersonal, personalFirst, seatFigures } from "@/lib/workspaces/kind";

type Row = WorkspaceList["workspaces"][number];

export function StartExperience() {
  const { lang, t } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [state, setState] = useState<StartState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [list, setList] = useState<WorkspaceList | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const read = () => {
      setState(readStartState(window.location.search));
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
    try {
      setList(await workspaceService.list());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Every authenticated account is provisioned a personal space. More than one
  // workspace is possible, so honour an explicit `?workspace=`; otherwise the
  // account's own space is the first row, because personal sorts first.
  const workspace: Row | undefined =
    rows.find((row) => row.id === state.workspace) ?? rows[0];
  const personal = !!workspace && isPersonal(workspace);
  const pending = list?.pendingInvitationCount ?? list?.invitations.length ?? 0;
  // "No workspace yet" is a server still catching up, never a prompt to make
  // one. It is a waiting state with a retry, never a dead end — the Linear trap
  // is gating everything behind a membership you do not have yet.
  const provisioning = status === "ready" && !workspace;

  // The join offer only exists when there is something to join, so for most
  // people it is not a step at all.
  const step: StartStep =
    state.step === "join" && pending === 0 ? "workspace" : state.step;
  const sequence: StartStep[] = [
    ...(pending > 0 ? (["join"] as StartStep[]) : []),
    "workspace",
    "invite",
    "app",
  ];
  const label: Record<StartStep, string> = {
    join: copy("Join", "참여"),
    workspace: copy("Workspace", "워크스페이스"),
    invite: copy("Invite", "초대"),
    app: copy("Open the app", "앱 열기"),
    edit: copy("First edit", "첫 편집"),
  };
  const heading: Record<StartStep, [string, string]> = {
    join: ["You have been invited", "초대를 받았습니다"],
    workspace: personal
      ? [t("team.startPersonalTitle"), t("team.startPersonalTitle")]
      : ["Your workspace is ready", "워크스페이스가 준비되었습니다"],
    invite: ["Invite your team", "함께할 팀원을 초대하세요"],
    app: ["Open Prepix on your computer", "컴퓨터에서 Prepix를 여세요"],
    edit: ["Make your first edit", "첫 편집을 만들어 보세요"],
  };
  const intro: Record<StartStep, [string, string]> = {
    join: [
      "Someone has already made a space for you. Joining it puts your work alongside theirs.",
      "이미 만들어 둔 공간에 초대받았습니다. 참여하면 동료와 같은 곳에서 작업하게 됩니다.",
    ],
    // Step 2 is not a fork between "personal" and "team" any more — the personal
    // space already exists, and a team is a separate thing you make when you
    // need one (spec D13 §2.3: auto-provision, never a forced step).
    workspace: personal
      ? [t("team.startPersonalBody"), t("team.startPersonalBody")]
      : [
          "We made it with your account. Rename it if you like — the address stays the same either way.",
          "계정 정보로 만들어 두었습니다. 원하면 이름을 바꾸세요. 주소는 그대로 유지됩니다.",
        ],
    invite: [
      "Anyone you invite joins this same workspace. You can do this later instead.",
      "초대한 사람은 이 워크스페이스에 함께 참여합니다. 나중에 해도 됩니다.",
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
            onClick={() => navigate({ ...state, step: "app" })}
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
          <section className="space-y-5 rounded-xl border border-border p-6">
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
          <section className="space-y-4 rounded-xl border border-border p-6">
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
                onClick={() => navigate({ ...state, step: "app" })}
              >
                {copy("Open the app", "앱 열기")}
              </button>
            </div>
          </section>
        ) : provisioning ? (
          // Deliberately not a create button. Every account has a workspace; an
          // empty list means the server has not finished, and asking the user
          // to fix that by making one is how you end up with two.
          <section className="space-y-4 rounded-xl border border-border p-6">
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
                onClick={() => navigate({ ...state, step: "app" })}
              >
                {copy("Open the app meanwhile", "먼저 앱 열기")}
              </button>
            </div>
          </section>
        ) : step === "join" && list ? (
          <JoinStep
            list={list}
            onSkip={() =>
              navigate({ step: "workspace", workspace: state.workspace })
            }
          />
        ) : step === "workspace" && workspace ? (
          personal ? (
            <PersonalStep
              onTeam={async (teamId) => {
                await reload();
                navigate({ step: "invite", workspace: teamId });
              }}
              onNext={() =>
                navigate({ step: "invite", workspace: workspace.id })
              }
            />
          ) : (
            <WorkspaceStep
              workspace={workspace}
              onRenamed={reload}
              onNext={() =>
                navigate({ step: "invite", workspace: workspace.id })
              }
            />
          )
        ) : step === "invite" && workspace ? (
          personal ? (
            // There is nobody to invite into a personal space, and there is no
            // form here that could pretend otherwise. The step stays in the
            // sequence so the shape of first run does not change under people
            // who came back to it.
            <section className="space-y-5 rounded-xl border border-border p-6">
              <p className="text-sm leading-6">{t("team.startNoTeam")}</p>
              <button
                className={secondaryClass}
                onClick={() =>
                  navigate({ step: "app", workspace: workspace.id })
                }
              >
                {copy("Do this later", "나중에 하기")}
              </button>
            </section>
          ) : (
            <InviteStep
              workspace={workspace}
              onNext={() => navigate({ step: "app", workspace: workspace.id })}
            />
          )
        ) : null}

        {signedIn && (step === "app" || step === "edit") && (
          <>
            {workspace && step === "app" && (
              <aside className="space-y-2 rounded-xl border border-border bg-surface p-5">
                <p className="font-medium">
                  {personal ? t("team.kind.personal") : workspace.name}
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
                <CloudEntry workspaceId={workspace.id} />
              </aside>
            )}
            {step === "app" ? (
              <section className="space-y-6 rounded-xl border border-border p-6">
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
                    "On a phone? Finish here, then open this same address on your Mac or Windows computer. If installation is restricted, ask your IT administrator to install the official app.",
                    "휴대폰에서는 여기까지 마친 뒤 Mac 또는 Windows 컴퓨터에서 이 주소를 다시 여세요. 회사 컴퓨터에서 설치가 제한되어 있다면 IT 관리자에게 공식 앱 설치를 요청하세요.",
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
    <section className="space-y-5 rounded-xl border border-border p-6">
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

/**
 * Step 2 for the space every account already has.
 *
 * Not a fork between "my videos" and "start with a team" — that was a
 * signup-time choice, and the thing it chose between is now two persistent
 * objects. The personal space is already here; a team is an explicit, named
 * action taken when somebody needs one, which is also the D13 §2.3 requirement
 * that a personal→team move never happen by accident.
 */
function PersonalStep({
  onTeam,
  onNext,
}: {
  onTeam: (workspaceId: string) => Promise<void>;
  onNext: () => void;
}) {
  const { lang, t } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="space-y-5 rounded-xl border border-border p-6">
      <p className="text-sm leading-6 text-muted">{t("team.personalDesc")}</p>
      {open ? (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = name.trim();
            if (busy || !next) return;
            setBusy(true);
            setError("");
            try {
              const { workspace } = await workspaceService.create(next);
              await onTeam(workspace.id);
            } catch (e) {
              setError(workspaceError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium" htmlFor="start-team-name">
            {t("team.startTeamName")}
          </label>
          <input
            id="start-team-name"
            className={`${inputClass} max-w-sm`}
            value={name}
            maxLength={80}
            disabled={busy}
            placeholder={t("team.placeholder")}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-xs leading-5 text-muted">
            {t("team.startTeamHint")}
          </p>
          {error && (
            <p role="alert" className="text-sm leading-6">
              {t(`team.error.${error}`)}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className={primaryClass} disabled={busy || !name.trim()}>
              {busy ? t("team.creating") : t("team.makeTeam")}
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {copy("Cancel", "취소")}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button className={primaryClass} onClick={onNext}>
            {copy("Continue", "계속하기")}
          </button>
          <button className={secondaryClass} onClick={() => setOpen(true)}>
            {t("team.makeTeam")}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Step 2 for a team — the one step the research says matters.
 *
 * Vercel is the only product that auto-names; every other one makes you type a
 * name, so people arrive expecting to. A good default plus an easy rename is
 * the point: nothing is required here, and continuing without touching it is a
 * perfectly good answer.
 */
function WorkspaceStep({
  workspace,
  onRenamed,
  onNext,
}: {
  workspace: Row;
  onRenamed: () => Promise<void>;
  onNext: () => void;
}) {
  const { lang } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // Rename sits behind its own backend flag, and a reviewer cannot rename at
  // all. Either way the name is shown; only the field goes away.
  const canRename =
    workspace.managementEnabled !== false &&
    (workspace.role === "owner" || workspace.role === "admin");
  const name = draft ?? workspace.name;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (busy || !next || next === workspace.name) return;
    setBusy(true);
    setError("");
    try {
      await workspaceService.settings(workspace.id, {
        name: next,
        // `settings` replaces all three fields, so echoing the current
        // description is what keeps a rename from wiping it.
        description: workspace.description ?? "",
        revision: workspace.revision ?? 0,
      });
      await onRenamed();
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setError(workspaceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-xl border border-border p-6">
      {canRename ? (
        <form className="space-y-4" onSubmit={save}>
          <label
            className="block text-sm font-medium"
            htmlFor="start-workspace-name"
          >
            {copy("Workspace name", "워크스페이스 이름")}
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="start-workspace-name"
              className={`${inputClass} max-w-sm flex-1`}
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
              }}
            />
            <button
              className={secondaryClass}
              disabled={busy || !name.trim() || name.trim() === workspace.name}
            >
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy(
                busy ? "Saving…" : "Save name",
                busy ? "저장 중…" : "이름 저장",
              )}
            </button>
          </div>
          <p className="text-xs text-muted">
            {copy(
              "Up to 80 characters. Renaming does not change the workspace address.",
              "최대 80자. 이름을 바꿔도 워크스페이스 주소는 바뀌지 않습니다.",
            )}
          </p>
          {saved && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Check size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy("Name saved.", "이름을 저장했습니다.")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm leading-6">
              {error === "WORKSPACE_SETTINGS_CHANGED"
                ? copy(
                    "This workspace changed somewhere else. Reload and rename again.",
                    "다른 곳에서 워크스페이스가 변경되었습니다. 새로고침한 뒤 다시 시도하세요.",
                  )
                : copy(
                    "We could not save that name. Your text is still here — try again.",
                    "이름을 저장하지 못했습니다. 입력한 내용은 그대로 있습니다. 다시 시도하세요.",
                  )}
            </p>
          )}
        </form>
      ) : (
        <p className="font-medium">{workspace.name}</p>
      )}
      <button className={primaryClass} onClick={onNext}>
        {copy("Continue", "계속하기")}
      </button>
    </section>
  );
}

/**
 * Step 3 — inviting someone is the whole conversion from solo to team, so it is
 * an explicit step with an explicit way past it (Slack/Figma): a visible
 * "later", never a silent completion.
 */
function InviteStep({
  workspace,
  onNext,
}: {
  workspace: Row;
  onNext: () => void;
}) {
  const { lang } = useI18n();
  const ko = lang === "ko";
  const copy = (en: string, korean: string) => (ko ? korean : en);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setDetail(await workspaceService.detail(workspace.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [workspace.id]);
  useEffect(() => {
    // Deferred by a tick, the way workspace-context.tsx does it: the fetch is
    // async, but starting it inside the effect body still trips the cascading
    // render rule.
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);
  return (
    <section className="space-y-5 rounded-xl border border-border p-6">
      {detail ? (
        <InviteForm
          workspaceId={workspace.id}
          workspace={detail.workspace}
          isOwner={detail.role === "owner"}
          availableSeats={seatFigures(detail)?.remaining ?? 0}
          existingEmails={detail.members.map((member) => member.email)}
          pendingEmails={detail.invitations
            .filter((row) => !row.acceptedAt && !row.revokedAt)
            .map((row) => row.email)}
          ownerEmail={
            detail.members.find((member) => member.role === "owner")?.email
          }
          onChange={load}
        />
      ) : failed ? (
        <p role="alert" className="text-sm leading-6">
          {copy(
            "We could not load the invitation form. You can invite people later from the workspace.",
            "초대 화면을 불러오지 못했습니다. 나중에 워크스페이스에서 초대할 수 있습니다.",
          )}
        </p>
      ) : (
        <p role="status" className="text-sm text-muted">
          {copy("Loading…", "불러오는 중…")}
        </p>
      )}
      <button className={secondaryClass} onClick={onNext}>
        {copy("Do this later", "나중에 하기")}
      </button>
    </section>
  );
}
