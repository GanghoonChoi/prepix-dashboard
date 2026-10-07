"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { isPersonal } from "@/lib/workspaces/kind";
import { useCurrentSpace } from "@/components/dashboard/current-space";
import { menuClass, menuItemClass, useDismiss } from "@/components/ui";
import { SpaceIcon, useSpaceName } from "./shared";

/**
 * One row for the space you are in, and a menu for the rest — where Notion,
 * Linear and ElevenLabs all land. Printing every workspace in the sidebar reads
 * well at two and grows without bound at ten.
 *
 * Two kinds of thing, so the menu still groups them (spec D13) and still titles
 * a personal space for what it is rather than by its server name.
 *
 * This does NOT become the only place the current space is named. A Figma user
 * added an editor to a draft without realising it sat in a client's team space
 * and ended up on that client's payroll, because the space was only ever shown
 * in a switcher at the top of the page. The inline markers on the upload,
 * publish, share and create surfaces are what prevent that, and they stay
 * exactly where they are — see `shared.tsx`.
 */
export function WorkspaceSwitcher({ onClose }: { onClose?: () => void }) {
  const { t, lang } = useI18n();
  const ko = lang === "ko";
  const spaceName = useSpaceName();
  const { rows, current, failed, reload, teams } = useCurrentSpace();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  const pick = () => {
    setOpen(false);
    onClose?.();
  };

  // No team product (or not yet known): the space is the account, and a
  // chooser with one entry is a chooser for nothing.
  const kind = current && !isPersonal(current) ? "team" : "personal";
  const name = current ? spaceName(current) : t("team.kind.personal");
  const tile = (k: "personal" | "team") => (
    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background">
      <SpaceIcon kind={k} size={14} />
    </span>
  );

  if (!teams || !rows?.length)
    return (
      <div className="flex min-h-9 items-center gap-2.5 px-2 text-[13px] font-medium">
        {tile("personal")}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {teams && failed && (
          <button
            className="text-xs text-muted underline hover:text-foreground"
            onClick={reload}
          >
            {ko ? "다시 시도" : "Retry"}
          </button>
        )}
      </div>
    );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-space={kind}
        className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-expanded:bg-surface-secondary"
      >
        {tile(kind)}
        <span className="min-w-0 flex-1 truncate text-left">{name}</span>
        <ChevronsUpDown
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-muted"
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`${menuClass} absolute inset-x-0 top-[calc(100%+4px)]`}
        >
          <ul className="max-h-[50vh] overflow-y-auto">
            {rows.map((row, index) => {
              const personal = isPersonal(row);
              // One heading per kind, above the first row of that kind, so
              // the two groups never read as one list of similar objects.
              const heading =
                index === 0
                  ? personal
                    ? "team.spaceHeading"
                    : "team.teamsHeading"
                  : personal === isPersonal(rows[index - 1])
                    ? null
                    : "team.teamsHeading";
              const selected = row.id === current?.id;
              return (
                <li key={row.id}>
                  {heading && (
                    <p className="px-2 pb-1 pt-2.5 text-[11px] font-medium text-muted first:pt-1.5">
                      {t(heading)}
                    </p>
                  )}
                  <Link
                    // The personal space has one home, /dashboard; its
                    // /workspaces/<id> page was a thinner copy of it.
                    href={
                      personal
                        ? "/dashboard"
                        : `/dashboard/workspaces/${row.id}`
                    }
                    onClick={pick}
                    role="menuitem"
                    data-space={personal ? "personal" : "team"}
                    aria-current={selected ? "page" : undefined}
                    className={`${menuItemClass} ${selected ? "font-medium" : ""}`}
                  >
                    {tile(personal ? "personal" : "team")}
                    <span className="min-w-0 flex-1 truncate">
                      {spaceName(row)}
                    </span>
                    {selected && (
                      <Check
                        size={14}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="shrink-0"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="-mx-1 mt-1 border-t border-border px-1 pt-1">
            <Link
              href="/dashboard/workspaces"
              onClick={pick}
              role="menuitem"
              className={`${menuItemClass} text-muted hover:text-foreground`}
            >
              <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
              {ko ? "워크스페이스 관리" : "Manage workspaces"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
