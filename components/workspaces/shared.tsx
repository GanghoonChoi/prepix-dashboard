"use client";
import { WorkspaceNav } from "./workspace-context";
import Link from "next/link";
import { Building2, UserRound } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import { isPersonal, seatFigures, type WorkspaceKind } from "@/lib/workspaces/kind";
import type { WorkspaceDetail } from "@/lib/api/services/workspace.service";

export const inputClass =
  "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";
export const primaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
export const secondaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
export function TeamShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl space-y-8 text-foreground">
      <Link
        href="/dashboard/workspaces"
        className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline"
      >
        {t("team.title")}
      </Link>
      <header>
        <p className="mb-3 text-xs font-medium text-muted">
          {t("team.preview")}
        </p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted">
            {description}
          </p>
        )}
      </header>
      <WorkspaceNav />
      {children}
    </div>
  );
}
export function TeamError({
  code,
  retry,
}: {
  code: string;
  retry?: () => void;
}) {
  const { t } = useI18n();
  const key = `team.error.${code}`;
  const message = t(key);
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{message === key ? t("team.error.REQUEST_FAILED") : message}</p>
      {retry && (
        <button className={`${secondaryClass} mt-3`} onClick={retry}>
          {t("team.retry")}
        </button>
      )}
    </div>
  );
}
export function TeamLoading() {
  const { t } = useI18n();
  return (
    <p role="status" className="py-8 text-sm text-muted">
      {t("team.loading")}
    </p>
  );
}

/**
 * A confirm dialog that behaves like one (§5.1 모달 포커스 복귀).
 *
 * The inline `role="alertdialog"` divs this replaces announced themselves as
 * dialogs while behaving like ordinary content: Tab walked straight out into
 * the page behind, Escape did nothing, and closing dropped focus on <body> so a
 * keyboard user restarted from the top of the document. Focus enters here, is
 * held here, and goes back to whatever opened it.
 */
export function ConfirmDialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    node?.querySelector<HTMLElement>(selector)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(selector)];
      if (!focusable.length) return;
      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
      if (document.activeElement !== edge) return;
      event.preventDefault();
      (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      opener?.focus?.();
    };
  }, []);
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-label={label}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      {children}
    </div>
  );
}

/**
 * The one shape that says which kind of space this is: a person for the
 * personal one, a building for a team. Everything that lists workspaces uses
 * this, so the two never come out looking like the same object.
 */
export function SpaceIcon({
  kind,
  size = 22,
}: {
  kind: WorkspaceKind;
  size?: number;
}) {
  const Icon = kind === "personal" ? UserRound : Building2;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}

/**
 * The personal workspace is named after the account on the server, which is
 * fine as a record and wrong as a title — "gildong's workspace" in a list next
 * to "Studio team" reads like one more team. So a personal space is titled by
 * what it is, and a team by what it is called.
 */
export function useSpaceName() {
  const { t } = useI18n();
  return (workspace: { name: string; type?: string }) =>
    isPersonal(workspace) ? t("team.kind.personal") : workspace.name;
}

/**
 * "Which space am I in", at the moment it costs something.
 *
 * A Figma user added an editor to a draft without realising it sat in a
 * client's team space, and that person ended up on the client's payroll. The
 * cause was not a missing warning — it was that the current space was only ever
 * shown in a switcher at the top of the page. Dropbox and Google Drive both
 * fail the same way at share time, so there is no reference implementation to
 * copy: this goes INLINE, in the upload, publish, share and create surfaces
 * themselves.
 */
export function SpaceBadge({
  workspace,
}: {
  workspace: { name: string; type?: string };
}) {
  const { t } = useI18n();
  const personal = isPersonal(workspace);
  const spaceName = useSpaceName();
  return (
    <p
      data-space={personal ? "personal" : "team"}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
    >
      <SpaceIcon kind={personal ? "personal" : "team"} size={16} />
      <span className="text-muted">{t("team.here")}</span>
      <span className="min-w-0 break-words font-medium">
        {spaceName(workspace)}
      </span>
      <span className="text-muted">
        · {t(personal ? "team.kind.personal" : "team.kind.team")}
      </span>
      <span className="text-xs leading-5 text-muted">
        {t(personal ? "team.herePersonal" : "team.hereTeam")}
      </span>
    </p>
  );
}

