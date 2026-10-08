"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
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
 * The /start steps that ask something (spec:
 * docs/plans/onboarding-renewal-design-2026-10-08.md). Every answer here is
 * optional except the first; a failed save never stops anyone going on.
 */

type Row = WorkspaceList["workspaces"][number];
type Option = readonly [code: string, en: string, ko: string];

function useCopy() {
  const { lang } = useI18n();
  return (en: string, ko: string) => (lang === "ko" ? ko : en);
}
const won = (value: number) =>
  `₩${new Intl.NumberFormat("ko-KR").format(value)}`;

export function UseStep({ onPick }: { onPick: (intent: Intent) => void }) {
  const copy = useCopy();
  const [busy, setBusy] = useState(false);
  async function pick(intent: Intent) {
    setBusy(true);
    await userService.updateProfile({ useType: intent }).catch(() => undefined);
    onPick(intent);
  }
  const card =
    "rounded-lg border border-border p-6 text-left transition-colors hover:bg-surface disabled:opacity-50";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button className={card} disabled={busy} onClick={() => void pick("personal")}>
        <span className="block font-medium">{copy("Just me", "혼자 쓸게요")}</span>
        <span className="mt-1 block text-sm text-muted">
          {copy(
            "Edit on your own computer. Free to start.",
            "내 컴퓨터에서 편집합니다. 무료로 시작해요.",
          )}
        </span>
      </button>
      <button className={card} disabled={busy} onClick={() => void pick("team")}>
        <span className="block font-medium">
          {copy("With my team", "팀과 함께 쓸게요")}
        </span>
        <span className="mt-1 block text-sm text-muted">
          {copy(
            "A shared workspace, members and comments. Business plan.",
            "팀 워크스페이스, 멤버 관리, 코멘트. Business 플랜.",
          )}
        </span>
      </button>
    </div>
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
      {options.map(([code, en, ko]) => (
        <button
          key={code}
          type="button"
          aria-pressed={value === code}
          onClick={() => onChange(code)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            value === code
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-surface"
          }`}
        >
          {copy(en, ko)}
        </button>
      ))}
    </div>
  );
}

// Codes match the server's lists (backend users.controller UpdateProfileDto).
const PROFILE_GROUPS: {
  field: "jobRole" | "industry" | "acquisitionSource";
  label: [string, string];
  options: Option[];
}[] = [
  {
    field: "jobRole",
    label: ["Your role", "직무"],
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
  async function save() {
    setBusy(true);
    if (Object.keys(answers).length)
      await userService.updateProfile(answers).catch(() => undefined);
    onDone();
  }
  return (
    <section className="space-y-6 rounded-lg border border-border p-6">
      {PROFILE_GROUPS.map((group) => (
        <div key={group.field} className="space-y-2">
          <p className="text-sm font-medium">{copy(...group.label)}</p>
          <Chips
            value={answers[group.field]}
            options={group.options}
            onChange={(code) => setAnswers({ ...answers, [group.field]: code })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button className={primaryClass} disabled={busy} onClick={() => void save()}>
          {copy("Continue", "계속하기")}
        </button>
        <button className={secondaryClass} disabled={busy} onClick={onDone}>
          {copy("Skip", "건너뛰기")}
        </button>
      </div>
    </section>
  );
}

const TEAM_SIZES: Option[] = [
  ["3-5", "3–5", "3–5명"],
  ["6-20", "6–20", "6–20명"],
  ["21-100", "21–100", "21–100명"],
  ["100+", "100+", "100명 이상"],
];

/**
 * One screen for both kinds: the personal space is renamed in place, a team
 * is created here. Leaving the team name empty is not an option, but leaving
 * the team for later is — "continue on my own" is the visible way out.
 */
export function NameStep({
  intent,
  personal,
  onPersonal,
  onTeam,
}: {
  intent: Intent;
  personal: Row;
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
    <form className="space-y-5 rounded-lg border border-border p-6" onSubmit={submit}>
      <div className="space-y-2">
        <label htmlFor="start-name" className="block text-sm font-medium">
          {team
            ? copy("Company or team name", "회사 또는 팀 이름")
            : copy("Workspace name", "워크스페이스 이름")}
        </label>
        <input
          id="start-name"
          className={`${inputClass} max-w-sm`}
          value={name}
          maxLength={team ? 100 : 80}
          disabled={working}
          placeholder={team ? copy("e.g. Lasker Studio", "예: 라스커 스튜디오") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="text-xs text-muted">
          {copy(
            "You can rename it later; the address stays.",
            "나중에 바꿀 수 있고, 주소는 그대로 유지됩니다.",
          )}
        </p>
      </div>
      {team && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy("Team size", "팀 규모")}</p>
          <Chips value={size} options={TEAM_SIZES} onChange={setSize} />
          {(size === "21-100" || size === "100+") && (
            <p className="text-xs text-muted">
              {copy("Rolling out to a larger team? ", "큰 팀 도입이 필요하신가요? ")}
              <a
                className="underline"
                href={`https://www.prepix.ai${lang === "ko" ? "/ko" : ""}/contact`}
              >
                {copy("Talk to us", "도입 상담 문의")}
              </a>
            </p>
          )}
        </div>
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
                "That did not save. Your text is still here — try again.",
                "저장하지 못했습니다. 입력한 내용은 그대로 있습니다. 다시 시도하세요.",
              )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className={primaryClass}
          disabled={working || !name.trim() || (team && (!capabilities || unavailable))}
        >
          {team ? copy("Create team", "팀 만들기") : copy("Continue", "계속하기")}
        </button>
        {team && (
          <button
            type="button"
            className={secondaryClass}
            disabled={working}
            onClick={onPersonal}
          >
            {copy("Later — continue on my own", "나중에 — 개인으로 계속")}
          </button>
        )}
      </div>
    </form>
  );
}

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

