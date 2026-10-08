"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, User, Users, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { userService } from "@/lib/api/services/user.service";
import {
  workspaceService,
  type Capabilities,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { b2bService } from "@/lib/api/services/b2b.service";
import type { Invitation, TeamCommerce } from "@/lib/api/generated/b2b";
import { useTeamCreation } from "@/components/workspaces/use-team-creation";
import { parseEmails, seatPlan, type Intent } from "@/lib/onboarding";

/**
 * The /start steps (spec: docs/plans/onboarding-renewal-design-2026-10-08.md).
 * Every answer here is optional except the first; a failed save never stops
 * anyone going on. Layout and copy follow Cal.com/Dub-style onboarding: one
 * decision per screen, the primary action bottom-right, the way out beside it.
 */

type Row = WorkspaceList["workspaces"][number];
type Option = readonly [code: string, en: string, ko: string];
export type PreviewUpdate = {
  people?: string[];
  seats?: { count: number; supplyKrw: number } | null;
};

export function useCopy() {
  const { lang } = useI18n();
  return (en: string, ko: string) => (lang === "ko" ? ko : en);
}
const won = (value: number) =>
  `₩${new Intl.NumberFormat("ko-KR").format(value)}`;

// ── Shared pieces ──────────────────────────────────────────────────────────

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
export const primaryButton = `inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-foreground px-4 text-sm font-medium text-background transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 ${focusRing}`;
export const quietButton = `inline-flex h-10 items-center justify-center rounded-[10px] px-3 text-sm text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:opacity-40 ${focusRing}`;
export const fieldClass =
  "h-11 w-full rounded-[10px] border border-field-border bg-field-background px-3.5 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-foreground/40 focus:ring-4 focus:ring-foreground/[0.06] sm:text-sm";

/** The ↵ a desktop user can press instead of clicking. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd aria-hidden="true" className="hidden min-w-5 rounded-[5px] bg-background/15 px-1 font-sans text-[11px] leading-5 text-current/80 sm:inline-block">
      {children}
    </kbd>
  );
}

/** Way out on the left, the next step on the right — the same on every step. */
export function StepActions({
  primary,
  secondary,
}: {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap-reverse items-center justify-between gap-3 pt-2">
      <div>{secondary}</div>
      <div>{primary}</div>
    </div>
  );
}

export function SubmitButton({
  children,
  disabled,
  busy,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button className={primaryButton} disabled={disabled || busy} aria-busy={busy}>
      {busy && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {children}
      <Kbd>↵</Kbd>
    </button>
  );
}

export function Chips({
  value,
  options,
  onChange,
}: {
  value: string | undefined;
  options: readonly Option[];
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([code, en, ko]) => {
        const on = value === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(code)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${focusRing} ${
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:border-foreground/30"
            }`}
          >
            <AnimatePresence initial={false}>
              {on && (
                <motion.span
                  initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)", width: 0 }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)", width: 14 }}
                  exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)", width: 0 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  className="inline-flex"
                >
                  <Check size={14} strokeWidth={2} />
                </motion.span>
              )}
            </AnimatePresence>
            {copy(en, ko)}
          </button>
        );
      })}
    </div>
  );
}

// ── ① How will you use Prepix ──────────────────────────────────────────────

export function UseStep({
  onPick,
  onHover,
}: {
  onPick: (intent: Intent) => void;
  onHover: (intent: Intent | null) => void;
}) {
  const copy = useCopy();
  const [busy, setBusy] = useState(false);
  const pick = useCallback(
    async (intent: Intent) => {
      setBusy(true);
      await userService.updateProfile({ useType: intent }).catch(() => undefined);
      onPick(intent);
    },
    [onPick],
  );
  // One decision, so a number key is the whole answer.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (busy || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "1") void pick("personal");
      if (event.key === "2") void pick("team");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, pick]);
  const options: {
    intent: Intent;
    icon: typeof User;
    title: [string, string];
    body: [string, string];
    badge?: [string, string];
  }[] = [
    {
      intent: "personal",
      icon: User,
      title: ["Just me", "혼자 쓸게요"],
      body: ["Edit on your own computer. Free to start.", "내 컴퓨터에서 바로 편집해요. 무료로 시작해요."],
    },
    {
      intent: "team",
      icon: Users,
      title: ["With my team", "팀과 함께 쓸게요"],
      body: ["Share projects and review together.", "프로젝트를 공유하고 함께 검토해요."],
      badge: ["₩129,000/seat/mo", "1인 월 129,000원"],
    },
  ];
  return (
    <div className="rounded-[14px] bg-surface-secondary/60 p-1">
      {options.map(({ intent, icon: Icon, title, body, badge }, index) => (
        <button
          key={intent}
          disabled={busy}
          onClick={() => void pick(intent)}
          onMouseEnter={() => onHover(intent)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(intent)}
          onBlur={() => onHover(null)}
          className={`group flex w-full items-center gap-4 rounded-[10px] border border-transparent p-4 text-left transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-background hover:shadow-sm disabled:opacity-60 ${focusRing}`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background shadow-[0_0_0_1px_var(--border)] group-hover:bg-surface">
            <Icon size={18} strokeWidth={1.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{copy(...title)}</span>
              {badge && (
                <span className="rounded-md bg-surface-tertiary px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                  {copy(...badge)}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-muted text-pretty">{copy(...body)}</span>
          </span>
          <kbd aria-hidden="true" className="hidden rounded-[5px] border border-border px-1.5 font-sans text-[11px] leading-5 text-muted sm:inline-block">
            {index + 1}
          </kbd>
        </button>
      ))}
    </div>
  );
}

// ── ② About you ───────────────────────────────────────────────────────────

// Codes match the server's lists (backend users.controller UpdateProfileDto).
const PROFILE_GROUPS: {
  field: "jobRole" | "industry" | "acquisitionSource";
  label: [string, string];
  options: Option[];
}[] = [
  {
    field: "jobRole",
    label: ["What you do", "하는 일"],
    options: [
      ["editor", "Editor", "편집자"],
      ["producer", "Producer / planner", "PD·기획"],
      ["marketer", "Marketer", "마케터"],
      ["lead", "Founder / lead", "대표·팀장"],
      ["other", "Other", "기타"],
    ],
  },
  {
    field: "industry",
    label: ["What you make", "만드는 영상"],
    options: [
      ["youtube", "YouTube / shorts", "유튜브·숏폼"],
      ["ads", "Ads / brand", "광고·브랜드"],
      ["internal", "Internal / training", "사내·교육"],
      ["broadcast", "Broadcast / agency", "방송·외주 제작"],
      ["other", "Other", "기타"],
    ],
  },
  {
    field: "acquisitionSource",
    label: ["How you found us", "알게 된 경로"],
    options: [
      ["search", "Search", "검색"],
      ["youtube", "YouTube", "유튜브"],
      ["referral", "A friend", "지인 추천"],
      ["social", "Social media", "SNS"],
      ["other", "Other", "기타"],
    ],
  },
];

export function ProfileStep({ onDone }: { onDone: () => void }) {
  const copy = useCopy();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    if (Object.keys(answers).length)
      await userService.updateProfile(answers).catch(() => undefined);
    onDone();
  }
  return (
    <form className="space-y-7" onSubmit={save}>
      {PROFILE_GROUPS.map((group) => (
        <fieldset key={group.field} className="space-y-2.5">
          <legend className="text-sm font-medium">{copy(...group.label)}</legend>
          <Chips
            value={answers[group.field]}
            options={group.options}
            onChange={(code) => setAnswers({ ...answers, [group.field]: code })}
          />
        </fieldset>
      ))}
      <StepActions
        secondary={
          <button type="button" className={quietButton} disabled={busy} onClick={onDone}>
            {copy("Skip", "건너뛰기")}
          </button>
        }
        primary={<SubmitButton busy={busy}>{copy("Next", "다음")}</SubmitButton>}
      />
    </form>
  );
}

// ── ③ Name the workspace ──────────────────────────────────────────────────

const TEAM_SIZES: Option[] = [
  ["3-5", "3–5", "3–5명"],
  ["6-20", "6–20", "6–20명"],
  ["21-100", "21–100", "21–100명"],
  ["100+", "100+", "100명 이상"],
];

/**
 * One screen for both kinds: the personal space is renamed in place, a team
 * is created here. Leaving the team for later is the visible way out.
 */
export function NameStep({
  intent,
  personal,
  onName,
  onPersonal,
  onTeam,
}: {
  intent: Intent;
  personal: Row;
  onName: (name: string) => void;
  onPersonal: () => void;
  onTeam: (workspaceId: string) => Promise<void>;
}) {
  const copy = useCopy();
  const { lang, t } = useI18n();
  const team = intent === "team";
  const [name, setName] = useState(team ? "" : personal.name);
  const [size, setSize] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const creation = useTeamCreation(capabilities);
  useEffect(() => {
    if (!team) return;
    let live = true;
    workspaceService
      .capabilities()
      .then((value) => live && setCapabilities(value))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [team]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next || busy) return;
    if (team) {
      await creation.submit(next, async (workspace) => {
        // Whoever makes a team starts on it from now on (lib/home.ts), even
        // if they answered "just me" before.
        await userService
          .updateProfile({ useType: "team", ...(size ? { teamSize: size } : {}) })
          .catch(() => undefined);
        await onTeam(workspace.id);
      });
      return;
    }
    if (next === personal.name) return onPersonal();
    setBusy(true);
    setFailed(false);
    try {
      await workspaceService.settings(personal.id, {
        name: next,
        // `settings` replaces the description too; echo it so it survives.
        description: personal.description ?? "",
        revision: personal.revision ?? 0,
      });
      onPersonal();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  const working = busy || creation.busy;
  const unavailable =
    team && capabilities !== null && !capabilities.canCreate && !creation.pending;
  return (
    <form className="space-y-7" onSubmit={submit}>
      <div className="space-y-2">
        <label htmlFor="start-name" className="block text-sm font-medium">
          {team
            ? copy("Company or team name", "회사 또는 팀 이름")
            : copy("Workspace name", "워크스페이스 이름")}
        </label>
        <input
          id="start-name"
          className={fieldClass}
          value={name}
          autoFocus
          maxLength={team ? 100 : 80}
          disabled={working}
          placeholder={team ? copy("e.g. Lasker Studio", "예: 라스커 스튜디오") : copy("e.g. Jiwoo's edits", "예: 지우의 편집실")}
          onChange={(event) => {
            setName(event.target.value);
            onName(event.target.value);
          }}
        />
      </div>
      {team && (
        <fieldset className="space-y-2.5">
          <legend className="text-sm font-medium">{copy("How big is your team?", "팀은 몇 명인가요?")}</legend>
          <Chips value={size} options={TEAM_SIZES} onChange={setSize} />
          {(size === "21-100" || size === "100+") && (
            <p className="text-[13px] text-muted">
              {copy("Rolling out to a larger team? ", "큰 팀에 도입하시나요? ")}
              <a
                className="text-foreground underline underline-offset-4"
                href={`https://www.prepix.ai${lang === "ko" ? "/ko" : ""}/contact`}
              >
                {copy("Talk to us", "도입 상담 받기")}
              </a>
            </p>
          )}
        </fieldset>
      )}
      {unavailable && (
        <p role="status" className="text-sm text-muted">
          {t("team.error.WORKSPACE_CREATION_UNAVAILABLE")}
        </p>
      )}
      {(failed || creation.error) && (
        <p role="alert" className="text-sm">
          {creation.error
            ? t(`team.error.${creation.error}`)
            : copy(
                "That didn't save. Your text is still here — try again.",
                "저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.",
              )}
        </p>
      )}
      <StepActions
        secondary={
          team && (
            <button type="button" className={quietButton} disabled={working} onClick={onPersonal}>
              {copy("Not now — use it on my own", "지금은 혼자 쓸게요")}
            </button>
          )
        }
        primary={
          <SubmitButton
            busy={working}
            disabled={!name.trim() || (team && (!capabilities || unavailable))}
          >
            {team ? copy("Create team", "팀 만들기") : copy("Next", "다음")}
          </SubmitButton>
        }
      />
    </form>
  );
}

