"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  ChevronsUpDown,
  CreditCard,
  Folder,
  House,
  Library,
  LogOut,
  Settings,
  Ticket,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { useCurrentSpace } from "@/components/dashboard/current-space";
import { menuClass, menuItemClass, useDismiss } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { legalUrl } from "@/lib/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Lockup } from "@/components/brand";
import { NAV_GROUPS, navActive, type NavIcon } from "@/lib/workspaces/nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { Profile } from "@/lib/api/services/user.service";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  archive: Archive,
  folder: Folder,
  library: Library,
  members: Users,
  licence: Ticket,
  status: Activity,
  plan: CreditCard,
  settings: Settings,
};

export function Sidebar({
  profile,
  onLogout,
  onClose,
}: {
  profile: Profile | null;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const { lang } = useI18n();
  const ko = lang === "ko";
  const path = usePathname();
  const { links, base } = useCurrentSpace();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <Link href="/dashboard" onClick={onClose} aria-label="Prepix">
          <Lockup className="[&_svg:first-child]:h-4 [&_svg:last-child]:h-3" />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={ko ? "메뉴 닫기" : "Close menu"}
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary hover:text-foreground"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="px-2">
        <WorkspaceSwitcher onClose={onClose} />
      </div>

      {/* The nav for the space the switcher names, grouped by what you came
          to do. Who sees which entry is still workspaceLinks()' decision. */}
      <nav
        aria-label={ko ? "워크스페이스 메뉴" : "Workspace navigation"}
        className="flex-1 overflow-y-auto px-2 pb-4"
      >
        {NAV_GROUPS.map((group) => {
          const entries = links.filter((link) => link.group === group.key);
          if (!entries.length) return null;
          return (
            <div key={group.key} className="mt-5">
              <p className="px-2 pb-1.5 text-[11px] font-medium text-muted">
                {ko ? group.ko : group.en}
              </p>
              <ul className="space-y-px">
                {entries.map((link) => {
                  const active = navActive(path, link.href, base);
                  const Icon = NAV_ICONS[link.icon];
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors ${
                          active
                            ? "bg-surface-tertiary font-medium text-foreground"
                            : "text-foreground/70 hover:bg-surface-secondary hover:text-foreground"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                        {ko ? link.ko : link.en}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <AccountMenu profile={profile} onLogout={onLogout} onClose={onClose} />
      </div>
    </aside>
  );
}

function AccountMenu({
  profile,
  onLogout,
  onClose,
}: {
  profile: Profile | null;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const { t, lang } = useI18n();
  const ko = lang === "ko";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  const name = profile?.username || profile?.email || "";

  return (
    <div ref={root} className="relative">
      {open && (
        <div
          role="menu"
          className={`${menuClass} absolute inset-x-0 bottom-[calc(100%+4px)]`}
        >
          <Link
            href="/dashboard/settings"
            role="menuitem"
            onClick={() => {
              close();
              onClose?.();
            }}
            className={menuItemClass}
          >
            <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
            {ko ? "계정 설정" : "Account settings"}
          </Link>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[13px]">
            <span className="text-muted">{ko ? "언어" : "Language"}</span>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[13px]">
            <span className="text-muted">{ko ? "테마" : "Theme"}</span>
            <ThemeSwitcher />
          </div>
          <div className="-mx-1 my-1 border-t border-border" />
          {/* Policy text lives on the marketing site, in the current language. */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 py-1.5 text-[11px] text-muted">
            {(
              [
                ["terms-of-service", "nav.terms"],
                ["privacy-policy", "nav.privacy"],
                ["refund-policy", "nav.refund"],
              ] as const
            ).map(([page, key]) => (
              <a
                key={page}
                href={legalUrl(lang, page)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                {t(key)}
              </a>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className={menuItemClass}
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("nav.logout")}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-surface-secondary aria-expanded:bg-surface-secondary"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold uppercase text-background">
          {name.slice(0, 1) || "·"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {name || (ko ? "내 계정" : "My account")}
          </span>
          {profile?.email && profile.email !== name && (
            <span className="block truncate text-[11px] text-muted">
              {profile.email}
            </span>
          )}
        </span>
        <ChevronsUpDown
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          className="shrink-0 text-muted"
        />
      </button>
    </div>
  );
}
