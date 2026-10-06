// S26/S32 presentation rules. SOT: prepix-backend backend/docs/b2b-team-lifecycle-deletion.md §1, §12.
import type {
  TeamDeletionBlockReason,
  TeamLifecycle,
  TeamState,
} from "@/lib/api/generated/b2b";

type Copy = [ko: string, en: string];

/** Exact KST instant with seconds; never a relative or rounded date. */
export function kst(iso: string, lang: "ko" | "en"): string {
  const text = new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${text} KST`;
}

export const teamStateCodes = [
  "B2B_TEAM_READ_ONLY",
  "B2B_TEAM_RECOVERY",
  "B2B_TEAM_DELETION_DUE",
  "B2B_TEAM_DELETING",
  "B2B_TEAM_DELETED",
] as const;
export const isTeamStateCode = (code: string) =>
  (teamStateCodes as readonly string[]).includes(code);

/** S32: why the requested screen cannot open. Never names the target. */
export function accessNotice(code: string): Copy | null {
  switch (code) {
    case "B2B_TEAM_READ_ONLY":
      return [
        "이용기간이 끝나 이 작업을 할 수 없습니다. 기존 권한 안의 열람과 다운로드만 가능합니다.",
        "The team period has ended, so this action is unavailable. Reading and downloading within existing access remain.",
      ];
    case "B2B_TEAM_RECOVERY":
      return [
        "복구 보관 중이라 자료를 열 수 없습니다. 결제 권한자가 이용을 복구하면 다시 열 수 있습니다.",
        "Content is in recovery storage and cannot be opened. It reopens if a billing administrator restores the team.",
      ];
    case "B2B_TEAM_DELETION_DUE":
      return [
        "삭제 예정 시각이 지나 자료를 열 수 없습니다. 삭제 시작 전까지만 복구할 수 있습니다.",
        "The deletion time has passed and content cannot be opened. Recovery is possible only until deletion starts.",
      ];
    case "B2B_TEAM_DELETING":
      return [
        "팀 자료 삭제가 시작되어 열 수 없고 복구할 수 없습니다.",
        "Team content deletion has started. It cannot be opened or recovered.",
      ];
    case "B2B_TEAM_DELETED":
      return [
        "팀 자료가 삭제되어 열 수 없습니다.",
        "Team content has been deleted and cannot be opened.",
      ];
    default:
      return null;
  }
}

const reasons: Record<TeamDeletionBlockReason, Copy> = {
  payment_hold: ["복구 결제 진행으로 한 번의 30분 보류 중", "One-time 30-minute hold for a recovery payment"],
  payment_unknown: ["결제 결과 확인 중", "Payment result being confirmed"],
  received_unapplied: ["수납 후 이용권 반영 대기", "Payment received, application pending"],
  review_required: ["결제 운영 확인 필요", "Payment needs operations review"],
  order_pending: ["진행 중인 결제 확인 필요", "An in-progress payment needs review"],
  settings_missing: ["삭제 운영 설정 확인 대기", "Waiting for approved deletion settings"],
  operator_hold: ["운영 보류", "Held by operations"],
  operator_released: ["운영 확인 후 재검사 대기", "Released by operations, rechecking"],
};
export const reasonCopy = (reason: TeamDeletionBlockReason): Copy =>
  reasons[reason] ?? ["확인 중", "Under review"];

/** S26 deletion line. Billing-only details are not used here. */
export function deletionCopy(view: TeamLifecycle): Copy {
  const d = view.deletion;
  // Checks, holds or missing settings: no start time is promised, and nobody
  // without billing permission learns which of them it is (server-shaped).
  if (d.preparing && d.state !== "running" && d.state !== "completed")
    return ["삭제 시작 전 확인 중입니다. 시작 시각은 아직 확정되지 않았습니다.", "Checks are under way before deletion starts. No start time is set yet."];
  switch (d.state) {
    case "running":
      return ["삭제가 진행 중입니다. 복구할 수 없습니다.", "Deletion is in progress. Recovery is no longer possible."];
    case "completed":
      return ["팀 자료 삭제가 완료되었습니다.", "Team content deletion is complete."];
    case "ops_check":
      return ["결제 확인이 필요해 삭제를 멈췄습니다. 운영팀이 확인합니다.", "Deletion is paused while a payment is confirmed by operations."];
    case "held":
      return ["운영 보류로 삭제가 멈춰 있습니다.", "Deletion is held by operations."];
    case "waiting":
      return ["삭제 시작 전 확인을 기다리고 있습니다.", "Waiting on checks before deletion starts."];
    default:
      return view.currentState === "deletion_due"
        ? ["삭제 예정 시각이 지났습니다. 삭제가 시작되기 전까지 복구할 수 있습니다.", "The deletion time has passed. Recovery stays possible until deletion starts."]
        : ["삭제가 시작되지 않았습니다.", "Deletion has not started."];
  }
}

export const contentStates: TeamState[] = ["active", "read_only"];
