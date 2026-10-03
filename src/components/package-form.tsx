"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { UNITS } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PackageRecipe, Product } from "@/lib/types";

type Line = { productId: string; quantity: string };

export function PackageForm({
  pkg,
  products,
  onSaved,
  onCancel,
}: {
  pkg?: PackageRecipe;
  products: Product[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(pkg);
  const [form, setForm] = useState({
    name: pkg?.name ?? "",
    unit: pkg?.product.unit ?? UNITS[0],
    salePrice: String(pkg?.product.salePrice ?? ""),
    lowStockThreshold: String(pkg?.product.lowStockThreshold ?? 0),
    note: pkg?.note ?? "",
  });
  const [lines, setLines] = useState<Line[]>(
    pkg?.components.map((component) => ({
      productId: component.product,
      quantity: String(component.quantity),
    })) ?? [{ productId: "", quantity: "1" }],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const choices = products.filter(
    (product) => !product.manufactured && product._id !== pkg?.product._id,
  );
  const productMap = new Map(choices.map((product) => [product._id, product]));

  const unitCost = lines.reduce((sum, line) => {
    const product = productMap.get(line.productId);
    return sum + (product ? product.purchasePrice * Number(line.quantity || 0) : 0);
  }, 0);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const components = lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity || 0),
      }));
    if (!form.name.trim()) {
      setError("أدخل اسم المصنّع");
      return;
    }
    if (components.length === 0) {
      setError("أضف مكوّناً واحداً على الأقل");
      return;
    }
    if (components.some((line) => !(line.quantity > 0))) {
      setError("كمية كل مكوّن يجب أن تكون أكبر من صفر");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(isEdit ? `/api/packages/${pkg!._id}` : "/api/packages", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          unit: form.unit,
          salePrice: Number(form.salePrice || 0),
          lowStockThreshold: Number(form.lowStockThreshold || 0),
          note: form.note,
          components,
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
          <label className="field-label" htmlFor="package-name">
            اسم المصنّع
          </label>
          <input
            id="package-name"
            className="field-input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="مثال: باكدج ألفا"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="package-unit">
            الوحدة
          </label>
          <select
            id="package-unit"
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
          <label className="field-label" htmlFor="package-sale">
            سعر البيع
          </label>
          <input
            id="package-sale"
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
          <label className="field-label" htmlFor="package-threshold">
            حد التنبيه للنفاد
          </label>
          <input
            id="package-threshold"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={form.lowStockThreshold}
            onChange={(event) => update("lowStockThreshold", event.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="package-note">
            ملاحظات
          </label>
          <input
            id="package-note"
            className="field-input"
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            placeholder="اختياري"
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">مكوّنات الوحدة الواحدة</h3>
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setLines((current) => [...current, { productId: "", quantity: "1" }])
            }
          >
            <Plus size={16} />
            إضافة مكوّن
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => {
            const product = productMap.get(line.productId);
            return (
              <div
                key={index}
                className="grid items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_140px_auto]"
              >
                <div>
                  <label className="field-label" htmlFor={`component-${index}`}>
                    الصنف
                  </label>
                  <select
                    id={`component-${index}`}
                    className="field-input"
                    value={line.productId}
                    onChange={(event) =>
                      updateLine(index, { productId: event.target.value })
                    }
                  >
                    <option value="">اختر صنفاً</option>
                    {choices.map((choice) => (
                      <option key={choice._id} value={choice._id}>
                        {choice.name} ({choice.unit}) — متاح{" "}
                        {formatNumber(choice.quantity)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="field-label"
                    htmlFor={`component-qty-${index}`}
                  >
                    الكمية {product ? `(${product.unit})` : ""}
                  </label>
                  <input
                    id={`component-qty-${index}`}
                    type="number"
                    min="0"
                    step="any"
                    className="field-input"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                  />
                </div>
                <button
                  type="button"
                  title="حذف المكوّن"
                  aria-label="حذف المكوّن"
                  className="rounded-lg p-2.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                  onClick={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                  disabled={lines.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-slate-600">
          تكلفة الوحدة الحالية من المكوّنات:{" "}
          <span className="font-bold text-slate-900">{formatMoney(unitCost)}</span>
        </p>
        {isEdit ? (
          <p className="mt-1 text-xs text-slate-400">
            تعديل التركيبة يطبَّق على عمليات التصنيع القادمة فقط.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {isEdit ? "حفظ التعديلات" : "إضافة المصنّع"}
        </button>
      </div>
    </form>
  );
}
