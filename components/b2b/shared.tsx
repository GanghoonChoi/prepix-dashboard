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
const errors: Record<string, [string, string]> = {
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
  const message = errors[code] ?? [
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
