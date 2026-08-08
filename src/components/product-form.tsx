"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { UNITS } from "@/lib/constants";
import { apiFetch } from "@/lib/client";
import { toDateInputValue } from "@/lib/format";
import { Alert } from "@/components/ui";
import type { Product } from "@/lib/types";

export function ProductForm({
  product,
  onSaved,
  onCancel,
}: {
  product?: Product;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(product);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: product?.name ?? "",
    unit: product?.unit ?? UNITS[0],
    quantity: String(product?.quantity ?? 0),
    purchasePrice: String(product?.purchasePrice ?? ""),
    salePrice: String(product?.salePrice ?? ""),
    expiryDate: toDateInputValue(product?.expiryDate),
    lowStockThreshold: String(product?.lowStockThreshold ?? 0),
    note: product?.note ?? "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      name: form.name,
      unit: form.unit,
      purchasePrice: Number(form.purchasePrice || 0),
      salePrice: Number(form.salePrice || 0),
      expiryDate: form.expiryDate || null,
      lowStockThreshold: Number(form.lowStockThreshold || 0),
      note: form.note,
      ...(isEdit ? {} : { quantity: Number(form.quantity || 0) }),
    };

    try {
      await apiFetch(
        isEdit ? `/api/products/${product!._id}` : "/api/products",
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
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="product-name">
            اسم الصنف
          </label>
          <input
            id="product-name"
            className="field-input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="مثال: زيت عباد الشمس"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="product-unit">
            الوحدة
          </label>
          <select
            id="product-unit"
            className="field-input"
            value={form.unit}
            onChange={(event) => update("unit", event.target.value)}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="product-quantity">
            {isEdit ? "الرصيد الحالي" : "الرصيد الافتتاحي"}
          </label>
          <input
            id="product-quantity"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={form.quantity}
            onChange={(event) => update("quantity", event.target.value)}
            disabled={isEdit}
          />
          {isEdit ? (
            <p className="mt-1 text-xs text-slate-400">
              يتغير الرصيد من خلال حركات الشراء والبيع فقط.
            </p>
          ) : null}
        </div>

        <div>
          <label className="field-label" htmlFor="product-purchase">
            سعر الشراء
          </label>
          <input
            id="product-purchase"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={form.purchasePrice}
            onChange={(event) => update("purchasePrice", event.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="product-sale">
            سعر البيع
          </label>
          <input
            id="product-sale"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={form.salePrice}
            onChange={(event) => update("salePrice", event.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="product-expiry">
            تاريخ الصلاحية
          </label>
          <input
            id="product-expiry"
            type="date"
            className="field-input"
            value={form.expiryDate}
            onChange={(event) => update("expiryDate", event.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="product-threshold">
            حد التنبيه للنفاد
          </label>
          <input
            id="product-threshold"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={form.lowStockThreshold}
            onChange={(event) => update("lowStockThreshold", event.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="product-note">
            ملاحظات
          </label>
          <input
            id="product-note"
            className="field-input"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            placeholder="اختياري"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {isEdit ? "حفظ التعديلات" : "إضافة الصنف"}
        </button>
      </div>
    </form>
  );
}
