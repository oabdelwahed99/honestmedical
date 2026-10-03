"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatMoney, toDateInputValue } from "@/lib/format";
import type { Product, ReturnNote } from "@/lib/types";

type Line = {
  key: string;
  productId: string;
  quantity: string;
  price: string;
  expiryDate: string;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

export function ReplacementForm({
  note,
  onSaved,
  onCancel,
}: {
  note: ReturnNote;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data } = useSWR<{ products: Product[] }>("/api/products", apiFetch);
  const products = data?.products ?? [];

  const [lines, setLines] = useState<Line[]>(() =>
    note.replacements.length === 0
      ? note.items.map((item) => ({
          key: newKey(),
          productId: item.product,
          quantity: String(item.quantity),
          price: String(item.unitPrice),
          expiryDate: "",
        }))
      : [{ key: newKey(), productId: "", quantity: "1", price: "", expiryDate: "" }],
  );
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const value = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0),
    0,
  );
  const diff = note.goodsValue - note.replacementValue - value;

  function update(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const replacements = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        purchasePrice: Number(line.price || 0),
        expiryDate: line.expiryDate || null,
      }));
    if (replacements.length === 0) {
      setError("أضف صنفاً بديلاً واحداً على الأقل");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/returns/${note._id}/replacements`, {
        method: "POST",
        body: JSON.stringify({ date: date || undefined, replacements }),
      });
      onSaved();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      {error ? <Alert message={error} /> : null}

      <div className="max-w-xs">
        <label className="field-label" htmlFor="replacement-date">
          تاريخ الاستلام
        </label>
        <input
          id="replacement-date"
          type="date"
          className="field-input"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>

      {lines.map((line) => (
        <div
          key={line.key}
          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12"
        >
          <div className="sm:col-span-4">
            <label className="field-label">الصنف</label>
            <select
              className="field-input"
              value={line.productId}
              onChange={(event) => {
                const product = products.find((item) => item._id === event.target.value);
                update(line.key, {
                  productId: event.target.value,
                  price: product ? String(product.purchasePrice) : line.price,
                });
              }}
            >
              <option value="">اختر صنفاً</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name} ({product.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">الكمية</label>
            <input
              type="number"
              min="0"
              step="any"
              className="field-input"
              value={line.quantity}
              onChange={(event) => update(line.key, { quantity: event.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">سعر الشراء</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="field-input"
              value={line.price}
              onChange={(event) => update(line.key, { price: event.target.value })}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label">الصلاحية</label>
            <input
              type="date"
              className="field-input"
              value={line.expiryDate}
              onChange={(event) => update(line.key, { expiryDate: event.target.value })}
            />
          </div>
          <div className="flex items-end sm:col-span-1">
            <button
              type="button"
              aria-label="حذف البند"
              className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
              onClick={() =>
                setLines((current) => current.filter((item) => item.key !== line.key))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-xs"
        onClick={() =>
          setLines((current) => [
            ...current,
            { key: newKey(), productId: "", quantity: "1", price: "", expiryDate: "" },
          ])
        }
      >
        <Plus size={14} />
        صنف بديل
      </button>

      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
        <div>
          <dt className="text-slate-500">قيمة هذا الاستلام</dt>
          <dd className="font-bold">{formatMoney(value)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">الفرق على حساب المورد بعد الاستلام</dt>
          <dd className="font-bold">
            {Math.abs(diff) < 0.005
              ? "لا يوجد فرق"
              : diff > 0
                ? `يُخصم ${formatMoney(diff)} من مستحقاته`
                : `يُضاف ${formatMoney(-diff)} لمستحقاته`}
          </dd>
        </div>
      </dl>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          تسجيل الاستلام
        </button>
      </div>
    </form>
  );
}
