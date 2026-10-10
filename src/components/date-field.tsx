"use client";

import { useRef, useState } from "react";

type Parts = { day: string; month: string; year: string };

function splitValue(value: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { day: "", month: "", year: "" };
  return { day: match[3], month: match[2], year: match[1] };
}

/** Returns YYYY-MM-DD for a complete, real calendar date, otherwise "". */
function joinParts({ day, month, year }: Parts): string {
  if (year.length !== 4 || !day || !month) return "";
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return "";
  }
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Date input entered as day / month / year with Latin digits.
 * `value` and `onChange` use the same YYYY-MM-DD format as <input type="date">.
 */
export function DateField({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [parts, setParts] = useState<Parts>(() => splitValue(value));
  const [syncedValue, setSyncedValue] = useState(value);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  if (value !== syncedValue) {
    setSyncedValue(value);
    setParts(splitValue(value));
  }

  function updatePart(key: keyof Parts, raw: string, maxLength: number) {
    const digits = raw
      .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 0x0660))
      .replace(/\D/g, "")
      .slice(0, maxLength);
    const next = { ...parts, [key]: digits };
    setParts(next);
    const joined = joinParts(next);
    setSyncedValue(joined);
    if (joined !== value) onChange(joined);

    if (digits.length === maxLength) {
      if (key === "day") monthRef.current?.focus();
      if (key === "month") yearRef.current?.focus();
    }
  }

  const hasInput = Boolean(parts.day || parts.month || parts.year);
  const invalid = hasInput && !joinParts(parts);
  const partClass =
    "min-w-0 bg-transparent text-center outline-none placeholder:text-slate-400";

  return (
    <div
      dir="ltr"
      lang="en"
      className={`field-input flex items-center gap-1 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 ${
        invalid ? "border-rose-400" : ""
      }`}
    >
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-label="اليوم"
        placeholder="DD"
        className={`${partClass} flex-[2]`}
        value={parts.day}
        onChange={(event) => updatePart("day", event.target.value, 2)}
      />
      <span className="text-slate-400">/</span>
      <input
        ref={monthRef}
        inputMode="numeric"
        autoComplete="off"
        aria-label="الشهر"
        placeholder="MM"
        className={`${partClass} flex-[2]`}
        value={parts.month}
        onChange={(event) => updatePart("month", event.target.value, 2)}
      />
      <span className="text-slate-400">/</span>
      <input
        ref={yearRef}
        inputMode="numeric"
        autoComplete="off"
        aria-label="السنة"
        placeholder="YYYY"
        className={`${partClass} flex-[4]`}
        value={parts.year}
        onChange={(event) => updatePart("year", event.target.value, 4)}
      />
    </div>
  );
}
