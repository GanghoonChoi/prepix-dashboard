"use client";
import { InfoTip } from "@/components/ui";
import { useCopy } from "./shared";

/**
 * The four team roles, behind the "?" beside 역할 on the members page: a
 * name, the seat it takes, what it can do in short noun phrases, and the
 * menus it sees. Not on the page itself — the user asked twice for no
 * explanations stacked under the list (2026-10-12).
 *
 * Every line is a rule the backend enforces (prepix-backend, checked
 * 2026-10-12): managers are internal owners and admins (b2b-core `manager()`);
 * only the owner appoints admins or hands over ownership (members.service,
 * ownership.service); owners and admins see and manage every project, and
 * whoever brought a project in manages it too (b2b-core `managesProject`,
 * 2026-10-12); 플랜과 결제 needs 결제 권한, which the owner always has
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
    ["모든 프로젝트 보기·관리 (비공개 포함)", "See and manage every project, private too"],
    ["팀 설정", "Team settings"],
    ["플랜과 결제 (결제 권한이 있을 때)", "Plan and billing (with billing permission)"],
  ],
  editor: [
    ["앱에서 프로젝트 올리기", "Bring projects in from the app"],
    ["자기가 올린 프로젝트 관리", "Manage the projects they brought in"],
    ["영상·자료 올리기", "Upload videos and files"],
  ],
  reviewer: [
    ["참여한 프로젝트 영상 보기", "Watch projects they're in"],
    ["코멘트, 승인", "Comment, approve"],
  ],
};

/** The sidebar each role gets — workspaceLinks() in lib/workspaces/nav.ts;
 * the pages behind the missing entries refuse them too. */
const MENU: Record<TeamRole, [string, string]> = {
  owner: ["홈 · 프로젝트 · 멤버 · 사용량 · 플랜과 결제 · 설정", "Home · Projects · Members · Usage · Plan & billing · Settings"],
  admin: ["홈 · 프로젝트 · 멤버 · 사용량 · 설정 (+ 플랜과 결제)", "Home · Projects · Members · Usage · Settings (+ Plan & billing)"],
  editor: ["홈 · 프로젝트", "Home · Projects"],
  reviewer: ["프로젝트 (공유받은 것만)", "Projects (shared ones only)"],
};

const SEAT: Record<TeamRole, [string, string]> = {
  owner: ["유료 좌석", "Paid seat"],
  admin: ["유료 좌석", "Paid seat"],
  editor: ["유료 좌석", "Paid seat"],
  reviewer: ["무료", "Free"],
};

export function RolesTip() {
  const c = useCopy();
  return (
    <InfoTip wide label={c("역할별 권한", "What each role can do")}>
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {(Object.keys(CAN) as TeamRole[]).map((role) => (
          <li key={role} data-role-guide={role}>
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-[13px] font-semibold">{c(...roleName[role])}</strong>
              <span className="text-xs">{c(...SEAT[role])}</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-foreground">
              {CAN[role].map((item) => (
                <li key={item[0]} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                  {c(...item)}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs">
              {c("메뉴", "Menu")}: {c(...MENU[role])}
            </p>
          </li>
        ))}
      </ul>
      <p className="border-t border-border pt-2 text-xs">
        {c("역할은 소유자와 관리자만 바꿀 수 있어요.", "Only the owner and admins change roles.")}
      </p>
    </InfoTip>
  );
}
