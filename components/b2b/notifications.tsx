"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FolderClosed,
  Lock,
  MessageSquare,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserNotification } from "@/lib/api/generated/b2b";
import { userService } from "@/lib/api/services/user.service";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import {
  append,
  cachedAccount,
  current,
  describe,
  href,
  notificationApi,
  notificationErrorCode as errorCode,
  NOTIFICATIONS_CHANGED,
  scopeKey,
  type NotificationScope,
} from "@/lib/b2b-notifications/notifications";
import { TeamLoading, TeamShell } from "@/components/workspaces/shared";
import { ago, Button, Card, EmptyState, Notice, Select } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { useCopy } from "./shared";

/** The account this tab is signed in as. Another tab signing in as someone
 * else rewrites the token; the storage event drops everything shown. */
function useAccount() {
  const [account, setAccount] = useState<string | null>(null);
  /** One profile read: the server's own answer to "who am I". */
  const resync = useCallback(
    () =>
      userService
        .getProfile()
        .then((p) => {
          const id = p.id ?? null;
          setAccount(id);
          return id;
        })
        .catch(() => null),
    [],
  );
  useEffect(() => {
    const read = () => {
      const cached = cachedAccount();
      if (cached) setAccount(cached);
      else
        userService
          .getProfile()
          .then((p) => setAccount(p.id ?? null))
          .catch(() => setAccount(null));
    };
    const timer = window.setTimeout(read, 0);
    const changed = (e: StorageEvent) => {
      if (!e.key || ["accessToken", "userInfo"].includes(e.key)) {
        setAccount(null);
        read();
      }
    };
    window.addEventListener("storage", changed);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", changed);
    };
  }, []);
  return { account, resync };
}

/** The tile beside a row: what the notice is about, by its kind's family. */
const KIND_ICONS: Record<string, LucideIcon> = {
  request: ClipboardList,
  review: MessageSquare,
  participation: FolderClosed,
  project: FolderClosed,
  membership: Users,
  transfer: Upload,
  payment: CreditCard,
  lifecycle: CalendarClock,
  notice: CalendarClock,
};
const kindIcon = (n: UserNotification) =>
  n.access === "lost" ? Lock : (KIND_ICONS[n.kind.split(".")[0]] ?? Bell);

// The same 32px track as the kit's Segmented, but these stay toggle buttons
// (aria-pressed in a named group): the notifications spec drives them that way.
const filterTrack = "inline-flex shrink-0 rounded-md bg-surface-secondary p-0.5";
const filterButton = (on: boolean) =>
  `inline-flex h-8 items-center rounded-[5px] px-2.5 text-[13px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
    on
      ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
      : "text-muted hover:text-foreground"
  }`;

export function Notifications() {
  const { account, resync } = useAccount();
  return account ? (
    <NotificationsView key={account} userId={account} resync={resync} />
  ) : (
    <TeamLoading />
  );
}

