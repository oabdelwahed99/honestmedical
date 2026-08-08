export type Period = {
  /** Period start (inclusive), midnight local. */
  start: Date;
  /** Period end (inclusive), end of day local. */
  end: Date;
  /** Number of calendar days in the period (at least 1). */
  days: number;
  /** Human label, e.g. "مارس 2026" or a date range. */
  label: string;
  /** The previous period of the same length, for period-over-period comparison. */
  previous: {
    start: Date;
    end: Date;
    label: string;
  };
  /** YYYY-MM when the period is a calendar month, otherwise null. */
  month: string | null;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  month: "long",
  year: "numeric",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function daysBetween(start: Date, end: Date): number {
  const ms = endOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function shiftMonths(date: Date, delta: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + delta);
  return result;
}

function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function buildPeriod(
  start: Date,
  end: Date,
  month: string | null,
): Period {
  const startDay = startOfDay(start);
  const endDay = endOfDay(end);
  const days = daysBetween(startDay, endDay);

  const previousEnd = new Date(startDay);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (days - 1));

  const label = month
    ? MONTH_FORMATTER.format(startDay)
    : `${DATE_FORMATTER.format(startDay)} – ${DATE_FORMATTER.format(endDay)}`;

  const previousLabel = month
    ? MONTH_FORMATTER.format(previousStart)
    : `${DATE_FORMATTER.format(previousStart)} – ${DATE_FORMATTER.format(previousEnd)}`;

  return {
    start: startDay,
    end: endDay,
    days,
    label,
    month,
    previous: {
      start: startOfDay(previousStart),
      end: endOfDay(previousEnd),
      label: previousLabel,
    },
  };
}

/**
 * Resolves a reporting period from query params.
 * Prefers `month=YYYY-MM`; otherwise uses `from`/`to`; defaults to the current month.
 */
export function resolvePeriod(params: {
  month?: string | null;
  from?: string | null;
  to?: string | null;
}): Period {
  const monthValue = params.month?.trim();
  if (monthValue) {
    const parsed = parseMonth(monthValue);
    if (!parsed) {
      throw new Error("صيغة الشهر غير صالحة. استخدم YYYY-MM");
    }
    const start = new Date(parsed.year, parsed.month - 1, 1);
    const end = new Date(parsed.year, parsed.month, 0);
    return buildPeriod(start, end, monthKey(start));
  }

  if (params.from || params.to) {
    const now = new Date();
    const start = params.from ? new Date(params.from) : startOfDay(now);
    const end = params.to ? new Date(params.to) : endOfDay(now);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("تاريخ الفترة غير صالح");
    }
    if (start > end) {
      throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    }
    return buildPeriod(start, end, null);
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return buildPeriod(start, end, monthKey(start));
}

/** Returns today's date as YYYY-MM. */
export function currentMonthKey(date = new Date()): string {
  return monthKey(date);
}

/** Shifts a YYYY-MM key by a number of months. */
export function shiftMonthKey(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!parsed) throw new Error("صيغة الشهر غير صالحة. استخدم YYYY-MM");
  return monthKey(shiftMonths(new Date(parsed.year, parsed.month - 1, 1), delta));
}

/** Clamps a day-of-month against the length of the given month. */
export function clampDayOfMonth(month: string, dayOfMonth: number): Date {
  const parsed = parseMonth(month);
  if (!parsed) throw new Error("صيغة الشهر غير صالحة. استخدم YYYY-MM");
  const lastDay = new Date(parsed.year, parsed.month, 0).getDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(parsed.year, parsed.month - 1, day);
}