// ── ④ Invite · ⑤ Pay ─────────────────────────────────────────────────────

/** The team's product and its waiting (team-level, unanswered) invitations. */
function useTeam(workspaceId: string) {
  const [commerce, setCommerce] = useState<TeamCommerce | null>(null);
  const [held, setHeld] = useState<Invitation[] | null>(null);
  const reload = useCallback(async () => {
    const [catalogue, list] = await Promise.all([
      b2bService.commerce(workspaceId).catch(() => null),
      b2bService
        .invitations(workspaceId)
        .catch(() => ({ invitations: [] as Invitation[] })),
    ]);
    setCommerce(catalogue);
    setHeld(
      list.invitations.filter(
        (row) => !row.acceptedAt && !row.revokedAt && !row.projectId,
      ),
    );
  }, [workspaceId]);
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    return () => clearTimeout(first);
  }, [reload]);
  return {
    product: commerce?.configured ? commerce.product : null,
    held,
    reload,
  };
}

function Avatar({ email }: { email: string }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-tertiary text-[11px] font-medium uppercase">
      {email[0]}
    </span>
  );
}

export function InviteStep({
  workspaceId,
  self,
  onNext,
  onPreview,
}: {
  workspaceId: string;
  self: string;
  onNext: () => void;
  onPreview: (update: PreviewUpdate) => void;
}) {
  const copy = useCopy();
  const { lang } = useI18n();
  const { product, held, reload } = useTeam(workspaceId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const taken = (held ?? []).map((row) => row.email);
  const { emails, invalid } = parseEmails(text, self, taken);
  const people = taken.length + emails.length;
  const plan = product ? seatPlan(product, people) : null;
  // `onPreview` is a state setter, so it is stable; the strings keep the
  // effect from firing on every render.
  const everyone = [...taken, ...emails].join(",");
  const seatCount = plan?.seats ?? 0;
  const supply = plan?.supplyKrw ?? 0;
  useEffect(() => {
    onPreview({
      people: everyone ? everyone.split(",") : [],
      seats: seatCount ? { count: seatCount, supplyKrw: supply } : null,
    });
  }, [onPreview, everyone, seatCount, supply]);
  async function remove(row: Invitation) {
    setBusy(true);
    await b2bService
      .changeInvitation(workspaceId, row.id, "revoke", {
        requestKey: crypto.randomUUID(),
        revision: row.revision,
        reason: "Removed before payment",
      })
      .catch(() => undefined);
    await reload();
    setBusy(false);
  }
  async function next(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const refused: string[] = [];
    for (const email of emails) {
      try {
        await b2bService.issueInvitation(workspaceId, {
          requestKey: crypto.randomUUID(),
          email,
          kind: "internal",
          teamRole: "editor",
          assignSeat: true,
          lang: lang === "ko" ? "ko" : "en",
        });
      } catch {
        refused.push(email);
      }
    }
    await reload();
    setBusy(false);
    setFailed(refused);
    if (refused.length) setText(refused.join(", "));
    else onNext();
  }
  return (
    <form className="space-y-6" onSubmit={next}>
      <div className="space-y-2">
        <label htmlFor="start-invites" className="block text-sm font-medium">
          {copy("Teammates' emails", "팀원 이메일")}
        </label>
        <input
          id="start-invites"
          className={fieldClass}
          value={text}
          autoFocus
          autoComplete="off"
          disabled={busy}
          placeholder={copy("kim@studio.com, lee@studio.com", "kim@studio.com, lee@studio.com")}
          onChange={(event) => setText(event.target.value)}
        />
        {invalid.length > 0 && (
          <p className="text-[13px]">
            {copy("Not an email: ", "이메일 형식이 아니에요: ")}
            {invalid.join(", ")}
          </p>
        )}
      </div>
      {(taken.length > 0 || emails.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {(held ?? []).map((row) => (
              <motion.li
                key={row.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-1.5 text-[13px]"
              >
                <Avatar email={row.email} />
                <span className="break-all">{row.email}</span>
                <span className="rounded-full bg-surface-secondary px-1.5 text-[11px] text-muted">
                  {copy("After payment", "결제 후 발송")}
                </span>
                <button
                  type="button"
                  aria-label={copy("Remove", "취소")}
                  disabled={busy}
                  onClick={() => void remove(row)}
                  className={`relative grid size-5 place-items-center rounded-full text-muted transition-colors after:absolute after:-inset-2 hover:bg-surface-secondary hover:text-foreground ${focusRing}`}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </motion.li>
            ))}
            {emails.map((email) => (
              <motion.li
                key={email}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="flex items-center gap-2 rounded-full border border-dashed border-border py-1 pl-1 pr-3 text-[13px]"
              >
                <Avatar email={email} />
                <span className="break-all">{email}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {failed.length > 0 && (
        <p role="alert" className="text-sm">
          {copy(
            "We couldn't invite these. Check them and try again.",
            "이 주소는 초대하지 못했어요. 확인하고 다시 시도해 주세요.",
          )}
        </p>
      )}
      {plan && product && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
          <span>
            {copy(
              `You + ${people} → ${plan.seats} seats · ${won(plan.supplyKrw)}/month (excl. VAT)`,
              `나 포함 ${1 + people}명 → ${plan.seats}석 · 월 ${won(plan.supplyKrw)} (VAT 별도)`,
            )}
          </span>
          {plan.seats === product.base.seats && (
            <span className="text-muted">
              {copy(`${product.base.seats} seats minimum`, `${product.base.seats}석부터 시작해요`)}
            </span>
          )}
        </p>
      )}
      <StepActions
        secondary={
          <button type="button" className={quietButton} disabled={busy} onClick={onNext}>
            {copy("Skip for now", "나중에 할게요")}
          </button>
        }
        primary={<SubmitButton busy={busy}>{copy("Next", "다음")}</SubmitButton>}
      />
    </form>
  );
}

export function PayStep({
  workspaceId,
  onLater,
  onPreview,
}: {
  workspaceId: string;
  onLater: () => void;
  onPreview: (update: PreviewUpdate) => void;
}) {
  const copy = useCopy();
  const { product, held } = useTeam(workspaceId);
  const plan = product && held ? seatPlan(product, held.length) : null;
  const people = (held ?? []).map((row) => row.email).join(",");
  const loaded = held !== null;
  const seatCount = plan?.seats ?? 0;
  const supply = plan?.supplyKrw ?? 0;
  useEffect(() => {
    if (!loaded) return;
    onPreview({
      people: people ? people.split(",") : [],
      seats: seatCount ? { count: seatCount, supplyKrw: supply } : null,
    });
  }, [onPreview, loaded, people, seatCount, supply]);
  const later = (
    <button type="button" className={quietButton} onClick={onLater}>
      {copy("Pay later", "나중에 결제할게요")}
    </button>
  );
  // `held` arrives with the catalogue; a team that has it but no product is
  // one whose catalogue could not be read or is not on sale — never a trap.
  if (!held)
    return (
      <div className="space-y-3" role="status" aria-label={copy("Loading", "불러오는 중")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-5 animate-pulse rounded-md bg-surface-secondary" />
        ))}
      </div>
    );
  if (!product || !plan)
    return (
      <div className="space-y-6">
        <p role="alert" className="text-sm leading-6">
          {copy(
            "We couldn't load the team plan. You can pay later from the team's plan page.",
            "팀 플랜 정보를 불러오지 못했어요. 나중에 팀의 플랜 화면에서 결제할 수 있어요.",
          )}
        </p>
        <StepActions secondary={later} />
      </div>
    );
  const unit = product.extraSeat.supplyKrw;
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface p-1">
        <dl className="rounded-[10px] bg-background p-4 text-sm tabular-nums shadow-[0_0_0_1px_var(--border)]">
          <div className="flex justify-between pb-3">
            <dt className="font-medium">{product.name}</dt>
            <dd className="text-[13px] text-muted">
              {copy(
                `${won(unit)}/seat/mo · excl. VAT · from ${product.base.seats} seats`,
                `1인 월 ${won(unit)} · VAT 별도 · ${product.base.seats}석부터`,
              )}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted">{copy("Seats", "좌석")}</dt>
            <dd>{copy(`${plan.seats} seats`, `${plan.seats}석`)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted">{copy("Supply", "공급가")}</dt>
            <dd>{won(plan.supplyKrw)}</dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted">{copy("VAT", "부가세")}</dt>
            <dd>{won(plan.vatKrw)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-dashed border-border pt-3 text-base font-semibold">
            <dt>{copy("Total per month", "월 결제액")}</dt>
            <dd>{won(plan.totalKrw)}</dd>
          </div>
        </dl>
      </div>
      {held.length > 0 && (
        <p className="text-sm text-muted">
          {copy(
            `When payment completes, we'll email ${held.length === 1 ? "1 invitation" : `${held.length} invitations`}.`,
            `결제가 끝나면 ${held.length}명에게 초대 메일을 보내 드릴게요.`,
          )}
        </p>
      )}
      <StepActions
        secondary={later}
        primary={
          <Link
            className={primaryButton}
            href={`/dashboard/workspaces/${workspaceId}/plan?extraSeats=${plan.extraSeats}`}
          >
            {copy(`Pay ${won(plan.totalKrw)}`, `${won(plan.totalKrw)} 결제하기`)}
          </Link>
        }
      />
    </div>
  );
}

// ── ⑥ The app ─────────────────────────────────────────────────────────────

type Os = "mac" | "win";

export function AppStep({
  onInstalled,
  guideHref,
}: {
  onInstalled: () => void;
  guideHref: string;
}) {
  const copy = useCopy();
  const { lang } = useI18n();
  const [os, setOs] = useState<Os>("mac");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/Win/i.test(navigator.userAgent)) setOs("win");
  }, []);
  const other: Os = os === "mac" ? "win" : "mac";
  const label = (value: Os) => (value === "mac" ? "macOS" : "Windows");
  const href = (value: Os) =>
    `https://www.prepix.ai/api/download/${value}${lang === "ko" ? "?from=ko" : ""}`;
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface p-1">
        <div className="flex flex-col gap-4 rounded-[10px] bg-background p-4 shadow-[0_0_0_1px_var(--border)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{copy(`Prepix for ${label(os)}`, `${label(os)}용 Prepix`)}</p>
            <p className="text-[13px] text-muted">
              {os === "mac"
                ? copy("Apple silicon · macOS 13+", "Apple 실리콘 · macOS 13 이상")
                : copy("Windows 10 or later", "Windows 10 이상")}
            </p>
          </div>
          <a className={primaryButton} href={href(os)}>
            <Download size={16} strokeWidth={2} aria-hidden="true" />
            {copy(`Download for ${label(os)}`, `${label(os)}용 다운로드`)}
          </a>
        </div>
      </div>
      <p className="text-[13px] text-muted">
        {copy("On another computer? ", "다른 컴퓨터인가요? ")}
        <a className="text-foreground underline underline-offset-4" href={href(other)}>
          {copy(`Download for ${label(other)}`, `${label(other)}용 받기`)}
        </a>
        {" · "}
        <a className="text-foreground underline underline-offset-4" href={guideHref}>
          {copy("Installation guide", "설치 안내")}
        </a>
      </p>
      <p className="text-[13px] leading-5 text-muted text-pretty">
        {copy(
          "On a phone? Finish here, then open this address on your Mac or Windows computer.",
          "휴대폰이라면 여기까지 마치고, Mac이나 Windows 컴퓨터에서 이 주소를 다시 열어 주세요.",
        )}
      </p>
      <StepActions
        primary={
          <button type="button" className={primaryButton} onClick={onInstalled}>
            {copy("I have the app", "앱을 설치했어요")}
          </button>
        }
      />
    </div>
  );
}

export function EditStep({ homeHref, helpHref }: { homeHref: string; helpHref: string }) {
  const copy = useCopy();
  const items: [string, string, string, string][] = [
    ["Open Prepix and sign in", "Use the same email or Google account.", "Prepix를 열고 로그인하기", "같은 이메일이나 Google 계정으로 로그인해요."],
    ["Create a project", "Pick the editing workflow that fits your video.", "새 프로젝트 만들기", "영상에 맞는 편집 방식을 골라요."],
    ["Import a short clip", "Start with one clip. Importing doesn't share it.", "짧은 영상 불러오기", "영상 하나로 시작해요. 불러오기만으로는 공유되지 않아요."],
    ["Make your first cut", "Play the result, tweak a cut, then export.", "첫 컷 편집하기", "결과를 재생하고 컷을 다듬은 뒤 내보내요."],
  ];
  return (
    <div className="space-y-6">
      <ol className="space-y-1">
        {items.map(([en, enBody, ko, koBody], i) => (
          <li key={en} className="flex gap-3 rounded-[10px] p-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-secondary text-[12px] font-medium tabular-nums text-muted">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{copy(en, ko)}</span>
              <span className="block text-[13px] text-muted text-pretty">{copy(enBody, koBody)}</span>
            </span>
          </li>
        ))}
      </ol>
      <StepActions
        secondary={
          <a className={quietButton} href={helpHref}>
            {copy("Get help", "도움 요청")}
          </a>
        }
        primary={
          <Link className={primaryButton} href={homeHref}>
            {copy("Go to dashboard", "대시보드로 가기")}
          </Link>
        }
      />
    </div>
  );
}