function NotificationsView({
  userId,
  resync,
}: {
  userId: string;
  resync: () => Promise<string | null>;
}) {
  const c = useCopy();
  const ko = c("ko", "en") === "ko";
  const router = useRouter();
  const api = useMemo(() => notificationApi(userId), [userId]);
  const [teams, setTeams] = useState<WorkspaceList["workspaces"]>([]);
  const [scope, setScope] = useState<NotificationScope>({
    userId,
    workspaceId: null,
    filter: "all",
  });
  const live = useRef(scope);
  live.current = scope;
  const [items, setItems] = useState<UserNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const loading = useRef<AbortController | null>(null);

  /** Always the first page of the *current* server state. A reconnect never
   * assumes what was missed is done; it asks again. */
  const reload = useCallback(
    async (asked: NotificationScope) => {
      loading.current?.abort();
      const stop = new AbortController();
      loading.current = stop;
      setStatus("loading");
      setItems([]);
      setCursor(null);
      try {
        const page = current(
          await api.list(asked, undefined, stop.signal),
          asked,
          live.current,
        );
        if (!page) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setUnread(page.unreadCount);
        setStatus("ready");
      } catch (error) {
        if (stop.signal.aborted || scopeKey(asked) !== scopeKey(live.current))
          return;
        const code = errorCode(error);
        if (code === "B2B_TEAM_NOT_FOUND" && asked.workspaceId) {
          setScope({ ...asked, workspaceId: null });
          return;
        }
        if (code === "B2B_NOTIFICATION_ACCOUNT_CHANGED") {
          // Ask once who this tab is. A different account re-keys the view
          // (fresh state, new header); the same one is a real error, shown
          // instead of reloading in a loop.
          const id = await resync();
          if (id && id !== userId) return;
        }
        setFailure(code);
        setStatus("error");
      }
    },
    [api, resync, userId],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(scope), 0);
    return () => window.clearTimeout(timer);
  }, [scope, reload]);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") void reload(live.current);
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
      loading.current?.abort();
    };
  }, [reload]);
  useEffect(() => {
    workspaceService
      .list()
      .then((list) =>
        setTeams(
          list.workspaces.filter((w) => w.type === "team" && !w.suspendedAt),
        ),
      )
      .catch(() => setTeams([]));
  }, []);

  const more = async () => {
    if (!cursor) return;
    const asked = live.current;
    setBusy("more");
    try {
      const page = current(
        await api.list(asked, cursor, new AbortController().signal),
        asked,
        live.current,
      );
      if (page) {
        setItems((shown) => append(shown, page.items));
        setCursor(page.nextCursor);
        setUnread(page.unreadCount);
      }
    } catch {
      setNotice(
        c(
          "다음 알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          "Could not load more. Try again in a moment.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (n: UserNotification) => {
    const asked = live.current;
    setBusy(n.id);
    try {
      const r = await api.read(n.id, !n.readAt);
      if (scopeKey(asked) !== scopeKey(live.current)) return;
      setItems((shown) =>
        asked.filter === "unread" && r.readAt
          ? shown.filter((i) => i.id !== n.id)
          : shown.map((i) => (i.id === n.id ? { ...i, readAt: r.readAt } : i)),
      );
      // The server count is account-wide; a team view keeps its own count and
      // moves it only for items the count includes (current access).
      if (n.access === "current" && !!n.readAt !== !!r.readAt)
        setUnread((u) =>
          u === null ? u : Math.max(0, u + (r.readAt ? -1 : 1)),
        );
    } catch (error) {
      setNotice(
        c(
          `읽음 상태를 바꾸지 못했어요 (${errorCode(error)})`,
          `Could not change read state (${errorCode(error)})`,
        ),
      );
    } finally {
      setBusy(null);
    }
  };
  /** Opening asks the server to recheck the target. A null destination is the
   * generic access notice: no name, no link, nothing granted. */
  const open = async (n: UserNotification) => {
    const asked = live.current;
    setBusy(n.id);
    setNotice("");
    try {
      const r = await api.open(n.id);
      if (scopeKey(asked) !== scopeKey(live.current)) return;
      if (r.destination) {
        router.push(href(r.destination));
        return;
      }
      setItems((shown) =>
        shown.map((i) =>
          i.id === n.id
            ? { ...i, readAt: i.readAt ?? new Date().toISOString() }
            : i,
        ),
      );
      if (n.access === "current" && !n.readAt)
        setUnread((u) => (u === null ? u : Math.max(0, u - 1)));
      setNotice(
        c(
          "현재 계정으로 이 내용을 열 수 없어요. 권한이 바뀌었거나 자료를 더 이상 볼 수 없는 상태예요.",
          "This account can no longer open this. Access changed or the content is no longer available.",
        ),
      );
    } catch {
      setNotice(
        c(
          "알림을 열지 못했어요. 잠시 후 다시 시도해 주세요.",
          "Could not open the notification. Try again in a moment.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const lang = ko ? "ko" : "en";
  return (
    <TeamShell title={c("알림", "Notifications")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={c("보기", "View")} className={filterTrack}>
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                aria-pressed={scope.filter === f}
                className={filterButton(scope.filter === f)}
                onClick={() => setScope({ ...scope, filter: f })}
              >
                {f === "all" ? c("전체", "All") : c("읽지 않음", "Unread")}
                {f === "unread" && unread !== null ? ` ${unread}` : ""}
              </button>
            ))}
          </div>
          {/* One option ("모든 팀") is not a choice; the filter appears once
              there is a team to narrow to. */}
          {(teams.length > 0 || scope.workspaceId) && (
            <label className="w-full min-w-0 sm:w-56">
              <span className="sr-only">{c("공간", "Space")}</span>
              <Select
                value={scope.workspaceId ?? ""}
                onChange={(e) =>
                  setScope({ ...scope, workspaceId: e.target.value || null })
                }
              >
                <option value="">{c("모든 팀", "All teams")}</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
        {notice && <Notice role="alert">{notice}</Notice>}
        {status === "loading" ? (
          <TeamLoading />
        ) : status === "error" ? (
          <Notice
            tone="danger"
            role="alert"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void reload(live.current)}
              >
                {c("다시 시도", "Retry")}
              </Button>
            }
          >
            {failure === "B2B_DISABLED"
              ? c(
                  "팀 알림을 사용할 수 없어요.",
                  "Team notifications are unavailable.",
                )
              : c(
                  `알림을 불러오지 못했어요 (${failure}). 목록이 비어 있다는 뜻은 아니에요.`,
                  `Could not load notifications (${failure}). This does not mean there are none.`,
                )}
          </Notice>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              scope.filter === "unread"
                ? c("읽지 않은 알림이 없어요.", "No unread notifications.")
                : c("알림이 없어요.", "No notifications.")
            }
          />
        ) : (
          <Card as="div" padded={false} className="overflow-hidden">
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const fresh = !n.readAt && n.access !== "lost";
                const Icon = kindIcon(n);
                const where = [n.team?.name, n.project?.name]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={n.id}
                    className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${fresh ? "bg-surface" : ""}`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
                      disabled={busy === n.id}
                      onClick={() => void open(n)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">
                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm leading-5 ${n.access === "lost" ? "text-muted" : fresh ? "font-medium" : ""}`}
                        >
                          {describe(n, ko)}
                        </span>
                        {where && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {where}
                          </span>
                        )}
                        {/* The dot says it to the eye; this says it to a
                            screen reader. */}
                        {fresh && (
                          <span className="sr-only">
                            {c(" · 읽지 않음", " · Unread")}
                          </span>
                        )}
                      </span>
                      <span
                        className="shrink-0 pt-0.5 text-xs text-muted tabular-nums"
                        title={`${formatDate(n.createdAt, lang)} ${formatTime(n.createdAt, lang)}`}
                      >
                        {ago(n.createdAt, lang)}
                      </span>
                      <span
                        aria-hidden
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${fresh ? "bg-foreground" : "bg-transparent"}`}
                      />
                    </button>
                    {n.access === "current" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="self-start sm:self-auto"
                        disabled={busy === n.id}
                        onClick={() => void toggle(n)}
                      >
                        {n.readAt
                          ? c("읽지 않음으로", "Mark unread")
                          : c("읽음으로", "Mark read")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {status === "ready" && cursor && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              disabled={busy === "more"}
              onClick={() => void more()}
            >
              {c("더 보기", "Load more")}
            </Button>
          </div>
        )}
      </div>
    </TeamShell>
  );
}

/** Top-bar bell with the account's unread count. A failure shows no number,
 * never a zero; a disabled B2B service hides the entry. */
export function NotificationEntry({ onClose }: { onClose?: () => void }) {
  const c = useCopy();
  const { account } = useAccount();
  // Keyed by account so a switched account never inherits the old badge.
  const [badge, setBadge] = useState<{
    account: string;
    count: number | null;
    hidden: boolean;
  } | null>(null);
  const mine = badge?.account === account ? badge : null;
  const count = mine?.count ?? null;
  const hidden = mine?.hidden ?? false;
  useEffect(() => {
    if (!account) return;
    const api = notificationApi(account);
    let stop = new AbortController();
    const load = () => {
      stop.abort();
      stop = new AbortController();
      const asked = stop;
      api
        .unread(asked.signal)
        .then(
          (r) =>
            !asked.signal.aborted &&
            setBadge({ account, count: r.unreadCount, hidden: false }),
        )
        .catch((error) => {
          if (asked.signal.aborted) return;
          setBadge({
            account,
            count: null,
            hidden: errorCode(error) === "B2B_DISABLED",
          });
        });
    };
    const timer = window.setTimeout(load, 0);
    const poll = window.setInterval(load, 60000);
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      stop.abort();
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [account]);
  if (hidden || !account) return null;
  const label = count
    ? c(`알림 · 읽지 않음 ${count}개`, `Notifications · ${count} unread`)
    : c("알림", "Notifications");
  return (
    <Link
      href="/dashboard/notifications"
      onClick={onClose}
      aria-label={label}
      title={label}
      className="relative grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
    >
      <Bell size={16} strokeWidth={1.75} aria-hidden />
      {count ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-none text-background ring-2 ring-background tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
