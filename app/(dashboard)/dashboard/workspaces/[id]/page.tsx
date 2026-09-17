"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { File } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  TeamShell,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { isPersonal, seatFigures } from "@/lib/workspaces/kind";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { MembersContent } from "@/components/workspaces/members-content";
import { cloudService, type Asset } from "@/lib/api/services/cloud.service";
import type { StorageUsage } from "@/lib/api/services/cloud.service";
import { bytes } from "@/lib/workspaces/upload";

/**
 * The overview, which until now was a grid of cards linking to 멤버, 아카이브
 * and 설정 — the same three rows the sidebar already lists two inches to the
 * left. A landing page whose entire content is the menu beside it answers
 * nothing; you click through it and only then find out how much is stored and
 * who is here.
 *
 * So it answers those instead: what is in the archive, how full it is, and who
 * can reach it. Every figure comes from the server, and a section whose data
 * this viewer may not have (a reviewer cannot read the archive at all) is
 * absent rather than shown empty.
 */
export default function Page() {
  const context = useWorkspace();
  const { lang, t } = useI18n();
  const workspace = context?.data.workspace;
  const id = workspace?.id;
  const cloudEnabled = context?.cloudEnabled ?? false;
  // Three states, not two: `undefined` is still in flight, `null` is "this
  // viewer does not get an archive" (a reviewer never does). Collapsing them
  // printed one figure into a three-column frame and then rearranged the page
  // a second later.
  const [archive, setArchive] = useState<
    { storage: StorageUsage; assets: Asset[] } | null | undefined
  >(undefined);

  useEffect(() => {
    if (!id || !cloudEnabled) return;
    let alive = true;
    void cloudService
      .archive(id)
      .then((detail) => {
        if (alive)
          setArchive({ storage: detail.storage, assets: detail.assets });
      })
      // A reviewer is refused the archive by design, and a blink of network is
      // not worth a banner on a page whose other half loaded. The section is
      // simply not here.
      .catch(() => {
        if (alive) setArchive(null);
      });
    return () => {
      alive = false;
    };
  }, [id, cloudEnabled]);

  if (!context || !workspace) return null;
  const { data } = context;
  const base = `/dashboard/workspaces/${workspace.id}`;
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const personal = isPersonal(workspace);
  const seats = seatFigures(data);
  // The invite-first setup run belongs to a team, and to the person who made
  // it. A personal space is finished the moment it exists; an admin invited
  // into a half-set-up team is not mid-setup, they have just arrived, and
  // sending them to the invite screen instead of the overview told them
  // otherwise.
  if (
    !workspace.onboardingCompletedAt &&
    data.canManage &&
    !personal &&
    workspace.createdBy === data.currentUserId
  )
    return <MembersContent id={workspace.id} />;

  const stored = archive ? archive.storage.used + archive.storage.reserved : 0;
  const files = (archive?.assets ?? []).filter((asset) => !asset.trashedAt);
  const recent = files.slice(0, 5);
  // `null` in the value slot means "still coming", and renders as a block the
  // size of the number that will land there.
  const archiveCells = cloudEnabled && archive !== null;
  const stats: [string, string | null, string][] = [
    ...(archiveCells
      ? [
          [
            c("보관 중", "Stored"),
            archive ? bytes(stored) : null,
            archive
              ? c(
                  `${bytes(archive.storage.limit)} 중`,
                  `of ${bytes(archive.storage.limit)}`,
                )
              : "",
          ] as [string, string | null, string],
        ]
      : []),
    ...(personal
      ? []
      : [
          [
            c("멤버", "Members"),
            String(data.members.length),
            seats?.invited
              ? c(`초대 ${seats.invited}건 대기`, `${seats.invited} invited`)
              : "",
          ] as [string, string | null, string],
        ]),
    ...(archiveCells
      ? [
          [
            c("원본", "Originals"),
            archive ? String(files.length) : null,
            c("아카이브 안", "in the archive"),
          ] as [string, string | null, string],
        ]
      : []),
  ];

  return (
    <TeamShell
      title={personal ? t("team.personalTitle") : workspace.name}
      /* The team's own description if it wrote one; otherwise nothing. The
         sidebar nav already lists what lives in here, so the fallback was a
         sentence describing the menu beside it. */
      description={personal ? t("team.personalDesc") : workspace.description}
    >
      {!personal && data.pendingTransfer && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5"
        >
          <p className="text-sm leading-6">
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
        Only the figures that mean something here. A personal space has no
        other people, so it carries no member count — not "0 members", which
        still asks the reader to reason about members.

        The cells are laid out before the archive answers and the numbers drop
        into them, rather than the grid growing a column at a time.
      */}
      {stats.length > 0 && (
        <section
          className="grid gap-px overflow-hidden rounded-xl border border-border bg-border"
          style={{
            gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
          }}
        >
          {stats.map(([label, value, detail]) => (
            <div key={label} className="bg-background p-5">
              <p className="text-xs leading-5 text-muted">{label}</p>
              {value === null ? (
                <div className="mt-3 h-6 w-20 animate-pulse rounded-md bg-foreground/[0.06]" />
              ) : (
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
              )}
              <p className="mt-1 text-xs leading-5 text-muted tabular-nums">
                {/* Holds the line's height while the figure is in flight, so
                    the cell does not grow under the reader. */}
                {detail || "\u00a0"}
              </p>
            </div>
          ))}
        </section>
      )}

      {archiveCells && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">
              {c("최근 올린 원본", "Recently uploaded")}
            </h2>
            <Link
              href={`${base}/media`}
              className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              {c("아카이브 열기", "Open archive")}
            </Link>
          </div>
          {!archive ? (
            <div
              aria-hidden="true"
              className="h-14 animate-pulse rounded-xl bg-foreground/[0.06]"
            />
          ) : recent.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {recent.map((asset) => (
                <li key={asset.id}>
                  <Link
                    href={`${base}/media`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.02]"
                  >
                    <File
                      size={18}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {asset.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {bytes(asset.size)} ·{" "}
                      {new Date(asset.createdAt).toLocaleDateString(lang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-border px-5 py-8 text-center text-sm text-muted">
              {c("아직 올린 원본이 없습니다.", "No originals uploaded yet.")}
            </p>
          )}
        </section>
      )}

      {process.env.NEXT_PUBLIC_START_ONBOARDING === "1" && (
        <section className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border bg-surface p-6">
          <div>
            <h2 className="font-medium">
              {c("앱에서 첫 편집 시작하기", "Start your first edit in the app")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
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

      {personal && (
        // The only route from personal to team is an explicit, named one.
        <Link className={secondaryClass} href="/dashboard/workspaces/new">
          {t("team.makeTeam")}
        </Link>
      )}
    </TeamShell>
  );
}
