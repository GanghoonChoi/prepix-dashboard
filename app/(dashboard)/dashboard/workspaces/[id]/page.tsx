"use client";
import Link from "next/link";
import { FolderClosed, Users, Settings, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  TeamShell,
  SpaceBadge,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { isPersonal, seatFigures } from "@/lib/workspaces/kind";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { MembersContent } from "@/components/workspaces/members-content";
export default function Page() {
  const context = useWorkspace();
  const { lang, t } = useI18n();
  if (!context) return null;
  const { data, cloudEnabled } = context;
  const { workspace } = data;
  const base = `/dashboard/workspaces/${workspace.id}`;
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const personal = isPersonal(workspace);
  const seats = seatFigures(data);
  // The invite-first setup run belongs to a team. A personal space is finished
  // the moment it exists, so it never lands on a members screen.
  if (!workspace.onboardingCompletedAt && data.canManage && !personal)
    return <MembersContent id={workspace.id} />;
  return (
    <TeamShell
      title={personal ? t("team.personalTitle") : workspace.name}
      description={
        personal
          ? t("team.personalDesc")
          : workspace.description ||
            c(
              "팀의 아카이브와 멤버를 한곳에서 관리하세요.",
              "Manage your team's archive and people in one place.",
            )
      }
    >
      {/*
        The current space, on the page itself and not only in the switcher —
        this is the home of every consequential action below it.
      */}
      <SpaceBadge workspace={workspace} />
      {!personal && data.pendingTransfer && (
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
      {/*
        Roles and seats are statements about other people, so a personal space
        does not carry them at all. For a team they are separate figures, never
        a single total that can hide a seat a pending invitation is holding.
      */}
      {!personal && seats && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [c("내 역할", "Your role"), t(`team.role.${data.role}`)],
            [t("team.seatActive"), String(seats.active)],
            [t("team.seatInvited"), String(seats.invited)],
            [t("team.seatRemaining"), String(seats.remaining)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border p-5">
              <p className="text-xs leading-5 text-muted">{label}</p>
              <p className="mt-3 text-xl font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ...(personal
            ? []
            : [
                [
                  "/members",
                  c("멤버와 초대", "Members and invitations"),
                  c(
                    "역할과 좌석, 참여 상태를 관리합니다.",
                    "Manage roles, seats and membership.",
                  ),
                  Users,
                ],
              ]),
          ...(cloudEnabled
            ? [
                [
                  "/media",
                  personal
                    ? c("내 아카이브", "Your archive")
                    : c("팀 아카이브", "Team archive"),
                  personal
                    ? c(
                        "나만 접근하는 원본을 보관합니다.",
                        "Store originals only you can reach.",
                      )
                    : c(
                        "팀 원본을 한곳에 모아 보관합니다.",
                        "Store team originals in one place.",
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
                  personal
                    ? c(
                        "이름과 소개를 바꿉니다.",
                        "Change the name and description.",
                      )
                    : c(
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
      {personal && (
        // The only route from personal to team is an explicit, named one.
        <Link className={secondaryClass} href="/dashboard/workspaces/new">
          {t("team.makeTeam")}
        </Link>
      )}
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
            href={`/start?step=app&workspace=${workspace.id}&locale=${lang}`}
          >
            {c("앱 시작 안내", "Open app guide")}
          </Link>
        </section>
      )}
    </TeamShell>
  );
}