/**
 * Slack publishes a role-capability table; Figma, Linear and Descript show
 * nothing at the moment a role is assigned, and "I made someone an admin by
 * accident" is a named failure class because of it. Static, always visible, and
 * placed next to the control that assigns the role — including the rule the
 * backend enforces but no screen ever said out loud: an admin cannot make
 * anyone an owner.
 *
 * SOT: docs/prd/b2b-service-spec-2026-09-13.md §3.2
 */
const ROLE_COLUMNS = ["owner", "admin", "editor", "reviewer"] as const;
const CAP = {
  yes: "team.caps.yes",
  no: "team.caps.no",
  scoped: "team.caps.scoped",
  notOwner: "team.caps.notOwner",
} as const;
const GRID: [string, string, string, string, string][] = [
  ["team.caps.billing", CAP.yes, CAP.no, CAP.no, CAP.no],
  ["team.caps.people", CAP.yes, CAP.notOwner, CAP.no, CAP.no],
  // Editors reach the whole archive unconditionally (D14 removes the
  // per-project grant this used to need); reviewers still never reach it.
  ["team.caps.projects", CAP.yes, CAP.yes, CAP.yes, CAP.no],
  ["team.caps.publish", CAP.yes, CAP.yes, CAP.scoped, CAP.no],
  ["team.caps.comment", CAP.yes, CAP.yes, CAP.scoped, CAP.scoped],
  ["team.caps.seat", CAP.yes, CAP.yes, CAP.yes, CAP.no],
];

export function RoleCapabilities() {
  const { t } = useI18n();
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium">{t("team.capsTitle")}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-120 border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="py-2 pr-3 text-left font-normal">
                {t("team.role")}
              </th>
              {ROLE_COLUMNS.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="px-2 py-2 text-left font-medium text-foreground"
                >
                  {t(`team.role.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRID.map(([label, ...cells]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="py-2 pr-3 text-left font-normal leading-5 text-muted"
                >
                  {t(label)}
                </th>
                {cells.map((cell, index) => (
                  <td
                    key={ROLE_COLUMNS[index]}
                    className={`px-2 py-2 ${cell === CAP.no ? "text-muted" : "text-foreground"}`}
                  >
                    {t(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-muted">{t("team.capsHint")}</p>
    </section>
  );
}

/**
 * Seats as four figures, wherever seats appear.
 *
 * A Dropbox admin removed 20 licences, saw a single seat total not move, and
 * paid about $3,000 over four to six months: the total silently included
 * pending invitations and suspended members. D02 reserves a seat for every
 * unexpired paid invitation, so one number here would be the same trap. There
 * is deliberately no summed figure on this component — adding one back is the
 * regression.
 */
export function SeatBreakdown({ detail }: { detail: WorkspaceDetail }) {
  const { t } = useI18n();
  const figures = seatFigures(detail);
  // Personal workspaces are outside seat accounting, so there is nothing here —
  // not "0 of 0 seats", which still asks the reader to reason about seats.
  if (!figures) return null;
  const groups: [string, [string, number][]][] = [
    [
      "team.seatHolds",
      [
        ["team.seatActive", figures.active],
        ["team.seatInvited", figures.invited],
        ["team.seatRemaining", figures.remaining],
      ],
    ],
    [
      "team.seatFree",
      [
        ["team.seatSuspended", figures.suspended],
        ["team.seatReviewers", figures.reviewers],
      ],
    ],
  ];
  return (
    <section
      data-seats="split"
      className="space-y-5 rounded-xl border border-border p-5"
    >
      <h2 className="text-sm font-medium">{t("team.seats")}</h2>
      {groups.map(([group, rows]) => (
        <div key={group} className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            {t(group)}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs leading-5 text-muted">{t(label)}</dt>
                <dd
                  data-seat={label.slice("team.seat".length).toLowerCase()}
                  className="mt-1 text-xl font-medium tabular-nums"
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="text-xs leading-5 text-muted">{t("team.seatSplit")}</p>
    </section>
  );
}
