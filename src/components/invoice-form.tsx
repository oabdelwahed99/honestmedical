"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { formatMoney, toDateInputValue } from "@/lib/format";
import { Alert } from "@/components/ui";
import type { Product } from "@/lib/types";

type Line = {
  key: string;
  productId: string;
  quantity: string;
  salePrice: string;
};

function emptyLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    quantity: "1",
    salePrice: "",
  };
}

export function InvoiceForm({
  onSaved,
  onCancel,
}: {
  onSaved: (invoiceId: string) => void;
  onCancel: () => void;
}) {
  const { data } = useSWR<{ products: Product[] }>("/api/products", apiFetch);
  const products = useMemo(() => data?.products ?? [], [data?.products]);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product._id, product])),
    [products],
  );

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          const product = productMap.get(patch.productId);
          if (product && !line.salePrice) {
            next.salePrice = String(product.salePrice);
          }
        }
        return next;
      }),
    );
  }

  const computed = useMemo(() => {
    let subtotal = 0;
    const warnings: string[] = [];
    const needed = new Map<string, number>();

    for (const line of lines) {
      const product = productMap.get(line.productId);
      const qty = Number(line.quantity || 0);
      const price = Number(line.salePrice || 0);
      if (!product || qty <= 0) continue;
      subtotal += qty * price;
      needed.set(line.productId, (needed.get(line.productId) ?? 0) + qty);
    }

    for (const [productId, qty] of needed) {
      const product = productMap.get(productId)!;
      if (product.quantity < qty) {
        warnings.push(
          `الرصيد المتاح من "${product.name}" هو ${product.quantity} والكمية المطلوبة ${qty}`,
        );
      }
    }

    const discountValue = Math.min(Number(discount || 0), subtotal);
    const total = Math.max(0, subtotal - discountValue);
    return { subtotal, discountValue, total, warnings };
  }, [lines, productMap, discount]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const items = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        salePrice: Number(line.salePrice || 0),
      }));

    if (!customerName.trim()) {
      setError("أدخل اسم العميل");
      return;
    }
    if (items.length === 0) {
      setError("أضف صنفاً واحداً على الأقل");
      return;
    }
    if (computed.warnings.length > 0) {
      setError(computed.warnings[0]);
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<{ invoice: { _id: string } }>(
        "/api/invoices",
        {
          method: "POST",
          body: JSON.stringify({
            customerName,
            date: date || undefined,
            discount: Number(discount || 0),
            amountPaid:
              amountPaid === ""
                ? computed.total
                : Number(amountPaid || 0),
            note,
            items,
          }),
        },
      );
      onSaved(result.invoice._id);
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
          <label className="field-label" htmlFor="invoice-customer">
            اسم العميل
          </label>
          <input
            id="invoice-customer"
            className="field-input"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="مثال: سوبر ماركت الأمل"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="invoice-date">
            التاريخ
          </label>
          <input
            id="invoice-date"
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="invoice-discount">
            الخصم
          </label>
          <input
            id="invoice-discount"
            type="number"
            min="0"
            step="0.01"
            className="field-input"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">بنود الفاتورة</h3>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            <Plus size={14} />
            بند
          </button>
        </div>

        {lines.map((line) => {
          const product = productMap.get(line.productId);
          const lineTotal =
            Number(line.quantity || 0) * Number(line.salePrice || 0);
          return (
            <div
              key={line.key}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12"
            >
              <div className="sm:col-span-5">
                <label className="field-label">الصنف</label>
                <select
                  className="field-input"
                  value={line.productId}
                  onChange={(event) => {
                    const productId = event.target.value;
                    const selected = productMap.get(productId);
                    updateLine(line.key, {
                      productId,
                      salePrice: selected
                        ? String(selected.salePrice)
                        : line.salePrice,
                    });
                  }}
                  required
                >
                  <option value="">اختر صنفاً</option>
                  {products.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} ({item.unit}) — متاح {item.quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">الكمية</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="field-input"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(line.key, { quantity: event.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">سعر البيع</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="field-input"
                  value={line.salePrice}
                  onChange={(event) =>
                    updateLine(line.key, { salePrice: event.target.value })
                  }
                />
              </div>
              <div className="flex items-end justify-between gap-2 sm:col-span-3">
                <div>
                  <p className="field-label">الإجمالي</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(lineTotal)}
                  </p>
                  {product ? (
                    <p className="text-xs text-slate-500">
                      متاح {product.quantity} {product.unit}
                    </p>
                  ) : null}
                </div>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {computed.warnings.length > 0 ? (
        <div className="mt-3">
          <Alert message={computed.warnings[0]} />
        </div>
      ) : null}

      <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">المجموع</dt>
          <dd className="font-bold">{formatMoney(computed.subtotal)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">الخصم</dt>
          <dd className="font-bold">{formatMoney(computed.discountValue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">الصافي</dt>
          <dd className="font-bold text-brand-600">
            {formatMoney(computed.total)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="invoice-paid">
            المدفوع (اتركه فارغاً = كامل المبلغ)
          </label>
          <input
            id="invoice-paid"
            type="number"
            min="0"
            step="0.01"
            className="field-input"
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            placeholder={String(computed.total)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="invoice-note">
            ملاحظات
          </label>
          <input
            id="invoice-note"
            className="field-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          إنشاء الفاتورة
        </button>
      </div>
    </form>
  );
}
