"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Download,
  Search,
  Settings2,
  TicketPercent,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { downloadUrl } from "@/lib/i18n/config";
import { isPersonal } from "@/lib/workspaces/kind";
import { useCurrentSpace } from "@/components/dashboard/current-space";
import { NAV_ICONS } from "@/components/dashboard/sidebar";
import { SpaceIcon, useSpaceName } from "@/components/workspaces/shared";

type Item = {
  section: string;
  label: string;
  /** Matched by the search, never shown: the other language's label. */
  alias: string;
  href: string;
  external?: boolean;
  icon: React.ReactNode;
};

const glyph = (Icon: LucideIcon) => (
  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
);

/**
 * ⌘K. Every page the sidebar lists, the other spaces, and the two actions that
 * otherwise sit a page deep. Mounted only while open, so each opening starts
 * from an empty query; a native <dialog> gives the focus trap, Escape and the
 * backdrop.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { lang } = useI18n();
  const ko = lang === "ko";
  const router = useRouter();
  const spaceName = useSpaceName();
  const { links, rows, current, teams } = useCurrentSpace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const go = ko ? "이동" : "Go to";
  const items: Item[] = [
    ...links.map((link) => ({
      section: go,
      label: ko ? link.ko : link.en,
      alias: ko ? link.en : link.ko,
      href: link.href,
      icon: glyph(NAV_ICONS[link.icon]),
    })),
    // The bell's own rule: notifications come with the team product.
    ...(teams
      ? [
          {
            section: go,
            label: ko ? "알림" : "Notifications",
            alias: ko ? "notifications" : "알림",
            href: "/dashboard/notifications",
            icon: glyph(Bell),
          },
        ]
      : []),
    ...(rows ?? [])
      .filter((row) => row.id !== current?.id)
      .map((row) => ({
        section: ko ? "워크스페이스 전환" : "Switch workspace",
        label: spaceName(row),
        alias: ko ? "workspace" : "워크스페이스",
        href: isPersonal(row)
          ? "/dashboard"
          : `/dashboard/workspaces/${row.id}`,
        icon: (
          <SpaceIcon kind={isPersonal(row) ? "personal" : "team"} size={16} />
        ),
      })),
    ...(rows
      ? [
          {
            section: ko ? "워크스페이스 전환" : "Switch workspace",
            label: ko ? "워크스페이스 관리" : "Manage workspaces",
            alias: ko ? "manage workspaces team" : "워크스페이스 관리 팀",
            href: "/dashboard/workspaces",
            icon: glyph(Settings2),
          },
        ]
      : []),
    {
      section: ko ? "바로 하기" : "Actions",
      label: ko ? "쿠폰 등록" : "Redeem a coupon",
      alias: ko ? "redeem coupon code" : "쿠폰 코드 등록",
      href: "/dashboard/plan?redeem=1",
      icon: glyph(TicketPercent),
    },
    {
      section: ko ? "바로 하기" : "Actions",
      label: ko ? "데스크톱 앱 다운로드" : "Download the desktop app",
      alias: ko ? "download app" : "앱 다운로드",
      href: downloadUrl(lang),
      external: true,
      icon: glyph(Download),
    },
  ];

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? items.filter((item) =>
        `${item.label} ${item.alias}`.toLowerCase().includes(needle),
      )
    : items;
  const active = Math.min(index, Math.max(0, shown.length - 1));

  const open = (item: Item) => {
    if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
    else router.push(item.href);
    onClose();
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (!shown.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setIndex((active + step + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(shown[active]);
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      aria-label={ko ? "명령 검색" : "Command menu"}
      className="mx-auto mb-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-overlay p-0 text-foreground shadow-[0_16px_50px_rgba(0,0,0,0.25)] backdrop:bg-black/40"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="text-muted"
        />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={onKey}
          placeholder={ko ? "페이지나 작업 검색…" : "Search pages and actions…"}
          aria-label={ko ? "검색" : "Search"}
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">
          esc
        </kbd>
      </div>
      <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {shown.length === 0 && (
          <li className="px-3 py-8 text-center text-[13px] text-muted">
            {ko ? "결과가 없습니다." : "No results."}
          </li>
        )}
        {shown.map((item, i) => (
          <li key={`${item.section}:${item.href}`}>
            {(i === 0 || shown[i - 1].section !== item.section) && (
              <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-muted">
                {item.section}
              </p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseMove={() => i !== active && setIndex(i)}
              onClick={() => open(item)}
              className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
                i === active ? "bg-surface-secondary" : ""
              }`}
            >
              <span className="text-muted">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {i === active && (
                <ArrowRight
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="text-muted"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
