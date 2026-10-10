import type { PartyKind } from "@/lib/constants";

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  numberingSystem: "latn",
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("ar-EG", {
  numberingSystem: "latn",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatNumber(value: number) {
  return numberFormatter.format(value ?? 0);
}

export function formatMoney(value: number) {
  return `${currencyFormatter.format(value ?? 0)} ج.م`;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formats a date for an <input type="date"> value. */
export function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function daysUntil(value?: string | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function formatPercent(value: number, digits = 1) {
  return `${numberFormatter.format(Number(((value ?? 0) * 100).toFixed(digits)))}%`;
}

/** Reads a signed balance (positive = outstanding) from the party's side. */
export function describeBalance(
  kind: PartyKind,
  balance: number,
): { text: string; tone: string } {
  if (Math.abs(balance) < 0.005) {
    return { text: "مسدد بالكامل", tone: "text-emerald-700" };
  }
  const amount = formatMoney(Math.abs(balance));
  if (kind === "customer") {
    return balance > 0
      ? { text: `عليه ${amount}`, tone: "text-rose-700" }
      : { text: `له ${amount} (رصيد دائن)`, tone: "text-sky-700" };
  }
  return balance > 0
    ? { text: `له ${amount} (مستحق للمورد)`, tone: "text-rose-700" }
    : { text: `لنا عنده ${amount}`, tone: "text-sky-700" };
}

/** Formats a date/month key for an <input type="month"> value (YYYY-MM). */
export function toMonthInputValue(value?: string | Date | null) {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toMonthInputValue();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
