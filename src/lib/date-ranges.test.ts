import { describe, expect, it } from "vitest";

import { dateRange, inDateRange } from "./date-ranges";

// Wednesday 4 November 2026, 15:30 local time.
const now = new Date(2026, 10, 4, 15, 30);
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("dateRange", () => {
  it("today and yesterday", () => {
    expect(inDateRange(day(2026, 11, 4, 0), dateRange("today", "", "", now))).toBe(true);
    expect(inDateRange(day(2026, 11, 3, 23), dateRange("today", "", "", now))).toBe(false);
    expect(inDateRange(day(2026, 11, 3), dateRange("yesterday", "", "", now))).toBe(true);
  });

  it("this week starts on Monday", () => {
    const week = dateRange("this_week", "", "", now);
    expect(inDateRange(day(2026, 11, 2), week)).toBe(true);   // Monday
    expect(inDateRange(day(2026, 11, 1), week)).toBe(false);  // Sunday before
  });

  it("this month and last month", () => {
    expect(inDateRange(day(2026, 11, 1, 0), dateRange("this_month", "", "", now))).toBe(true);
    expect(inDateRange(day(2026, 10, 31), dateRange("this_month", "", "", now))).toBe(false);
    expect(inDateRange(day(2026, 10, 31), dateRange("last_month", "", "", now))).toBe(true);
    expect(inDateRange(day(2026, 9, 30), dateRange("last_month", "", "", now))).toBe(false);
  });

  it("last month in January is December of the year before", () => {
    const january = new Date(2027, 0, 15);
    expect(inDateRange(day(2026, 12, 20), dateRange("last_month", "", "", january))).toBe(true);
  });

  it("custom range includes both end days", () => {
    const range = dateRange("custom", "2026-10-01", "2026-10-31", now);
    expect(inDateRange(day(2026, 10, 1, 0), range)).toBe(true);
    expect(inDateRange(day(2026, 10, 31, 23), range)).toBe(true);
    expect(inDateRange(day(2026, 11, 1, 0), range)).toBe(false);
    expect(inDateRange(day(2026, 1, 1), dateRange("custom", "", "", now))).toBe(true); // empty: no limit
  });

  it("any date lets everything through, a missing date only then", () => {
    expect(inDateRange(null, dateRange("", "", "", now))).toBe(true);
    expect(inDateRange(null, dateRange("today", "", "", now))).toBe(false);
  });
});
