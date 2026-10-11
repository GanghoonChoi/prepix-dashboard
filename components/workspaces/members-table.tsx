"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Notice,
  SearchField,
  Select,
  tableClass,
  tdClass,
  thClass,
  Toolbar,
} from "@/components/ui";

/**
 * One people table, used by the organisation and by a workspace.
 *
 * They were drifting apart — same job, two layouts, two search boxes, two
 * ideas of what a role control looks like — which is how a product starts
 * feeling assembled rather than designed. This is presentational only: it
 * knows how a row looks and nothing about who may change it. Every verdict
 * (`locked`, which roles are offered, what the menu holds) is decided by the
 * caller from what the SERVER said, never re-derived here.
 */
export type MemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  roleLabel: string;
  /** A second line under the role — "초대함 · 9/23 만료" and the like. */
  detail?: string;
  /**
   * A short word in place of the name, for a row that is not a person yet.
   * An invitation has no name, and `—` made it look like a member whose
   * profile happened to be blank — same shape, same weight, nothing saying
   * "this one has not answered".
   */
  badge?: string;
  /** True when this row's role is read-only: the owner, yourself, or a role
   *  the caller is not allowed to touch. Renders as text, not a dead control. */
  locked: boolean;
  roleOptions?: { value: string; label: string }[];
  onRole?: (role: string) => void;
  /** `RowMenuItem`s. Absent means no kebab at all — see RowMenu. */
  menu?: ReactNode;
};

export function MembersTable({
  title,
  description,
  rows,
  roleFilters,
  onInvite,
  inviteLabel,
  notice,
  onDismissNotice,
  roleGuide,
  count,
  footnote,
  busy,
  meta,
}: {
  title: string;
  description?: string;
  rows: MemberRow[];
  /** Values offered by the status/role filter, in the order they appear. */
  roleFilters: { value: string; label: string }[];
  onInvite?: () => void;
  inviteLabel?: string;
  /**
   * What just happened, announced on the PAGE. Every action here used to write
   * its result into the invite modal — which closes on success, so the one
   * outcome worth confirming was the one nobody could see, and resend and
   * revoke said nothing at all.
   */
  notice?: string;
  onDismissNotice?: () => void;
  /**
   * Sits in the 역할 column header. That is where somebody wonders what a role
   * means, so that is where the answer is offered — rather than six rows of
   * reference pushing the roster down the page on every visit.
   */
  roleGuide?: ReactNode;
  /**
   * The number in the pill. Defaults to the row count, which is right until
   * the table also carries invitations — then "멤버 5" would be counting three
   * members and two people who have not answered yet, and the one figure an
   * admin reads off this screen would be wrong.
   */
  count?: number;
  footnote?: string;
  busy?: boolean;
  /**
   * A line under the heading for figures that belong to this roster — seats,
   * today. Here rather than stacked above the table, because a panel between
   * the page title and the table is a panel the table pays for in position.
   */
  meta?: ReactNode;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!needle ||
          `${row.name ?? ""} ${row.email}`.toLowerCase().includes(needle)) &&
        (filter === "all" || row.role === filter),
    );
  }, [rows, query, filter]);

  return (
    <section className="space-y-3">
      <div>
        <Toolbar title={title} count={count ?? rows.length}>
          <SearchField
            value={query}
            onChange={setQuery}
            label={c("검색", "Search")}
            placeholder={c("이름 또는 이메일로 검색", "Search by name or email")}
            className="sm:w-64"
          />
          <Select
            size="sm"
            wrapperClassName="w-full sm:w-36"
            aria-label={c("역할", "Role")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">{c("역할 전체", "All roles")}</option>
            {roleFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {onInvite && (
            <Button size="sm" onClick={onInvite}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              {inviteLabel ?? c("초대", "Invite")}
            </Button>
          )}
        </Toolbar>
        {description && (
          <p className="mt-1 text-[13px] text-muted">{description}</p>
        )}
        {meta && <div className="mt-2">{meta}</div>}
      </div>

      {notice && (
        <Notice
          role="status"
          action={
            onDismissNotice && (
              <IconButton label={c("닫기", "Dismiss")} size="xs" onClick={onDismissNotice}>
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )
          }
        >
          {notice}
        </Notice>
      )}

      {visible.length === 0 ? (
        <div role="status">
          <EmptyState frame="none" title={c("해당하는 사람이 없습니다.", "Nobody matches.")} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${tableClass} min-w-[34rem]`}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  {c("이름", "Name")}
                </th>
                <th scope="col" className={thClass}>
                  {c("이메일", "Email")}
                </th>
                <th scope="col" className={thClass}>
                  {c("역할", "Role")}
                  {roleGuide}
                </th>
                {/*
                  `relative` is load-bearing. `sr-only` is `position: absolute`,
                  and with no positioned ancestor its containing block is the
                  document — so it is NOT clipped by the `overflow-x-auto`
                  wrapper around this table. Sitting at the right edge of a
                  544px table on a 390px phone, that one-pixel box pushed the
                  DOCUMENT's scroll width out to meet it, and the whole page
                  scrolled sideways while the table scrolled correctly inside
                  its own box.
                */}
                <th scope="col" className={`${thClass} relative w-12`}>
                  <span className="sr-only">{c("작업", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-surface"
                >
                  <td className={tdClass}>
                    {/* No name is no name. This used to print the email's
                      local part here, which is harmless for a member whose
                      address you can read in the next column and a small lie
                      on an INVITATION row: nobody has joined yet, so we cannot
                      know what they are called, and "spa9ettimaker+test" sat
                      in the 이름 column looking like an answer. */}
                    {row.badge ? (
                      <Badge>{row.badge}</Badge>
                    ) : row.name ? (
                      <span className="font-medium">{row.name}</span>
                    ) : (
                      <span aria-hidden="true" className="text-muted">
                        —
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} break-all text-muted`}>
                    {row.email}
                  </td>
                  <td className={tdClass}>
                    {row.locked || !row.roleOptions || !row.onRole ? (
                      <span className="text-muted">{row.roleLabel}</span>
                    ) : (
                      <Select
                        size="sm"
                        wrapperClassName="w-36"
                        aria-label={c("역할", "Role")}
                        value={row.role}
                        disabled={busy}
                        onChange={(event) => row.onRole?.(event.target.value)}
                      >
                        {row.roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                    {row.detail && (
                      <span className="mt-0.5 block text-xs tabular-nums text-muted">
                        {row.detail}
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} text-right`}>{row.menu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footnote && <p className="text-xs leading-5 text-muted">{footnote}</p>}
    </section>
  );
}