export function InviteStep({
  workspaceId,
  self,
  onNext,
}: {
  workspaceId: string;
  self: string;
  onNext: () => void;
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
  async function next() {
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
    if (refused.length) setText(refused.join("\n"));
    else onNext();
  }
  return (
    <section className="space-y-5 rounded-lg border border-border p-6">
      {held && held.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {held.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span className="break-all">{row.email}</span>
              <span className="flex shrink-0 items-center gap-3 text-muted">
                {copy("Sent after payment", "결제 후 발송")}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-4"
                  disabled={busy}
                  onClick={() => void remove(row)}
                >
                  {copy("Remove", "취소")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <label htmlFor="start-invites" className="block text-sm font-medium">
          {copy("Teammates' emails", "팀원 이메일")}
        </label>
        <textarea
          id="start-invites"
          rows={4}
          className={inputClass}
          value={text}
          disabled={busy}
          placeholder={copy(
            "Paste several, separated by commas or lines",
            "여러 개를 쉼표나 줄바꿈으로 구분해 붙여넣으세요",
          )}
          onChange={(event) => setText(event.target.value)}
        />
        {invalid.length > 0 && (
          <p className="text-xs">
            {copy("Not an email: ", "이메일 형식이 아닙니다: ")}
            {invalid.join(", ")}
          </p>
        )}
      </div>
      {failed.length > 0 && (
        <p role="alert" className="text-sm">
          {copy(
            "These could not be invited. Check them and try again.",
            "이 주소는 초대하지 못했습니다. 확인 후 다시 시도하세요.",
          )}
        </p>
      )}
      {plan && product && (
        <p className="text-sm tabular-nums">
          {copy(
            `You + ${people} → ${plan.seats} seats · ${won(plan.supplyKrw)}/month (VAT extra)`,
            `나 포함 ${1 + people}명 → ${plan.seats}석 · 월 ${won(plan.supplyKrw)} (부가세 별도)`,
          )}
          {plan.seats === product.base.seats && (
            <span className="text-muted">
              {copy(
                ` · minimum ${product.base.seats} seats`,
                ` · 최소 ${product.base.seats}석`,
              )}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className={primaryClass} disabled={busy} onClick={() => void next()}>
          {copy("Next", "다음")}
        </button>
        <button className={secondaryClass} disabled={busy} onClick={onNext}>
          {copy("I'll invite later", "나중에 초대할게요")}
        </button>
      </div>
    </section>
  );
}

export function PayStep({
  workspaceId,
  onLater,
}: {
  workspaceId: string;
  onLater: () => void;
}) {
  const copy = useCopy();
  const { product, held } = useTeam(workspaceId);
  const later = (
    <button className={secondaryClass} onClick={onLater}>
      {copy("Pay later", "나중에 결제")}
    </button>
  );
  // `held` arrives with the catalogue; a team that has it but no product is
  // one whose catalogue could not be read or is not on sale — never a trap.
  if (!held)
    return (
      <p role="status" className="text-sm text-muted">
        {copy("Loading…", "불러오는 중…")}
      </p>
    );
  if (!product)
    return (
      <section className="space-y-5 rounded-lg border border-border p-6">
        <p role="alert" className="text-sm leading-6">
          {copy(
            "We could not load the team plan. You can pay later from the team's plan page.",
            "팀 플랜 정보를 불러오지 못했습니다. 나중에 팀의 플랜 화면에서 결제할 수 있습니다.",
          )}
        </p>
        <div className="flex flex-wrap gap-3">{later}</div>
      </section>
    );
  const plan = seatPlan(product, held.length);
  return (
    <section className="space-y-5 rounded-lg border border-border p-6">
      <dl className="divide-y divide-border border-y border-border text-sm tabular-nums">
        {[
          [copy("Plan", "플랜"), product.name],
          [copy("Seats", "좌석"), copy(`${plan.seats} seats`, `${plan.seats}석`)],
          [copy("Supply", "공급가"), won(plan.supplyKrw)],
          [copy("VAT", "부가세"), won(plan.vatKrw)],
          [copy("Monthly total", "월 결제액"), won(plan.totalKrw)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between py-2">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {held.length > 0 && (
        <p className="text-sm text-muted">
          {copy(
            `Invitations go to ${held.length} people when payment completes.`,
            `결제가 끝나면 ${held.length}명에게 초대가 발송됩니다.`,
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          className={primaryClass}
          href={`/dashboard/workspaces/${workspaceId}/plan?extraSeats=${plan.extraSeats}`}
        >
          {copy("Pay", "결제하기")}
        </Link>
        {later}
      </div>
    </section>
  );
}
