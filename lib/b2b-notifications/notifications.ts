import { apiClient } from "../api/client";
import type {
  UserNotification,
  UserNotificationDestination,
  UserNotificationList,
  UserNotificationOpen,
  UserNotificationRead,
  UserNotificationUnread,
} from "../api/generated/b2b";

// S27. SOT: prepix-backend backend/docs/b2b-user-notifications.md
export type NotificationScope = {
  userId: string;
  workspaceId: string | null;
  filter: "all" | "unread";
};
export const scopeKey = (s: NotificationScope) =>
  `${s.userId}|${s.workspaceId ?? "*"}|${s.filter}`;

/** A response is shown only for the account and view it was asked for.
 * Late answers for a previous account, team or filter are dropped. */
export function current<T extends { currentUserId: string }>(
  response: T,
  asked: NotificationScope,
  now: NotificationScope,
): T | null {
  return response.currentUserId === asked.userId &&
    scopeKey(asked) === scopeKey(now)
    ? response
    : null;
}

export function append(
  shown: UserNotification[],
  page: UserNotification[],
): UserNotification[] {
  const seen = new Set(shown.map((n) => n.id));
  return [...shown, ...page.filter((n) => !seen.has(n.id))];
}

export function href(d: UserNotificationDestination): string {
  const team = `/dashboard/workspaces/${encodeURIComponent(d.workspaceId)}`;
  switch (d.kind) {
    case "request":
      return `${team}/projects/${encodeURIComponent(d.projectId)}/requests/${encodeURIComponent(d.requestId)}`;
    case "project":
      return `${team}/projects/${encodeURIComponent(d.projectId)}`;
    case "project_files":
      return `${team}/projects/${encodeURIComponent(d.projectId)}/files`;
    case "library":
      return `${team}/library`;
    case "billing":
      return `${team}/plan`;
    case "team_status":
      return `${team}/status`;
    case "team":
      return team;
  }
}

const kst = (iso: unknown, ko: boolean) =>
  typeof iso === "string"
    ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-GB", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso)) + " KST"
    : "";

/** Text comes only from the kind and server params. Names appear only when
 * the server still returned them for the current account. */
