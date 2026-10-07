"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Skeleton } from "@heroui/react";
import {
  refundThreadService,
  type RefundThread,
} from "@/lib/api/services/subscription.service";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/components/toast";
import { cardClass } from "@/components/ui";
import { inputClass } from "@/components/workspaces/shared";

/**
 * The state of a filed refund request, on the page where it was filed.
 *
 * Without this the dashboard tells someone "under review" and then has nowhere
 * to put the answer: the reply lands in a thread the web app never renders, so
 * from here the request simply stops existing. That is the shape of a support
 * ticket, or a chargeback.
 *
 * Deliberately not a general inbox — one thread, the refund one, inline. A
 * feedback section for the dashboard is a different feature with a different
 * owner, and this page should not have to wait for it.
 */
export function RefundRequestCard({
  threadId,
  onResolved,
}: {
  threadId: string;
  /** Fired when the thread closes, so the page can re-fetch its refund offer. */
  onResolved: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [thread, setThread] = useState<RefundThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // The parent re-creates onResolved every render, so it cannot sit in a
  // dependency array — `load` would change identity each render and the effect
  // below would re-fetch forever. A ref keeps the callback current without
  // making it part of that identity; it is written in an effect, not during
  // render, because a ref write during render is not a render output.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  // Matches the pages' loader shape: the fetch is started in the effect and
  // every setState happens in a promise callback, never synchronously inside
  // the effect body.
  const load = useCallback(
    () =>
      refundThreadService
        .forRefund(threadId)
        .then((th) => {
          setThread(th);
          // Reading the answer here is what "read" means; leaving it unread
          // would keep badging the desktop for something already seen.
          if (th && th.unread > 0) {
            void refundThreadService.markRead(threadId).catch(() => {});
          }
          if (th?.status === "closed") onResolvedRef.current();
        })
        .catch(() => setThread(null))
        .finally(() => setLoading(false)),
    [threadId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const sendReply = async () => {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await refundThreadService.reply(threadId, body);
      setReply("");
      await load();
    } catch {
      toast(t("refund.replyFailed"), "error");
    }
    setSending(false);
  };

  if (loading) return <Skeleton className="h-32 w-full rounded-lg" />;
  // The offer already says a request is pending; failing to load the thread
  // should not also erase that fact.
  if (!thread) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ko" ? "ko-KR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const statusLabel =
    thread.status === "answered"
      ? t("refund.statusAnswered")
      : thread.status === "closed"
        ? t("refund.statusClosed")
        : t("refund.statusOpen");

  return (
    <section className={`${cardClass} space-y-4 p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium">{t("refund.cardTitle")}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {t("refund.filedAt", { date: fmt(thread.createdAt) })}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-xs ${
            thread.status === "answered" ? "text-foreground" : "text-muted"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {thread.status === "open" && (
        <p className="text-[13px] text-muted">{t("refund.openHelp")}</p>
      )}

      <ol className="space-y-2">
        {thread.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-md p-3 ${
              m.author === "team" ? "border border-border" : "bg-surface-secondary"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium">
                {m.author === "team"
                  ? (m.authorName ?? t("refund.authorTeam"))
                  : t("refund.authorYou")}
              </span>
              <span className="text-muted">{fmt(m.createdAt)}</span>
            </div>
            {/* The first message is the server-built summary, which is newline
                separated; whitespace-pre-line keeps it readable without markup. */}
            <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
          </li>
        ))}
      </ol>

      {thread.status !== "closed" && (
        <div className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={t("refund.replyPlaceholder")}
            aria-label={t("refund.replyPlaceholder")}
            className={inputClass}
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onPress={sendReply}
              isDisabled={sending || reply.trim().length === 0}
            >
              {sending ? t("refund.replySending") : t("refund.replySend")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
