/**
 * Every date, duration and amount the dashboard prints goes through here
 * (docs/design/2026-10-12-design-system.md §1 표기), so a Korean screen never
 * shows "38m / 1h 0m" again and no screen shows seconds on a deadline.
 */
export type Lang = "ko" | "en";

const locale = (lang: Lang) => (lang === "ko" ? "ko-KR" : "en-US");
const at = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** Tables and lists: "2026. 10. 12." / "Oct 12, 2026". */
export function formatDate(value: string | Date, lang: Lang) {
  return at(value).toLocaleDateString(locale(lang), {
    year: "numeric",
    month: lang === "ko" ? "numeric" : "short",
    day: "numeric",
  });
}

/** Inside a sentence: "10월 12일" / "Oct 12". */
export function formatDay(value: string | Date, lang: Lang) {
  return at(value).toLocaleDateString(locale(lang), {
    month: lang === "ko" ? "long" : "short",
    day: "numeric",
  });
}

/** "10월 12일 – 11월 11일"; the year appears only when the period crosses one. */
export function formatPeriod(from: string | Date, to: string | Date, lang: Lang) {
  const sameYear = at(from).getFullYear() === at(to).getFullYear();
  const part = sameYear ? formatDay : formatDate;
  return `${part(from, lang)} – ${part(to, lang)}`;
}

/** "오전 9:30" / "9:30 AM" — never seconds. */
export function formatTime(value: string | Date, lang: Lang) {
  return at(value).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit" });
}

/** Processing time and quotas: "38분", "1시간 5분" / "38m", "1h 5m". */
export function formatDuration(seconds: number, lang: Lang) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return lang === "ko" ? "1분 미만" : "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (lang === "ko") return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** A video's length: "0:06", "12:04", "1:02:03". */
export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "129,000원" / "₩129,000". */
export function formatMoney(amount: number, lang: Lang) {
  const digits = Math.abs(amount).toLocaleString(locale(lang));
  const sign = amount < 0 ? "-" : "";
  return lang === "ko" ? `${sign}${digits}원` : `${sign}₩${digits}`;
}

/** "2시간 전" / "3 months ago" from an ISO instant; "—" when never. */
export function ago(iso: string | null | undefined, lang: string) {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { numeric: "auto" });
  if (minutes < 1) return lang === "ko" ? "방금 전" : "just now";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), "hour");
  if (minutes < 43200) return rtf.format(-Math.round(minutes / 1440), "day");
  if (minutes < 525600) return rtf.format(-Math.round(minutes / 43200), "month");
  return rtf.format(-Math.round(minutes / 525600), "year");
}