export function describe(n: UserNotification, ko: boolean): string {
  if (n.access === "lost")
    return ko
      ? "현재 계정으로 볼 수 없는 알림이에요"
      : "This notification is no longer available to this account";
  const p = n.params;
  const t = (k: string, e: string) => (ko ? k : e);
  switch (n.kind) {
    case "request.assigned":
      return p.role === "confirmer"
        ? t("요청 확인자로 지정됐어요", "You were made a request confirmer")
        : t("요청 담당자로 지정됐어요", "A request was assigned to you");
    case "request.proposed":
      return t("새 요청 제안이 있어요", "A request was proposed");
    case "request.accepted":
      return t("내 요청 제안이 접수됐어요", "Your proposal was accepted");
    case "request.submitted":
      return t("확인할 제출이 있어요", "A submission is waiting for you");
    case "request.confirmed":
      return t("제출이 확인됐어요", "A submission was confirmed");
    case "request.returned":
      return t("제출에 보완 요청이 있어요", "A submission needs changes");
    case "request.declined":
      return t("내 요청 제안이 반려됐어요", "Your proposal was declined");
    case "participation.changed":
      return t("프로젝트 역할이 바뀌었어요", "Your project role changed");
    case "participation.ended":
      return t(
        "한 프로젝트의 참여가 끝났어요",
        "Your participation in a project ended",
      );
    case "project.lead_assigned":
      return t("프로젝트 담당자로 지정됐어요", "You now lead a project");
    case "membership.changed":
      return p.action === "reactivate"
        ? t("팀 접근이 다시 열렸어요", "Your team access was restored")
        : t("팀 역할이 바뀌었어요", "Your team role changed");
    case "transfer.failed":
      return p.reason === "expired"
        ? t(
            "멈춘 파일 전송이 만료됐어요",
            "A stalled file transfer expired",
          )
        : t(
            "파일 전송이 검사에서 거절됐어요",
            "A file transfer was rejected by inspection",
          );
    case "payment.received":
      return t("결제가 확인됐어요", "Payment was received");
    case "payment.applied":
      return t("결제가 이용권에 반영됐어요", "Payment was applied");
    case "payment.unknown":
      return t(
        "결제 결과를 아직 확인하지 못했어요",
        "The payment result is not confirmed yet",
      );
    case "payment.review_required":
      return t("결제 확인이 필요해요", "The payment needs review");
    case "payment.failed":
      return t("결제가 완료되지 않았어요", "The payment did not complete");
    case "lifecycle.period_ended":
      return t(
        `팀 이용기간이 끝났어요. ${kst(p.readOnlyUntil, ko)}까지 열람·다운로드할 수 있어요`,
        `The team period ended. Viewing and download remain until ${kst(p.readOnlyUntil, ko)}`,
      );
    case "lifecycle.recovery_storage":
      return t(
        `팀 자료가 복구 보관으로 바뀌었어요. ${kst(p.deletionFrom, ko)}부터 삭제돼요`,
        `Team data moved to recovery storage. Deletion from ${kst(p.deletionFrom, ko)}`,
      );
    case "lifecycle.deletion_due":
      return t("팀 자료 삭제 시각이 됐어요", "Team data deletion is due");
    case "lifecycle.ops_check":
      return t(
        `결제 확인 때문에 삭제가 멈췄어요. ${kst(p.deadline, ko)}까지 확인해요`,
        `Deletion paused for a payment check until ${kst(p.deadline, ko)}`,
      );
    case "lifecycle.deletion_started":
      return t("팀 자료 삭제가 시작됐어요", "Team data deletion started");
    case "lifecycle.deletion_completed":
      return t("팀 자료가 삭제됐어요", "Team data was deleted");
    case "notice.period_ending":
      return t(
        `팀 이용기간이 ${kst(p.periodEndsAt, ko)}에 끝나요`,
        `The team period ends at ${kst(p.periodEndsAt, ko)}`,
      );
    case "notice.deletion_scheduled":
      return t(
        `팀 자료가 ${kst(p.deletionFrom, ko)}부터 삭제돼요`,
        `Team data will be deleted from ${kst(p.deletionFrom, ko)}`,
      );
  }
  return t("새 알림이 있어요", "New notification");
}

export const NOTIFICATIONS_CHANGED = "notifications:changed";

/** Every call is pinned to one account; a response for another is an error. */
export function notificationApi(userId: string) {
  const headers = { "X-Prepix-Account-ID": userId };
  const check = <T extends { currentUserId: string }>(r: T) => {
    if (r.currentUserId !== userId)
      throw new Error("B2B_NOTIFICATION_ACCOUNT_CHANGED");
    return r;
  };
  const changed = <T>(r: T) => {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    return r;
  };
  return {
    list: async (
      scope: NotificationScope,
      cursor: string | undefined,
      signal: AbortSignal,
    ) =>
      check(
        (
          await apiClient.get<{ data: UserNotificationList }>(
            "/b2b/notifications",
            {
              headers,
              signal,
              timeout: 15000,
              params: {
                filter: scope.filter,
                ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
                ...(cursor ? { cursor } : {}),
              },
            },
          )
        ).data.data,
      ),
    unread: async (signal?: AbortSignal) =>
      check(
        (
          await apiClient.get<{ data: UserNotificationUnread }>(
            "/b2b/notifications/unread",
            { headers, signal, timeout: 15000 },
          )
        ).data.data,
      ),
    read: async (id: string, read: boolean) =>
      changed(
        check(
          (
            await apiClient.post<{ data: UserNotificationRead }>(
              `/b2b/notifications/${encodeURIComponent(id)}/read`,
              { read },
              { headers, timeout: 15000 },
            )
          ).data.data,
        ),
      ),
    open: async (id: string) =>
      changed(
        check(
          (
            await apiClient.post<{ data: UserNotificationOpen }>(
              `/b2b/notifications/${encodeURIComponent(id)}/open`,
              {},
              { headers, timeout: 15000 },
            )
          ).data.data,
        ),
      ),
  };
}

/** The signed-in account as this tab last saw it. */
export function cachedAccount(): string | null {
  try {
    const id = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}
