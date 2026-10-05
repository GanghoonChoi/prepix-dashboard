"use client";
import { useI18n } from "@/lib/i18n/context";
import type { ProjectState, TeamState } from "@/lib/api/services/b2b.service";
import { secondaryClass } from "@/components/workspaces/shared";

export const stateLabels: Record<TeamState | ProjectState, [string, string]> = {
  preparing: ["준비", "Preparing"],
  active: ["이용 중", "Active"],
  read_only: ["열람·다운로드 가능", "Read and export"],
  recovery: ["복구 보관", "Recovery storage"],
  deletion_due: ["삭제 예정", "Deletion pending"],
  deleting: ["삭제 중", "Deleting"],
  deleted: ["삭제 완료", "Deleted"],
  draft: ["준비", "Draft"],
  in_progress: ["진행", "In progress"],
  completed: ["완료", "Completed"],
  archived: ["보관", "Archived"],
};
export function useCopy() {
  const { lang } = useI18n();
  return (ko: string, en: string) => (lang === "ko" ? ko : en);
}
export function errorCode(error: unknown): string {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  return typeof message === "string" ? message : "REQUEST_FAILED";
}
export function definitivelyRejected(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}
const invitationErrors: Record<string, [string, string]> = {
  B2B_DEVICE_RETIRED: [
    "이미 등록 해제가 요청된 장치입니다. 현재 장치 상태를 확인해 주세요.",
    "Retirement has already been requested for this device. Review its current state.",
  ],
  B2B_DEVICE_NOT_FOUND: [
    "현재 계정의 등록 장치를 찾을 수 없습니다.",
    "This account's registered device is unavailable.",
  ],
  B2B_DEVICE_LIMIT_REACHED: [
    "장치 정원이 가득 찼습니다. 기존 장치의 반납 또는 만료를 확인한 뒤 등록해 주세요.",
    "Device capacity is full. Wait for an old device to be discarded or expire before registering.",
  ],
  INVITATION_EMAIL_MISMATCH: [
    "초대받은 이메일의 계정으로 로그인해 주세요.",
    "Sign in with the invited email account.",
  ],
  INVITATION_UNAVAILABLE: [
    "유효한 초대를 찾을 수 없습니다.",
    "This invitation is unavailable.",
  ],
  INVITATION_EXPIRED: [
    "초대가 만료되었습니다. 담당자에게 다시 초대해 달라고 요청하세요.",
    "The invitation expired. Ask the lead for a new invitation.",
  ],
  INVITATION_REVOKED: ["취소된 초대입니다.", "This invitation was cancelled."],
  B2B_ALREADY_INVITED: [
    "해당 범위의 초대가 이미 대기 중입니다. 기존 초대를 확인해 주세요.",
    "An invitation for this scope is already pending. Check the existing invitation.",
  ],
  B2B_ALREADY_PARTICIPATING: [
    "이미 이 프로젝트에 참여하고 있습니다. 역할 변경을 이용해 주세요.",
    "This person already participates. Use role changes instead.",
  ],
  B2B_PROJECT_INVITATION_REQUIRED: [
    "새 참여자는 초대 수락 후 추가됩니다. 프로젝트 초대를 이용해 주세요.",
    "New participation requires acceptance. Send a project invitation.",
  ],
  B2B_AFFILIATION_CHANGE_REQUIRED: [
    "현재 팀 참여 구분이 초대와 다릅니다. 소유자가 참여 구분을 먼저 확인해야 합니다.",
    "The current affiliation differs. The owner must review it first.",
  ],
  B2B_INVITATION_CONFIGURATION_REQUIRED: [
    "초대 메일 설정이 준비되지 않았습니다. 팀 관리자에게 문의하세요.",
    "Invitation delivery is not configured. Contact a team administrator.",
  ],
  B2B_PROJECT_LEAD_TRANSFER_REQUIRED: [
    "담당자 역할을 이전한 뒤 참여 구분을 변경해 주세요.",
    "Transfer the lead role before changing affiliation.",
  ],
  B2B_EXTERNAL_ADMIN_DENIED: [
    "외부 참여자는 팀 관리자가 될 수 없습니다.",
    "External collaborators cannot become team administrators.",
  ],
};
const errors: Record<string, [string, string]> = {
  B2B_AI_ACCOUNTING_REVIEW_REQUIRED: [
    "사용량 기록을 확인하고 있습니다. 확인이 끝날 때까지 새 작업과 정산을 진행할 수 없습니다.",
    "Usage records need review. New jobs and settlement are unavailable until this is resolved.",
  ],
  B2B_AI_JOB_NOT_FOUND: [
    "현재 계정에서 접근할 수 있는 AI 작업을 찾을 수 없습니다.",
    "This AI job is unavailable to your current account.",
  ],
  B2B_AI_CURSOR_INVALID: [
    "사용 내역의 조회 위치를 확인할 수 없습니다. 처음 내역부터 다시 확인해 주세요.",
    "The history position is invalid. Check the latest jobs again.",
  ],
  B2B_LICENCE_CAPACITY_FULL: [
    "구매 정원이 가득 찼습니다. 회수 대기인 장치가 모두 종료되거나 추가 구매가 반영된 뒤 배정할 수 있습니다.",
    "Purchased capacity is full. Assign after all pending devices end or added capacity is applied.",
  ],
  B2B_LICENCE_ALREADY_ASSIGNED: [
    "이 기간에 이미 이용권이 배정되어 있습니다. 현재 배정 목록을 확인해 주세요.",
    "A licence is already assigned for this period. Review the current assignments.",
  ],
  B2B_LICENCE_CLOSED: [
    "이미 회수되거나 종료된 배정입니다. 최신 상태를 확인해 주세요.",
    "This assignment has been revoked or ended. Review its current state.",
  ],
  B2B_LICENCE_PERIOD_CLOSED: [
    "구매 기간이 종료되거나 변경되었습니다. 현재 구매 기간을 확인해 주세요.",
    "The purchased period ended or changed. Review the current period.",
  ],
  B2B_PURCHASED_PERIOD_NOT_FOUND: [
    "실제 구매가 반영된 기간을 확인할 수 없습니다. 이용 상태와 구매 내역을 확인해 주세요.",
    "No applied purchase period could be verified. Review the team status and purchases.",
  ],
  B2B_USER_LIMIT_BELOW_USAGE: [
    "개인 한도는 확정 사용과 예약의 합보다 낮출 수 없습니다. 최신 사용량을 확인해 주세요.",
    "The personal limit cannot be below confirmed and reserved usage. Review the current usage.",
  ],
  B2B_USER_LIMIT_SEPARATE_CHANGE_REQUIRED: [
    "재배정은 기존 개인 한도를 유지합니다. 한도 변경은 별도 변경 화면에서 처리해 주세요.",
    "Reassignment keeps the existing personal limit. Change it separately.",
  ],
  B2B_USER_LIMIT_INVALID: [
    "AI 한도에 0 이상의 정수를 입력해 주세요.",
    "Enter a non-negative whole number for the AI limit.",
  ],
  B2B_LICENCE_SCHEDULE_INVALID: [
    "이용기간 안의 미래 시각을 한국 시간으로 지정해 주세요.",
    "Choose a future time within the period in Korea time.",
  ],
  B2B_LICENCE_SCHEDULE_HAS_LONGER_GRANTS: [
    "이미 발급된 오프라인 허가보다 이른 예정 회수는 설정할 수 없습니다. 즉시 회수하면 장치 종료를 기다립니다.",
    "The scheduled cutoff cannot precede an issued offline grant. Immediate revocation waits for devices to end.",
  ],
  B2B_PRODUCT_NOT_CONFIGURED: [
    "상품과 제공량 설정이 아직 준비되지 않았습니다.",
    "Product and allowance settings are not ready yet.",
  ],
  B2B_PRODUCT_VERSION_CONFLICT: [
    "상품 조건을 확인할 수 없습니다. 결제 담당자에게 문의해 주세요.",
    "The product conditions cannot be verified. Contact your billing administrator.",
  ],
  B2B_PRODUCT_VERSION_CHANGED: [
    "상품 조건이 변경되었습니다. 최신 조건을 확인한 뒤 견적을 다시 만들어 주세요.",
    "The product conditions changed. Review the latest conditions and request a new quote.",
  ],
  B2B_QUOTE_TARGET_CHANGED: [
    "팀 이용 상태가 변경되었습니다. 현재 상태를 확인한 뒤 구매 대상을 다시 선택해 주세요.",
    "The team status changed. Check its current status and select the purchase period again.",
  ],
  B2B_QUOTE_PERIOD_CHANGED: [
    "구매 기간이 변경되었거나 확인되지 않았습니다. 현재 기간을 다시 확인해 주세요.",
    "The purchased period changed or could not be verified. Check the current period again.",
  ],
  B2B_NEXT_PERIOD_ALREADY_PURCHASED: [
    "다음 한 달을 이미 구매했습니다. 현재 구매 내역을 확인해 주세요.",
    "The next month is already purchased. Review your purchase history.",
  ],
  B2B_QUOTE_SELECTION_INVALID: [
    "추가 수량을 확인해 주세요. 현재 기간에 추가할 항목은 하나 이상 선택해야 합니다.",
    "Check the quantities. Select at least one item when adding to the current period.",
  ],
  B2B_QUOTE_AMOUNT_TOO_SMALL: [
    "남은 기간의 결제 금액이 너무 작습니다. 수량이나 다음 기간 구매를 확인해 주세요.",
    "The remaining-period amount is too small. Check the quantities or the next-period purchase.",
  ],
  B2B_QUOTE_AMOUNT_INVALID: [
    "이 수량의 견적을 계산할 수 없습니다. 구매 수량을 확인해 주세요.",
    "A quote cannot be calculated for these quantities. Review the selection.",
  ],
  B2B_QUOTE_NOT_FOUND: [
    "견적을 찾을 수 없습니다. 팀과 견적 주소를 확인해 주세요.",
    "The quote could not be found. Check the team and quote address.",
  ],
  B2B_OWNER_REQUIRED: [
    "팀 소유자만 이 변경을 할 수 있습니다.",
    "Only the team owner can make this change.",
  ],
  B2B_OWNER_PROTECTED: [
    "소유자는 소유권 이전을 완료한 뒤 참여를 종료할 수 있습니다.",
    "Complete ownership transfer before ending the owner's participation.",
  ],
  B2B_SELF_CHANGE_DENIED: [
    "본인의 역할 변경은 소유자에게 요청해 주세요. 탈퇴는 설정에서 할 수 있습니다.",
    "Ask the owner to change your role. Leave through settings.",
  ],
  B2B_MEMBER_STATE_CONFLICT: [
    "참여 상태가 이미 변경되었습니다. 최신 명단을 확인해 주세요.",
    "Participation has already changed. Review the current roster.",
  ],
  B2B_TEAM_MANAGER_REQUIRED: [
    "내부 팀 관리자만 이 화면에 접근할 수 있습니다.",
    "This page requires an internal team administrator.",
  ],
  B2B_LEAD_RECOVERY_NOT_ALLOWED: [
    "현재 담당자가 유효한 프로젝트는 소유자가 담당자를 대신 변경할 수 없습니다.",
    "The owner cannot replace a currently valid project lead.",
  ],
  B2B_ACCEPTED_SUCCESSOR_REQUIRED: [
    "이미 프로젝트 참여를 수락한 내부 참여자를 지정해 주세요.",
    "Choose an internal participant who has already accepted project participation.",
  ],
  B2B_BILLING_PERMISSION_REQUIRED: [
    "결제 권한이 필요한 화면입니다.",
    "This page requires billing permission.",
  ],
  B2B_PROJECT_NOT_FOUND: [
    "프로젝트를 찾을 수 없거나 접근 권한이 없습니다.",
    "This project is unavailable or you no longer have access.",
  ],
  B2B_TEAM_NOT_FOUND: [
    "팀에 접근할 수 없습니다.",
    "You cannot access this team.",
  ],
  B2B_REVISION_CONFLICT: [
    "다른 사람이 먼저 변경했습니다. 입력 내용은 보존했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
    "Someone changed this first. Your draft is preserved. Review the current version before trying again.",
  ],
  B2B_REQUEST_KEY_CONFLICT: [
    "처리 중인 요청의 내용이 달라졌습니다. 결과를 확인한 뒤 새 요청을 만들어 주세요.",
    "The pending request has different contents. Check its result before creating a new request.",
  ],
  B2B_TEAM_PREPARING: [
    "첫 이용권 반영 후 프로젝트 업무를 시작할 수 있습니다.",
    "Project work starts after the first purchase is applied.",
  ],
  B2B_TEAM_READ_ONLY: [
    "이용기간이 종료되어 열람과 다운로드만 가능합니다.",
    "The team period has ended. Reading and downloading remain available.",
  ],
  B2B_TEAM_RECOVERY: [
    "복구 보관 중에는 프로젝트 자료를 열 수 없습니다.",
    "Project content is unavailable during recovery storage.",
  ],
  B2B_PROJECT_REOPEN_REQUIRED: [
    "완료하거나 보관한 프로젝트는 재개 후 변경할 수 있습니다.",
    "Reopen the completed project before changing it.",
  ],
  B2B_PROJECT_LEAD_REQUIRED: [
    "프로젝트 담당자만 변경할 수 있습니다.",
    "Only the project lead can make this change.",
  ],
  B2B_PROJECT_PEOPLE_RESTRICTED: [
    "이 역할에서는 참여자 명단을 볼 수 없습니다.",
    "This role cannot view the participant roster.",
  ],
  B2B_PROJECT_LEAD_PROTECTED: [
    "담당자는 후임에게 역할을 이전한 뒤 변경할 수 있습니다.",
    "Transfer the lead role before changing this participant.",
  ],
  B2B_INTERNAL_SUCCESSOR_REQUIRED: [
    "팀 내부 참여자를 후임으로 지정해 주세요.",
    "Choose an internal team participant as successor.",
  ],
};
export function B2bError({
  code,
  retry,
}: {
  code: string;
  retry?: () => void;
}) {
  const c = useCopy();
  const message = errors[code] ??
    invitationErrors[code] ?? [
      "요청을 완료하지 못했습니다. 입력을 유지한 채 다시 시도할 수 있습니다.",
      "The request could not be completed. Your input is preserved.",
    ];
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{c(...message)}</p>
      {retry && (
        <button
          type="button"
          className={`${secondaryClass} mt-3`}
          onClick={retry}
        >
          {c("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}
export function StateBadge({ state }: { state: TeamState | ProjectState }) {
  const c = useCopy();
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-xs">
      {c(...stateLabels[state])}
    </span>
  );
}
