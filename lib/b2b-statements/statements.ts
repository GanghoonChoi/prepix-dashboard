import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Every view and stored request is pinned to service origin, account and team
// so a switch or a late response can never show another team's statement.
export type StatementScope = {
  origin: string;
  userId: string;
  workspaceId: string;
};
export const scopeKey = (s: StatementScope) =>
  JSON.stringify([s.origin, s.userId, s.workspaceId]);

export type PendingIssue = {
  schema: 1;
  scope: StatementScope;
  month: string;
  requestKey: string;
};
type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const key = (scope: StatementScope, month: string) =>
  `prepix:b2b-statement-issue:${scopeKey(scope)}:${month}`;

/** The issue request is stored before it is sent and reused verbatim after a
 * lost response or reload; a storage failure is reported, never ignored. */
export function savePending(
  storage: KeyValue,
  scope: StatementScope,
  month: string,
  requestKey: string,
): PendingIssue {
  const record: PendingIssue = { schema: 1, scope, month, requestKey };
  storage.setItem(key(scope, month), JSON.stringify(record));
  return record;
}
export function loadPending(
  storage: KeyValue,
  scope: StatementScope,
  month: string,
): PendingIssue | null {
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(key(scope, month)) ?? "null");
  } catch {
    return null;
  }
  const r = raw as PendingIssue | null;
  return r &&
    r.schema === 1 &&
    r.month === month &&
    MONTH.test(month) &&
    r.scope &&
    scopeKey(r.scope) === scopeKey(scope) &&
    uuid.test(r.requestKey)
    ? r
    : null;
}
export function clearPending(
  storage: KeyValue,
  scope: StatementScope,
  month: string,
) {
  storage.removeItem(key(scope, month));
}

/** Saved only when the exact bytes match the issued revision. */
export function verifiedPdf(
  bytes: ArrayBuffer,
  expected: { sha256: string; bytes: number },
): boolean {
  const view = new Uint8Array(bytes);
  return (
    view.byteLength === expected.bytes &&
    bytesToHex(sha256(view)) === expected.sha256
  );
}

export function monthLabel(month: string, lang: "ko" | "en" = "ko") {
  const [year, value] = month.split("-");
  return lang === "ko"
    ? `${year}년 ${Number(value)}월`
    : `${new Date(Date.UTC(Number(year), Number(value) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`;
}
export const won = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}원`;
export const units = (value: string | number) =>
  new Intl.NumberFormat("ko-KR").format(BigInt(value));
export const kst = (iso: string | null) => {
  if (!iso) return "-";
  const civil = new Date(Date.parse(iso) + 9 * 3_600_000).toISOString();
  return `${civil.slice(0, 10)} ${civil.slice(11, 16)}`;
};
