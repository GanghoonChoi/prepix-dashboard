"use client";

import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { useWorkspaceCapabilities } from "@/components/workspaces/capabilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { legalUrl } from "@/lib/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Lockup } from "@/components/brand";
import type { Profile } from "@/lib/api/services/user.service";

const NAV_ITEMS = [
  { key: "nav.overview", href: "/dashboard" },
  { key: "nav.usage", href: "/dashboard/usage" },
  { key: "nav.plan", href: "/dashboard/plan" },
  { key: "nav.settings", href: "/dashboard/settings" },
];

export function Sidebar({
  profile,
  onLogout,
  onClose,
}: {
  profile: Profile | null;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const { capabilities, status } = useWorkspaceCapabilities();
  // A probe we could not reach is not proof the feature is gone. Keep the team
  // entry where it was so a blip does not remove the way back to it; the list
  // page behind it explains and offers a retry.
  const showTeams = !!capabilities?.enabled || status === "unreachable";
  const pathname = usePathname();
  const { t, lang } = useI18n();
  const displayName = profile?.username || profile?.email || "User";

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <Lockup />
      </div>

      {showTeams && <WorkspaceSwitcher onClose={onClose} />}
      {/* Nav */}
      <nav className="flex-1 px-3 py-3">
        <div className="space-y-0.5">
          {showTeams && (
            <Link
              href="/dashboard/workspaces"
              onClick={onClose}
              className={`block min-h-11 rounded-md px-3 py-3 text-[13px] transition-colors ${pathname.startsWith("/dashboard/workspaces") ? "font-medium text-foreground bg-foreground/[0.06]" : "text-muted hover:text-foreground"}`}
            >
              {t("team.title")}
            </Link>
          )}
          {showTeams && (
            <p className="px-3 pb-2 pt-4 text-[11px] text-muted">
              {lang === "ko" ? "개인 계정" : "Personal account"}
            </p>
          )}
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block min-h-11 rounded-md px-3 py-3 text-[13px] transition-colors ${
                  active
                    ? "font-medium text-foreground bg-foreground/[0.06]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3">
        <div className="rounded-md px-3 py-2">
          <p className="truncate text-[13px] font-medium text-foreground">
            {displayName}
          </p>
          {profile?.email && profile.email !== displayName && (
            <p className="truncate text-[11px] text-muted">{profile.email}</p>
          )}
        </div>
        <button
          onClick={onLogout}
          className="mt-1 block w-full rounded-md px-3 py-2 text-left text-[13px] text-muted transition-colors hover:text-foreground"
        >
          {t("nav.logout")}
        </button>
        <div className="mt-2 px-3">
          <LanguageSwitcher />
        </div>
        {/* Policy links point at the marketing homepage (single source of truth
            for legal text), matching the current language. */}
        <div className="mt-2 flex gap-3 px-3 py-1">
          <a
            href={legalUrl(lang, "terms-of-service")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted hover:text-foreground"
          >
            {t("nav.terms")}
          </a>
          <a
            href={legalUrl(lang, "privacy-policy")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted hover:text-foreground"
          >
            {t("nav.privacy")}
          </a>
          <a
            href={legalUrl(lang, "refund-policy")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted hover:text-foreground"
          >
            {t("nav.refund")}
          </a>
        </div>
      </div>
    </aside>
  );
}
