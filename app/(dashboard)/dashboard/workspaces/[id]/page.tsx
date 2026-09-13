"use client";
import Link from "next/link";
import { FolderClosed, Users, Settings, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  TeamShell,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { MembersContent } from "@/components/workspaces/members-content";
import { ResponsibilityQueue } from "@/components/workspaces/responsibility-queue";
export default function Page() {
  const context = useWorkspace();
  const { lang, t } = useI18n();
  if (!context) return null;
  const { data, cloudEnabled } = context;
  const { workspace } = data;
  const base = `/dashboard/workspaces/${workspace.id}`;
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  if (!workspace.onboardingCompletedAt && data.canManage)
    return <MembersContent id={workspace.id} />;
  return (
    <TeamShell
      title={workspace.name}
      description={
        workspace.description ||
        c(
          "팀의 프로젝트와 멤버를 한곳에서 관리하세요.",
          "Manage your team's projects and people in one place.",
        )
      }
    >
      {data.pendingTransfer && (
        <div
          role="status"
          className="space-y-3 rounded-xl border border-border bg-surface p-5"
        >
          <p className="text-sm">
            {data.pendingTransfer.toUserId === data.currentUserId
              ? c(
                  "이 워크스페이스의 소유권 이전 요청을 받았습니다.",
                  "You have received an ownership transfer request.",
                )
              : c(
                  "새 소유자의 수락을 기다리고 있습니다.",
                  "Waiting for the new owner to accept.",
                )}
          </p>
          <Link className={secondaryClass} href={`${base}/settings`}>
            {c("이전 요청 확인", "Review transfer")}
          </Link>
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [c("내 역할", "Your role"), t(`team.role.${data.role}`)],
          [
            c("참여 중인 멤버", "Active members"),
            String(data.members.filter((m) => !m.suspendedAt).length),
          ],
          [
            c("좌석 사용 / 한도", "Seats used / limit"),
            `${data.seats.used + data.seats.reserved} / ${workspace.seatLimit}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border p-5">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-3 text-xl font-medium tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          [
            "/members",
            c("멤버와 초대", "Members and invitations"),
            c(
              "역할과 좌석, 참여 상태를 관리합니다.",
              "Manage roles, seats and membership.",
            ),
            Users,
          ],
          ...(cloudEnabled
            ? [
                [
                  "/projects",
                  c("팀 프로젝트", "Team projects"),
                  c(
                    "팀 원본을 모으고 프로젝트 접근 권한을 정합니다.",
                    "Collect team files and manage project access.",
                  ),
                  FolderClosed,
                ],
              ]
            : []),
          ...(data.managementEnabled
            ? [
                [
                  "/settings",
                  c("워크스페이스 설정", "Workspace settings"),
                  c(
                    "팀 정보, 소유권 이전과 내 참여를 관리합니다.",
                    "Manage team details, ownership and your membership.",
                  ),
                  Settings,
                ],
              ]
            : []),
        ].map(([path, title, desc, Icon]) => {
          const ItemIcon = Icon as typeof Users;
          return (
            <Link
              key={String(path)}
              href={base + path}
              className="group rounded-xl border border-border p-6 transition-colors hover:bg-surface"
            >
              <div className="flex items-center justify-between">
                <ItemIcon size={22} strokeWidth={1.5} aria-hidden="true" />
                <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="mt-5 font-medium">{title as string}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {desc as string}
              </p>
            </Link>
          );
        })}
      </div>
      {data.canManage && data.managementEnabled && <ResponsibilityQueue />}
      {process.env.NEXT_PUBLIC_START_ONBOARDING === "1" && (
        <section className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border bg-surface p-6">
          <div>
            <h2 className="font-medium">
              {c("앱에서 첫 편집 시작하기", "Start your first edit in the app")}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {c(
                "로컬 편집을 시작하고 팀 작업을 준비하세요.",
                "Start editing locally and prepare your team workflow.",
              )}
            </p>
          </div>
          <Link
            className={primaryClass}
            href={`/start?mode=team&workspace=${workspace.id}&locale=${lang}`}
          >
            {c("앱 시작 안내", "Open app guide")}
          </Link>
        </section>
      )}
    </TeamShell>
  );
}
