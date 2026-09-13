"use client";
import { useI18n } from "@/lib/i18n/context";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { bytes } from "@/lib/workspaces/upload";
import type { StorageUsage } from "@/lib/api/services/cloud.service";
import { secondaryClass } from "./shared";
const messages: Record<string, [string, string]> = {
  WORKSPACE_REAUTH_FAILED: [
    "본인 확인에 실패했습니다. 현재 계정의 비밀번호 또는 연결된 Google 계정을 확인하세요.",
    "Verification failed. Use your current password or linked Google account.",
  ],
  WORKSPACE_REAUTH_EXPIRED: [
    "본인 확인 시간이 지났습니다. 다시 확인하세요.",
    "Verification expired. Please verify again.",
  ],
  WORKSPACE_TRANSFER_PENDING: [
    "진행 중인 소유권 이전이 있습니다. 먼저 완료하거나 취소하세요.",
    "An ownership transfer is pending. Complete or cancel it first.",
  ],
  WORKSPACE_TRANSFER_UNAVAILABLE: [
    "이전 요청이 만료되었거나 처리되었습니다. 새로고침하세요.",
    "This transfer expired or was already resolved. Refresh the page.",
  ],
  WORKSPACE_MANAGEMENT_DISABLED: [
    "워크스페이스 관리 기능을 준비 중입니다.",
    "Workspace management is not enabled yet.",
  ],
  WORKSPACE_SETTINGS_CHANGED: [
    "다른 관리자가 설정을 변경했습니다. 새로고침한 뒤 다시 저장하세요.",
    "Another administrator changed these settings. Refresh before saving again.",
  ],
  WORKSPACE_SUCCESSOR_INVALID: [
    "참여 중인 관리자 또는 편집자를 인수자로 선택하세요.",
    "Choose an active admin or editor as the successor.",
  ],
  WORKSPACE_MEMBER_SUSPENDED: [
    "팀 참여가 정지되어 있습니다. 관리자에게 참여 재개를 요청하세요.",
    "Your membership is suspended. Ask an administrator to reactivate it.",
  ],

  UPLOAD_SESSION_LOST: [
    "저장소의 업로드 세션이 종료되었습니다. 이 업로드를 취소하고 새로 시작하세요.",
    "The storage upload session has ended. Cancel this upload and start a new one.",
  ],
  TEAM_PURGE_UNAVAILABLE: [
    "이 환경에서는 영구 삭제를 아직 사용할 수 없습니다.",
    "Permanent deletion is not enabled in this environment.",
  ],
  ASSET_DELETE_CONFIRMATION_REQUIRED: [
    "먼저 파일을 휴지통으로 옮기세요. 파일 이름이 변경되었다면 목록을 새로고침하세요.",
    "Move the file to trash first. If its name has changed, refresh the list.",
  ],
  ASSET_EXPIRED: [
    "보관 기한이 지난 원본은 복구할 수 없습니다.",
    "This original has expired and cannot be restored.",
  ],
  UPLOAD_NOT_ACTIVE: [
    "이미 완료되었거나 취소된 업로드입니다. 파일 목록을 새로고침하세요.",
    "This upload is already complete or cancelled. Refresh the file list.",
  ],
  UPLOAD_ID_CONFLICT: [
    "다른 업로드와 정보가 일치하지 않습니다. 파일 목록에서 원래 업로드를 선택하세요.",
    "Upload details do not match. Select the original upload from the file list.",
  ],
  PROJECT_ROLE_EXCEEDED: [
    "검토자에게는 보기 또는 다운로드 권한만 부여할 수 있습니다.",
    "Reviewers can only receive view or download access.",
  ],
  WORKSPACE_OWNER_PROTECTED: [
    "소유자는 멤버 관리에서 제거하거나 역할을 변경할 수 없습니다.",
    "The workspace owner cannot be removed or demoted here.",
  ],
  TEAM_PROJECTS_DISABLED: [
    "이 환경에서는 팀 프로젝트를 아직 사용할 수 없습니다.",
    "Team projects are not enabled in this environment.",
  ],
  TEAM_UPLOADS_UNAVAILABLE: [
    "새 업로드가 잠시 중단되어 있습니다. 기존 파일은 계속 확인할 수 있습니다.",
    "New uploads are paused. Existing files remain available.",
  ],
  TEAM_STORAGE_UNAVAILABLE: [
    "저장소에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
    "Storage is unavailable. Please try again shortly.",
  ],
  TEAM_STORAGE_FULL: [
    "저장 용량이 부족합니다. 업로드 중인 파일도 용량에 포함됩니다.",
    "Storage is full. Pending uploads also reserve capacity.",
  ],
  PROJECT_NOT_FOUND: [
    "프로젝트를 찾을 수 없거나 접근 권한이 없습니다.",
    "This project is unavailable or you no longer have access.",
  ],
  WORKSPACE_NOT_FOUND: [
    "워크스페이스를 찾을 수 없거나 참여가 종료되었습니다.",
    "This workspace is unavailable or your membership has ended.",
  ],
  PROJECT_PERMISSION_DENIED: [
    "이 작업을 할 권한이 없습니다. 팀 관리자에게 확인하세요.",
    "You do not have permission for this action. Contact a team administrator.",
  ],
  UPLOAD_RESUME_MISMATCH: [
    "원래 업로드하던 파일과 내용이 다릅니다. 같은 원본 파일을 선택하세요.",
    "This file differs from the original upload. Select the same original file.",
  ],
  UPLOAD_EXPIRED: [
    "이어 올리기 기간이 지났습니다. 새 업로드를 시작하세요.",
    "This upload session expired. Start a new upload.",
  ],
  UPLOAD_FILE_INVALID: [
    "비어 있는 파일이거나 파일 크기 제한을 초과했습니다.",
    "This file is empty or exceeds the file size limit.",
  ],
  UPLOAD_TRANSFER_FAILED: [
    "전송이 중단되었습니다. 같은 파일을 선택하면 완료된 부분부터 이어 올립니다.",
    "Transfer was interrupted. Select the same file to resume completed parts.",
  ],
  UPLOAD_INCOMPLETE: [
    "일부 파일 조각이 누락되었습니다. 이어 올리기를 다시 시도하세요.",
    "Some parts are missing. Resume this upload.",
  ],
  UPLOAD_OWNER_REQUIRED: [
    "업로드를 시작한 계정으로 이어 올릴 수 있습니다.",
    "Resume using the account that started this upload.",
  ],
  ASSET_NOT_READY: [
    "파일을 검증 중이거나 다운로드할 수 없는 상태입니다.",
    "This file is being verified or is unavailable for download.",
  ],
  TEAM_NAME_INVALID: [
    "이름을 확인하세요. 경로 기호와 줄바꿈은 사용할 수 없습니다.",
    "Check the name. Path separators and line breaks are not allowed.",
  ],
  WORKSPACE_SEATS_FULL: [
    "사용 중인 좌석과 대기 중인 초대가 좌석 한도에 도달했습니다.",
    "Members and pending invitations already use all available seats.",
  ],
};
export function cloudErrorCode(error: unknown) {
  return error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : workspaceError(error);
}
export function CloudError({
  code,
  retry,
}: {
  code: string;
  retry?: () => void;
}) {
  const { lang } = useI18n();
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>
        {
          (messages[code] ?? [
            "요청을 완료하지 못했습니다. 다시 시도하세요.",
            "The request could not be completed. Please try again.",
          ])[lang === "ko" ? 0 : 1]
        }
      </p>
      {retry && (
        <button className={secondaryClass} onClick={retry}>
          {lang === "ko" ? "다시 시도" : "Try again"}
        </button>
      )}
    </div>
  );
}
export function StorageMeter({ storage }: { storage: StorageUsage }) {
  const { lang } = useI18n();
  return (
    <div className="space-y-3 rounded-xl border border-border p-5">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{lang === "ko" ? "팀 저장 용량" : "Team storage"}</span>
        <span className="tabular-nums">
          {bytes(storage.used + storage.reserved)} / {bytes(storage.limit)}
        </span>
      </div>
      <CloudProgress
        label={lang === "ko" ? "팀 저장 용량 사용량" : "Team storage usage"}
        value={storage.used + storage.reserved}
        max={storage.limit}
      />
      <p className="text-xs leading-5 text-muted tabular-nums">
        {lang === "ko"
          ? `저장 ${bytes(storage.used)} · 업로드 예약 ${bytes(storage.reserved)}`
          : `${bytes(storage.used)} stored · ${bytes(storage.reserved)} reserved for uploads`}
      </p>
    </div>
  );
}
export function CloudProgress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary"
    >
      <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
    </div>
  );
}
