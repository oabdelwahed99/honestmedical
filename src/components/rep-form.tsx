"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert } from "@/components/ui";
import type { SalesRep } from "@/lib/types";

export function RepForm({
  rep,
  onSaved,
  onCancel,
}: {
  rep?: SalesRep;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(rep);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: rep?.name ?? "",
    phone: rep?.phone ?? "",
    note: rep?.note ?? "",
    active: rep?.active ?? true,
  });

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await apiFetch(isEdit ? `/api/reps/${rep!._id}` : "/api/reps", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          note: form.note,
          active: form.active,
        }),
      });
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
          <label className="field-label" htmlFor="rep-name">
            اسم المندوب
          </label>
          <input
            id="rep-name"
            className="field-input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="rep-phone">
            الهاتف
          </label>
          <input
            id="rep-phone"
            className="field-input"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
            />
            نشط
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="rep-note">
            ملاحظات
          </label>
          <input
            id="rep-note"
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
          {isEdit ? "حفظ التعديلات" : "إضافة المندوب"}
        </button>
      </div>
    </form>
  );
}
