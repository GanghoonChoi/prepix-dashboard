"use client";
import { useCopy } from "./shared";

/**
 * The four team roles, side by side on the members page: a name, the seat it
 * takes, and what it can do in short noun phrases — not sentences.
 *
 * Every line is a rule the backend enforces (prepix-backend, checked
 * 2026-10-12): managers are internal owners and admins (b2b-core `manager()`);
 * only the owner appoints admins or hands over ownership (members.service,
 * ownership.service); 플랜과 결제 needs 결제 권한, which the owner always has
 * and can give an admin (b2b-core `requireBilling`); viewers get no archive
 * (cloud.service) and no paid seat (licences.service).
 */
export type TeamRole = "owner" | "admin" | "editor" | "reviewer";

export const roleName: Record<TeamRole, [string, string]> = {
  owner: ["소유자", "Owner"],
  admin: ["관리자", "Admin"],
  editor: ["편집자", "Editor"],
  reviewer: ["뷰어", "Viewer"],
};

/** One short line per role, for the invite form and the role dialogs. */
export const roleSummary: Record<TeamRole, [string, string]> = {
  owner: ["팀의 모든 권한. 한 명만 둘 수 있어요.", "Every permission. One per team."],
  admin: ["멤버와 팀 설정 관리. 여러 명 둘 수 있어요.", "Manages people and settings. You can have several."],
  editor: ["프로젝트를 만들고 영상을 올려요.", "Creates projects and uploads videos."],
  reviewer: ["영상을 보고 코멘트만 해요. 무료예요.", "Watches and comments. Free."],
};

const CAN: Record<TeamRole, [string, string][]> = {
  owner: [
    ["관리자가 하는 모든 일", "Everything an admin does"],
    ["플랜과 결제", "Plan and billing"],
    ["관리자 지정", "Appoint admins"],
    ["소유자 넘기기", "Hand over ownership"],
  ],
  admin: [
    ["멤버 초대, 역할 변경", "Invite people, change roles"],
    ["팀 설정", "Team settings"],
    ["프로젝트 만들기, 영상 올리기", "Create projects, upload"],
    ["플랜과 결제 (결제 권한이 있을 때)", "Plan and billing (with billing permission)"],
  ],
  editor: [
    ["프로젝트 만들기", "Create projects"],
    ["영상·자료 올리기", "Upload videos and files"],
    ["콘텐츠 아카이브", "Content archive"],
  ],
  reviewer: [
    ["참여한 프로젝트 영상 보기", "Watch projects they're in"],
    ["코멘트, 승인·수정 요청", "Comment, approve, request changes"],
  ],
};

const SEAT: Record<TeamRole, [string, string]> = {
  owner: ["유료 좌석", "Paid seat"],
  admin: ["유료 좌석", "Paid seat"],
  editor: ["유료 좌석", "Paid seat"],
  reviewer: ["무료", "Free"],
};

export function TeamRoles() {
  const c = useCopy();
  return (
    <section aria-labelledby="team-roles" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="team-roles" className="text-sm font-semibold">
          {c("역할", "Roles")}
        </h2>
        <p className="text-xs text-muted">
          {c("역할은 소유자와 관리자만 바꿀 수 있어요.", "Only the owner and admins change roles.")}
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(CAN) as TeamRole[]).map((role) => (
          <li key={role} className="rounded-lg border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{c(...roleName[role])}</h3>
              <span className="text-xs text-muted">{c(...SEAT[role])}</span>
            </div>
            <ul className="mt-2.5 space-y-1 text-[13px] leading-5">
              {CAN[role].map((item) => (
                <li key={item[0]} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                  {c(...item)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
