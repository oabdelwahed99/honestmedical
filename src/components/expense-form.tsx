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
import { toDateInputValue } from "@/lib/format";
import { Alert } from "@/components/ui";
import type { Expense } from "@/lib/types";

export function ExpenseForm({
  expense,
  onSaved,
  onCancel,
}: {
  expense?: Expense;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(expense);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: (expense?.category ?? "other") as ExpenseCategory,
    label: expense?.label ?? "",
    amount: String(expense?.amount ?? ""),
    date: toDateInputValue(expense?.date) || toDateInputValue(new Date()),
    behavior:
      expense?.behavior ??
      DEFAULT_EXPENSE_BEHAVIOR[expense?.category ?? "other"],
    paidTo: expense?.paidTo ?? "",
    note: expense?.note ?? "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => {
      if (key === "category") {
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
      date: form.date || undefined,
      behavior: form.behavior,
      paidTo: form.paidTo,
      note: form.note,
    };

    try {
      await apiFetch(
        isEdit ? `/api/expenses/${expense!._id}` : "/api/expenses",
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
          <label className="field-label" htmlFor="expense-category">
            التصنيف
          </label>
          <select
            id="expense-category"
            className="field-input"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
            required
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="expense-behavior">
            النوع
          </label>
          <select
            id="expense-behavior"
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
          <label className="field-label" htmlFor="expense-label">
            الوصف
          </label>
          <input
            id="expense-label"
            className="field-input"
            value={form.label}
            onChange={(event) => update("label", event.target.value)}
            placeholder="مثال: راتب أحمد"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="expense-amount">
            المبلغ
          </label>
          <input
            id="expense-amount"
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
          <label className="field-label" htmlFor="expense-date">
            التاريخ
          </label>
          <input
            id="expense-date"
            type="date"
            className="field-input"
            value={form.date}
            onChange={(event) => update("date", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="expense-paid-to">
            المدفوع إليه
          </label>
          <input
            id="expense-paid-to"
            className="field-input"
            value={form.paidTo}
            onChange={(event) => update("paidTo", event.target.value)}
            placeholder="اختياري"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="expense-note">
            ملاحظات
          </label>
          <input
            id="expense-note"
            className="field-input"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {isEdit ? "حفظ التعديلات" : "إضافة المصروف"}
        </button>
      </div>
    </form>
  );
}
