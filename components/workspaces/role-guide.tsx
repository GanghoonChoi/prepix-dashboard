"use client";
import { useOverlayState } from "@heroui/react";
import { HelpCircle } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { useI18n } from "@/lib/i18n/context";

/**
 * "What can this role actually do", behind a trigger.
 *
 * Six rows of reference sitting open on the members screen would push the
 * roster down the page to answer a question nobody is asking most visits —
 * which is why the workspace version of this is a collapsed `<details>` next
 * to the role picker. Here the question arises in one place, at the 역할
 * column, so the trigger lives in that column's header and the answer arrives
 * as a dialog over the page rather than by moving it.
 *
 * Every row must be a rule the SERVER actually enforces. A permissions table
 * that is merely plausible is worse than none: people plan around it, and the
 * first time it disagrees with a refusal they stop believing the screen.
 */

export type RoleGuideColumn = { key: string; label: string };
export type RoleGuideRow = {
  label: string;
  /** One per column, in order. `true` = yes, `false` = no, string = a caveat. */
  values: (boolean | string)[];
  /** A line under the row, for the rule the grid cannot hold. */
  note?: string;
};

export function RoleGuide({
  title,
  columns,
  rows,
  footnote,
}: {
  title: string;
  columns: RoleGuideColumn[];
  rows: RoleGuideRow[];
  footnote?: string;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const guide = useOverlayState();

  return (
    <>
      <button
        type="button"
        onClick={guide.open}
        aria-label={title}
        title={title}
        className="ml-1 inline-flex size-5 items-center justify-center rounded-full align-middle text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <Dialog state={guide} title={title} size="wide">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-normal">
                  {c("할 수 있는 일", "Can do")}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="whitespace-nowrap px-2 py-2 text-left font-medium text-foreground"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="py-2.5 pr-3 text-left font-normal leading-5"
                  >
                    {row.label}
                    {row.note && (
                      <span className="mt-0.5 block text-xs leading-5 text-muted">
                        {row.note}
                      </span>
                    )}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={columns[index]?.key ?? index}
                      className={`px-2 py-2.5 align-top ${
                        value === false ? "text-muted" : "text-foreground"
                      }`}
                    >
                      {value === true ? (
                        <span aria-label={c("가능", "Yes")}>✓</span>
                      ) : value === false ? (
                        // An em dash, not a cross: "not this role's job" reads
                        // differently from "forbidden", and most of these are
                        // the first thing.
                        <span aria-label={c("불가", "No")}>—</span>
                      ) : (
                        // A role name is one word to a reader; breaking it
                        // across lines makes a column look like two.
                        <span className="whitespace-nowrap text-xs leading-5">
                          {value}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {footnote && (
          <p className="mt-4 text-xs leading-5 text-muted">{footnote}</p>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={guide.close}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm transition-colors hover:bg-surface"
          >
            {c("닫기", "Close")}
          </button>
        </div>
      </Dialog>
    </>
  );
}
