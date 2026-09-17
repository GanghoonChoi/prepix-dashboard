"use client";
import { useOverlayState } from "@heroui/react";
import { HelpCircle } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { useI18n } from "@/lib/i18n/context";

/**
 * "What can this role actually do", behind a trigger — one table, one place.
 *
 * There were two of these: a `<details>` grid in shared.tsx next to the invite
 * form and a dialog here on the members table, with rows that disagreed. One
 * said an admin may change roles, the other said "소유자 제외"; one listed
 * renaming the team, the other listed publishing. A permissions table that is
 * merely plausible is worse than none — people plan around it, and the first
 * refusal that disagrees costs the screen its credibility.
 *
 * So every row below is a rule verified in the backend, and the rows that
 * could not be verified from this codebase (publishing, commenting — desktop
 * app behaviour) are gone rather than guessed:
 *
 *  - only the owner invites, appoints or manages an admin, and only the owner
 *    transfers ownership — workspaces.service.ts `issue()` and `changeMember()`
 *    both raise WORKSPACE_OWNER_REQUIRED
 *  - a reviewer is refused the archive outright — cloud.service.ts `access()`
 *  - a reviewer holds no seat — workspaces/seats.ts
 */
type Cell = boolean | string;
const ROLES = ["owner", "admin", "editor", "reviewer"] as const;

/**
 * The grid itself, for a surface that has room to show it outright.
 *
 * Split from the trigger because the member-change dialog shows it inline: a
 * second `Dialog` opened from inside the first would stack two focus traps and
 * two document-level Escape handlers, and the outer one — registered first —
 * fires first, so one Escape would shut both.
 */
export function RoleTable() {
  const { t } = useI18n();
  const rows: [string, Cell, Cell, Cell, Cell][] = [
    ["team.caps.ownership", true, false, false, false],
    ["team.caps.people", true, t("team.caps.exceptAdmin"), false, false],
    ["team.caps.archive", true, true, true, false],
    ["team.caps.seat", true, true, true, false],
  ];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-normal">
                {t("team.caps.can")}
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="whitespace-nowrap px-2 py-2 text-left font-medium text-foreground"
                >
                  {t(`team.role.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...cells]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="py-2.5 pr-3 text-left font-normal leading-5"
                >
                  {t(label)}
                </th>
                {cells.map((value, index) => (
                  <td
                    key={ROLES[index]}
                    className={`px-2 py-2.5 align-top ${
                      value === false ? "text-muted" : "text-foreground"
                    }`}
                  >
                    {value === true ? (
                      <span aria-label={t("team.caps.yes")}>✓</span>
                    ) : value === false ? (
                      // An em dash, not a cross: "not this role's job" reads
                      // differently from "forbidden", and most of these are
                      // the first thing.
                      <span aria-label={t("team.caps.no")}>—</span>
                    ) : (
                      // A role name is one word to a reader; breaking it
                      // across lines makes a column look like two.
                      <span className="whitespace-nowrap text-xs leading-5">
                        {value}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">{t("team.capsHint")}</p>
    </>
  );
}

/** The same grid behind a `?`, for a surface that cannot spare the rows. */
export function RoleGuide() {
  const { t } = useI18n();
  const guide = useOverlayState();
  const title = t("team.capsTitle");
  return (
    <>
      <button
        type="button"
        onClick={guide.open}
        aria-label={title}
        title={title}
        className="ml-1 inline-flex size-5 items-center justify-center rounded-full align-middle text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <Dialog state={guide} title={title} size="wide">
        <RoleTable />
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={guide.close}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm transition-colors hover:bg-surface"
          >
            {t("team.caps.close")}
          </button>
        </div>
      </Dialog>
    </>
  );
}
