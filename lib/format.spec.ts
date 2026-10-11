import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatClock,
  formatDate,
  formatDay,
  formatDuration,
  formatMoney,
  formatPeriod,
  formatTime,
} from "./format";

// Noon UTC, so the calendar day is the same in every test runner's zone.
const day = "2026-10-12T12:00:00Z";

test("durations read in the UI's language, never '1h 0m'", () => {
  assert.equal(formatDuration(2280, "ko"), "38분");
  assert.equal(formatDuration(3900, "ko"), "1시간 5분");
  assert.equal(formatDuration(3600, "ko"), "1시간");
  assert.equal(formatDuration(3600, "en"), "1h");
  assert.equal(formatDuration(3900, "en"), "1h 5m");
  assert.equal(formatDuration(20, "ko"), "1분 미만");
  assert.equal(formatDuration(0, "en"), "<1m");
});

test("clock time for video lengths", () => {
  assert.equal(formatClock(6), "0:06");
  assert.equal(formatClock(724), "12:04");
  assert.equal(formatClock(3723), "1:02:03");
  assert.equal(formatClock(6.9), "0:06");
});

test("money: 원 in Korean, ₩ prefix in English, sign before the symbol", () => {
  assert.equal(formatMoney(129000, "ko"), "129,000원");
  assert.equal(formatMoney(129000, "en"), "₩129,000");
  assert.equal(formatMoney(-9670, "en"), "-₩9,670");
});

test("dates: dotted in tables, month-day inline, no seconds anywhere", () => {
  assert.equal(formatDate(day, "ko"), "2026. 10. 12.");
  assert.equal(formatDate(day, "en"), "Oct 12, 2026");
  assert.equal(formatDay(day, "ko"), "10월 12일");
  assert.equal(formatDay(day, "en"), "Oct 12");
  assert.equal(formatTime(day, "ko").split(":").length, 2);
  assert.equal(formatTime(day, "en").split(":").length, 2);
});

test("a period names the year only when it crosses one", () => {
  assert.equal(formatPeriod(day, "2026-11-11T12:00:00Z", "ko"), "10월 12일 – 11월 11일");
  assert.equal(
    formatPeriod("2026-12-20T12:00:00Z", "2027-01-19T12:00:00Z", "ko"),
    "2026. 12. 20. – 2027. 1. 19.",
  );
});
