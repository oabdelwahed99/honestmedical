"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatMoney, formatNumber, toDateInputValue } from "@/lib/format";
import type { PackageRecipe } from "@/lib/types";

export function ProduceForm({
  pkg,
  onSaved,
  onCancel,
}: {
  pkg: PackageRecipe;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const count = Number(quantity || 0);
  const rows = pkg.components.map((component) => {
    const required = Math.round(component.quantity * count * 1e6) / 1e6;
    return { ...component, required, short: component.missing || required > component.available };
  });
  const blocked = count <= 0 || rows.some((row) => row.short);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (blocked) {
      setError(count <= 0 ? "أدخل عدداً أكبر من صفر" : "الرصيد لا يكفي للتصنيع");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/packages/${pkg._id}/produce`, {
        method: "POST",
        body: JSON.stringify({ quantity: count, date: date || undefined, note }),
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
        <div>
          <label className="field-label" htmlFor="produce-qty">
            عدد الوحدات ({pkg.product.unit})
          </label>
          <input
            id="produce-qty"
            type="number"
            min="1"
            step="any"
            className="field-input"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            أقصى عدد ممكن حالياً: {formatNumber(pkg.maxProducible)}
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="produce-date">
            التاريخ
          </label>
          <input
            id="produce-date"
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="produce-note">
            ملاحظات
          </label>
          <input
            id="produce-note"
            className="field-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري"
          />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-semibold">المكوّن</th>
              <th className="px-4 py-2 font-semibold">لكل وحدة</th>
              <th className="px-4 py-2 font-semibold">المطلوب</th>
              <th className="px-4 py-2 font-semibold">المتاح</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.product} className={row.short ? "bg-rose-50/60" : ""}>
                <td className="px-4 py-2 font-semibold text-slate-800">
                  {row.productName}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {formatNumber(row.quantity)} {row.unit}
                </td>
                <td className="px-4 py-2 font-semibold text-slate-800">
                  {formatNumber(row.required)}
                </td>
                <td
                  className={`px-4 py-2 font-semibold ${
                    row.short ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  {formatNumber(row.available)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        تكلفة الدفعة:{" "}
        <span className="font-bold text-slate-900">
          {formatMoney(pkg.unitCost * Math.max(count, 0))}
        </span>{" "}
        ({formatMoney(pkg.unitCost)} للوحدة)
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving || blocked}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          تصنيع
        </button>
      </div>
    </form>
  );
}
