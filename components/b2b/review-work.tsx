"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clapperboard } from "lucide-react";
import type { ReviewWorkList } from "@/lib/api/generated/b2b";
import { origin, reviewEvents, reviewsService } from "@/lib/api/services/b2b-reviews.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { Tag } from "@/components/ui";
import { useCopy } from "./shared";

// SOT: prepix-backend backend/docs/b2b-reviews.md "업무 API".
type Scope = { origin: string; userId: string; workspaceId: string };
type Card = ReviewWorkList["cards"][number];

/**
 * 확인할 영상 (2026-10-08): only what waits on me — videos I approve that
 * have no decision yet, and videos sent back with changes. No tabs, counts
 * or search; nothing to do means no section at all.
 */
export function ReviewWorkPanel() {
  const context = useWorkspace();
  if (!context?.b2b?.enrolled || !context.b2b.allowedActions.projects || !context.data.currentUserId)
    return null;
  const scope: Scope = {
    origin: origin(),
    workspaceId: context.data.workspace.id,
    userId: context.data.currentUserId,
  };
  return <Inbox key={JSON.stringify(scope)} scope={scope} />;
}

function Inbox({ scope }: { scope: Scope }) {
  const c = useCopy();
  const [cards, setCards] = useState<Card[] | null>(null);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++serial.current;
    try {
      const [mine, changes] = await Promise.all([
        reviewsService.work(scope, { view: "approvals", search: "" }),
        reviewsService.work(scope, { view: "changes", search: "" }),
      ]);
      if (ticket !== serial.current) return;
      const seen = new Set<string>();
      setCards(
        [...mine.cards, ...changes.cards].filter((card) => !seen.has(card.id) && !!seen.add(card.id)),
      );
    } catch {
      // A to-do list that cannot load says nothing rather than "all clear".
      if (ticket === serial.current) setCards(null);
    }
  }, [scope]);
  useEffect(() => {
    const counter = serial;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener(reviewEvents, refresh);
    return () => {
      counter.current++;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(reviewEvents, refresh);
    };
  }, [load]);
  if (!cards?.length) return null;
  return (
    <section className="space-y-3 border-b border-border pb-8 last:border-b-0 last:pb-0" aria-label={c("확인할 영상", "Videos to check")}>
      <h2 className="text-[15px] font-medium">
        {c("확인할 영상", "Videos to check")} <span className="tabular-nums text-muted">{cards.length}</span>
      </h2>
      <ul className="divide-y divide-border border-y border-border">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              className="flex items-center gap-3 py-3 transition-colors hover:bg-surface"
              href={`/dashboard/workspaces/${scope.workspaceId}/projects/${card.projectId}/reviews/${card.id}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
                <Clapperboard size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{card.title}</span>
                <span className="block truncate text-xs text-muted">{card.projectName}</span>
              </span>
              {card.approval === "changes_requested" ? (
                <Tag tone="danger">{c("수정 요청", "Changes requested")}</Tag>
              ) : (
                <Tag>{c("승인 필요", "Needs your approval")}</Tag>
              )}
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
