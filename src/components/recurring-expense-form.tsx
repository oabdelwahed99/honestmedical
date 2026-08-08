"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_EXPENSE_BEHAVIOR,
  EXPENSE_BEHAVIOR_LABELS,
  EXPENSE_BEHAVIORS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "@/lib/constants";
import { apiFetch } from "@/lib/client";
import { Alert } from "@/components/ui";
import type { RecurringExpense } from "@/lib/types";

export function RecurringExpenseForm({
  recurring,
  onSaved,
  onCancel,
}: {
  recurring?: RecurringExpense;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(recurring);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: (recurring?.category ?? "salary") as ExpenseCategory,
    label: recurring?.label ?? "",
    amount: String(recurring?.amount ?? ""),
    behavior:
      recurring?.behavior ??
      DEFAULT_EXPENSE_BEHAVIOR[recurring?.category ?? "salary"],
    paidTo: recurring?.paidTo ?? "",
    dayOfMonth: String(recurring?.dayOfMonth ?? 1),
    active: recurring?.active ?? true,
    note: recurring?.note ?? "",
  });

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => {
      if (key === "category" && typeof value === "string") {
        const category = value as ExpenseCategory;
        return {
          ...current,
          category,
          behavior: DEFAULT_EXPENSE_BEHAVIOR[category],
        };
      }
      return { ...current, [key]: value };
    });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      category: form.category,
      label: form.label,
      amount: Number(form.amount || 0),
      behavior: form.behavior,
      paidTo: form.paidTo,
      dayOfMonth: Number(form.dayOfMonth || 1),
      active: form.active,
      note: form.note,
    };

    try {
      await apiFetch(
        isEdit
          ? `/api/expenses/recurring/${recurring!._id}`
          : "/api/expenses/recurring",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      onSaved();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Alert message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="recurring-category">
            التصنيف
          </label>
          <select
            id="recurring-category"
            className="field-input"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="recurring-behavior">
            النوع
          </label>
          <select
            id="recurring-behavior"
            className="field-input"
            value={form.behavior}
            onChange={(event) => update("behavior", event.target.value)}
          >
            {EXPENSE_BEHAVIORS.map((behavior) => (
              <option key={behavior} value={behavior}>
                {EXPENSE_BEHAVIOR_LABELS[behavior]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="recurring-label">
            الوصف
          </label>
          <input
            id="recurring-label"
            className="field-input"
            value={form.label}
            onChange={(event) => update("label", event.target.value)}
            placeholder="مثال: إيجار المخزن"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="recurring-amount">
            المبلغ الشهري
          </label>
          <input
            id="recurring-amount"
            type="number"
            min="0"
            step="0.01"
            className="field-input"
            value={form.amount}
            onChange={(event) => update("amount", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="recurring-day">
            يوم التوليد (١–٢٨)
          </label>
          <input
            id="recurring-day"
            type="number"
            min="1"
            max="28"
            className="field-input"
            value={form.dayOfMonth}
            onChange={(event) => update("dayOfMonth", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="recurring-paid-to">
            المدفوع إليه
          </label>
          <input
            id="recurring-paid-to"
            className="field-input"
            value={form.paidTo}
            onChange={(event) => update("paidTo", event.target.value)}
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            قالب نشط
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {isEdit ? "حفظ التعديلات" : "إضافة القالب"}
        </button>
      </div>
    </form>
  );
}
