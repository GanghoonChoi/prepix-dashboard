"use client";
import { Check, Minus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useCopy } from "./shared";

/**
 * What each team role can do — on the members page, in the open.
 *
 * Every cell is a rule the backend enforces (checked 2026-10-12 against
 * prepix-backend origin/main):
 *  - managers are internal owners and admins — b2b-core.service `manager()`
 *  - only the owner invites, appoints or demotes an admin — invitations.service
 *    `issue()`, members.service `change()`; admins manage everyone else
 *  - 플랜과 결제 needs 결제 권한 (`billingAllowed`), which the owner always has
 *    and gives per person; it is not part of any role — b2b-core `requireBilling`
 *  - projects: owner, admin and editor create them and make in team-wide ones;
 *    a viewer watches and comments — projects.service, b2b-core `implicitMaker`
 *  - a viewer is refused the archive — cloud.service `access()`
 *  - a viewer holds no paid seat — licences.service
 *  - private projects show only to their participants, owner included —
 *    project-participation.ts
 * A table that is merely plausible is worse than none: people plan around it.
 */
export type TeamRole = "owner" | "admin" | "editor" | "reviewer";
const ROLES: TeamRole[] = ["owner", "admin", "editor", "reviewer"];

/** One line per role, shared with the invite form and the admin dialog. */
export const roleSummary: Record<TeamRole, [string, string]> = {
  owner: ["팀의 주인이에요. 한 명뿐이고 모든 권한이 있어요.", "Owns the team. There is one, with every permission."],
  admin: [
    "소유자와 함께 팀을 운영해요. 여러 명 둘 수 있어요.",
    "Runs the team with the owner. You can have several.",
  ],
  editor: ["프로젝트를 만들고 영상과 자료를 올려요.", "Creates projects and uploads videos and files."],
  reviewer: ["참여한 프로젝트의 영상을 보고 코멘트해요. 무료예요.", "Watches and comments on projects they're in. Free."],
};

export const roleName: Record<TeamRole, [string, string]> = {
  owner: ["소유자", "Owner"],
  admin: ["관리자", "Admin"],
  editor: ["편집자", "Editor"],
  reviewer: ["뷰어", "Viewer"],
};

type Cell = boolean | [string, string];
const BILLING: [string, string] = ["결제 권한이 있으면", "With billing permission"];
const ROWS: [[string, string], Cell, Cell, Cell, Cell][] = [
  [["참여한 프로젝트의 영상 보기·코멘트", "Watch and comment on projects they're in"], true, true, true, true],
  [["프로젝트 만들기, 팀 공개 프로젝트에 올리기", "Create projects, upload to team-wide ones"], true, true, true, false],
  [["콘텐츠 아카이브", "Content archive"], true, true, true, false],
  [["멤버 초대·역할 변경·제거", "Invite, change roles, remove"], true, ["관리자는 제외", "Not admins"], false, false],
  [["팀 설정", "Team settings"], true, true, false, false],
  [["관리자 지정", "Appoint admins"], true, false, false, false],
  [["플랜과 결제", "Plan and billing"], true, BILLING, BILLING, false],
  [["소유권 이전, 프로젝트 담당자 복구", "Transfer ownership, restore a project lead"], true, false, false, false],
  [["편집 좌석", "Editing seat"], ["유료", "Paid"], ["유료", "Paid"], ["유료", "Paid"], ["무료", "Free"]],
];

export function TeamRoles() {
  const c = useCopy();
  return (
    <Card>
      <CardHeader
        title={c("역할과 권한", "Roles and permissions")}
        description={c(
          "역할은 멤버 목록에서 바로 바꿀 수 있어요. 관리자는 소유자만 지정할 수 있어요.",
          "Change a role right in the list above. Only the owner appoints admins.",
        )}
      />
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border align-bottom">
              <th scope="col" className="w-[34%] pb-3 pr-4 text-left text-xs font-medium text-muted">
                {c("할 수 있는 일", "Can")}
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className="pb-3 pr-3 text-left font-normal">
                  <span className="block text-sm font-semibold">{c(...roleName[role])}</span>
                  <span className="mt-0.5 block text-xs leading-[18px] text-muted">{c(...roleSummary[role])}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, ...cells]) => (
              <tr key={label[0]} className="border-b border-border last:border-0">
                <th scope="row" className="py-2.5 pr-4 text-left font-normal leading-5">
                  {c(...label)}
                </th>
                {cells.map((cell, i) => (
                  <td key={ROLES[i]} className="py-2.5 pr-3 align-middle">
                    {cell === true ? (
                      <Check size={16} strokeWidth={2} aria-label={c("가능", "Yes")} />
                    ) : cell === false ? (
                      // A dash, not a cross: "not this role's job", not "forbidden".
                      <Minus size={16} strokeWidth={1.75} className="text-muted/60" aria-label={c("불가", "No")} />
                    ) : (
                      <span className="text-xs leading-5 text-muted">{c(...cell)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-1 text-xs leading-5 text-muted">
        <li>
          {c(
            "결제 권한은 역할과 따로예요. 소유자가 멤버마다 ⋯ 메뉴에서 주거나, 관리자로 지정하면서 함께 줄 수 있어요.",
            "Billing permission is separate from the role. The owner gives it per person from the ⋯ menu, or along with making someone an admin.",
          )}
        </li>
        <li>
          {c(
            "비공개 프로젝트는 소유자·관리자라도 참여한 사람에게만 보여요.",
            "A private project shows only to its participants, owner and admins included.",
          )}
        </li>
      </ul>
    </Card>
  );
}
