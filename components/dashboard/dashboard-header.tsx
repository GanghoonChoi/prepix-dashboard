"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { navActive } from "@/lib/workspaces/nav";
import { useCurrentSpace } from "@/components/dashboard/current-space";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { NotificationEntry } from "@/components/b2b/notifications";
import { useSpaceName } from "@/components/workspaces/shared";

/** Pages that belong to the account, not to a space: no space crumb. */
const ACCOUNT_PAGES: [RegExp, string, string][] = [
  [/^\/dashboard\/notifications/, "알림", "Notifications"],
  [/^\/dashboard\/workspaces\/?$/, "워크스페이스", "Workspaces"],
  [/^\/dashboard\/(?:b2b-)?invitations/, "초대", "Invitation"],
  [/^\/dashboard\/review-shares/, "리뷰", "Review"],
];

/**
 * Where you are, search, and notifications. The old header existed only on
 * mobile, to hold the menu button; nothing on desktop said which space or page
 * was on screen except a highlighted row in the sidebar.
 */
export function DashboardHeader({
  onMobileMenuToggle,
}: {
  onMobileMenuToggle: () => void;
}) {
  const { t, lang } = useI18n();
  const ko = lang === "ko";
  const path = usePathname();
  const spaceName = useSpaceName();
  const { current, links, base } = useCurrentSpace();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const account = ACCOUNT_PAGES.find(([pattern]) => pattern.test(path));
  const page = links.find((link) => navActive(path, link.href, base));
  const crumbs = account
    ? [ko ? account[1] : account[2]]
    : [
        current ? spaceName(current) : t("team.kind.personal"),
        ...(page ? [ko ? page.ko : page.en] : []),
      ];

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      <button
        type="button"
        onClick={onMobileMenuToggle}
        aria-label={t("nav.toggleMenu")}
        aria-controls="mobile-navigation"
        className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary hover:text-foreground lg:hidden"
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>

      <nav
        aria-label={ko ? "현재 위치" : "Breadcrumb"}
        className="min-w-0 flex-1"
      >
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {crumbs.map((crumb, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted/60">/</span>}
              <span
                aria-current={i === crumbs.length - 1 ? "page" : undefined}
                className={`truncate ${
                  i === crumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted"
                }`}
              >
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <button
        type="button"
        onClick={() => setPalette(true)}
        aria-label={ko ? "검색 (⌘K)" : "Search (⌘K)"}
        className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-[13px] text-muted transition-colors hover:bg-surface-secondary hover:text-foreground sm:w-56 sm:px-2.5"
      >
        <Search size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden flex-1 text-left sm:inline">
          {ko ? "검색…" : "Search…"}
        </span>
        <kbd className="hidden rounded border border-border px-1 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>
      <NotificationEntry />

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </header>
  );
}
