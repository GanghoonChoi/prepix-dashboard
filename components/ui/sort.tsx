"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { thClass } from "./data";

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

/** Click a header to sort by it; click it again to reverse. */
export function useSort<K extends string>(initial: Sort<K>) {
  const [sort, setSort] = useState(initial);
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return [sort, toggle] as const;
}

/** Rows in `sort` order: numbers by value, text in the reader's collation
 * (numbers inside text numerically), empty values always last. */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: Sort<K>,
  value: (row: T, key: K) => string | number | null | undefined,
  lang?: string,
) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key),
      y = value(b, sort.key);
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    return sign * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), lang, { numeric: true }));
  });
}

/** A column header that sorts: same name for screen readers, `aria-sort` set. */
export function SortHeader<K extends string>({
  column,
  label,
  sort,
  onSort,
  className = "",
  align = "left",
  extra,
}: {
  column: K;
  label: string;
  sort: Sort<K>;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right";
  /** Beside the label, outside the button (a help tip). */
  extra?: ReactNode;
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      className={`${thClass} ${align === "right" ? "text-right" : ""} ${className}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-1 inline-flex items-center gap-1 rounded-md px-1 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-focus ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
          ))}
      </button>
      {extra}
    </th>
  );
}
