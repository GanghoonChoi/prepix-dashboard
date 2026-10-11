"use client";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Every page's frame: the way back, the title (with its state), one line of
 * facts, the page's own actions, its sibling tabs. The measure comes from the
 * layout (lib/page-width.ts), so pages never pick a width themselves.
 */
type Tab = { href: string; label: string; match?: string; count?: number };

export function Page({
  title,
  description,
  back,
  badge,
  meta,
  actions,
  tabs,
  children,
}: {
  /** Omit when the page's first section already carries its own heading. */
  title?: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  badge?: ReactNode;
  /** Facts joined by " · " under the title: version, owner, updated. */
  meta?: ReactNode[];
  actions?: ReactNode;
  tabs?: Tab[];
  children?: ReactNode;
}) {
  return (
    <div className="text-foreground">
      {(title || back) && (
        <PageHeader
          title={title}
          description={description}
          back={back}
          badge={badge}
          meta={meta}
          actions={actions}
        />
      )}
      {tabs && <PageTabs tabs={tabs} />}
      {children && <div className="space-y-8">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  back,
  badge,
  meta,
  actions,
}: {
  title?: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  badge?: ReactNode;
  meta?: ReactNode[];
  actions?: ReactNode;
}) {
  const facts = meta?.filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== "");
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {title && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 break-words text-balance text-2xl font-semibold tracking-tight">
                {title}
              </h1>
              {badge}
            </div>
          )}
          {facts && facts.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
              {/* The dot is a sibling, not inside the fact: a fact stays one
                  text node, findable by its exact words. */}
              {facts.map((fact, i) => (
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <span className="min-w-0 break-words">{fact}</span>
                </Fragment>
              ))}
            </p>
          )}
          {description && (
            <p className="mt-1.5 max-w-2xl text-pretty text-[13px] leading-5 text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}

/** Sibling pages of one topic, e.g. 플랜 · 사용량. Exact-match on the path. */
export function PageTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="-mt-2 mb-6 flex gap-5 overflow-x-auto border-b border-border text-[13px]">
      {tabs.map((tab) => {
        // The first tab is the topic's own page; the others also stay lit on
        // their children (a statement month, a request).
        const active =
          path === tab.href ||
          (tab.href !== tabs[0].href && path.startsWith(`${tab.href}/`)) ||
          (!!tab.match && (path === tab.match || path.startsWith(`${tab.match}/`)));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 transition-colors ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 font-normal tabular-nums text-muted">{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** The line above a list: what it is and how many, then its controls. */
export function Toolbar({
  title,
  count,
  className = "",
  children,
}: {
  title?: ReactNode;
  count?: number | string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 ${className}`}>
      {title && (
        <h2 className="text-sm font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal tabular-nums text-muted">{count}</span>
          )}
        </h2>
      )}
      {children && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
