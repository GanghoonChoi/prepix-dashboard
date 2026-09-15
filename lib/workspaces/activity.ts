const labels: Record<string, [string, string]> = {
  "workspace.updated": ["워크스페이스 설정 변경", "Workspace settings updated"],
  "member.suspended": ["멤버 참여 정지", "Member suspended"],
  "member.reactivated": ["멤버 참여 재개", "Member reactivated"],
  "member.left": ["멤버 탈퇴", "Member left"],
  "member.work_reassigned": [
    "담당 프로젝트 인수인계",
    "Project responsibilities reassigned",
  ],
  "project.manager_changed": [
    "프로젝트 담당자 변경",
    "Project manager changed",
  ],
  "ownership.requested": ["소유권 이전 요청", "Ownership transfer requested"],
  "ownership.transferred": ["소유권 이전 완료", "Ownership transferred"],
  "ownership.cancelled": ["소유권 이전 취소", "Ownership transfer cancelled"],
  "ownership.declined": ["소유권 이전 거절", "Ownership transfer declined"],
  "workspace.created": ["워크스페이스 생성", "Workspace created"],
  // A background sweep, not a person — the row renders with no actor.
  "asset.purged": [
    "보관 기한이 지나 원본 삭제",
    "Original removed after its retention period",
  ],
  "onboarding.completed": ["팀 시작 설정 완료", "Team setup completed"],
  "member.removed": ["멤버 접근 종료", "Member removed"],
  "member.role_changed": ["멤버 역할 변경", "Member role changed"],
  "invitation.created": ["동료 초대", "Member invited"],
  "invitation.accepted": ["초대 수락", "Invitation accepted"],
  "invitation.revoked": ["초대 취소", "Invitation revoked"],
  "invitation.resent": ["초대 다시 전송", "Invitation resent"],
  "project.created": ["프로젝트 생성", "Project created"],
  "project.updated": ["프로젝트 설정 변경", "Project settings updated"],
  "project.access_changed": [
    "프로젝트 접근 권한 변경",
    "Project access changed",
  ],
  "folder.created": ["폴더 생성", "Folder created"],
  "upload.started": ["원본 업로드 시작", "Original upload started"],
  "upload.completed": ["원본 전송 완료", "Original transfer completed"],
  "upload.cancelled": ["업로드 취소", "Upload cancelled"],
  "asset.updated": ["파일 이름 또는 폴더 변경", "File renamed or moved"],
  "asset.trashed": ["파일을 휴지통으로 이동", "File moved to trash"],
  "asset.restored": ["파일 복구", "File restored"],
  "asset.deletion_requested": [
    "원본 영구 삭제 요청",
    "Original deletion requested",
  ],
};
export function activityLabel(action: string, lang: string) {
  // An unknown action falls back to the raw action string. Naming it
  // "Team settings updated" made the audit trail assert an event that never
  // happened, which is worse than an unfamiliar identifier (F12).
  return labels[action]?.[lang === "ko" ? 0 : 1] ?? action;
}
