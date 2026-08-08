"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert } from "@/components/ui";
import type { Partner } from "@/lib/types";

export function PartnerForm({
  partner,
  onSaved,
  onCancel,
}: {
  partner?: Partner;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(partner);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: partner?.name ?? "",
    equityPercent: String(partner?.equityPercent ?? ""),
    phone: partner?.phone ?? "",
    note: partner?.note ?? "",
    active: partner?.active ?? true,
  });

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await apiFetch(
        isEdit ? `/api/partners/${partner!._id}` : "/api/partners",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            name: form.name,
            equityPercent: Number(form.equityPercent || 0),
            phone: form.phone,
            note: form.note,
            active: form.active,
          }),
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
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="partner-name">
            اسم الشريك
          </label>
          <input
            id="partner-name"
            className="field-input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="partner-equity">
            نسبة الملكية %
          </label>
          <input
            id="partner-equity"
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="field-input"
            value={form.equityPercent}
            onChange={(event) => update("equityPercent", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="partner-phone">
            الهاتف
          </label>
          <input
            id="partner-phone"
            className="field-input"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="partner-note">
            ملاحظات
          </label>
          <input
            id="partner-note"
            className="field-input"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            شريك نشط
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {isEdit ? "حفظ التعديلات" : "إضافة الشريك"}
        </button>
      </div>
    </form>
  );
}
