"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import {
  DISCOUNT_TYPE_LABELS,
  MOVEMENT_LABELS,
  type DiscountType,
  type InvoiceKind,
  type MovementType,
} from "@/lib/constants";
import {
  clearInvoiceDraft,
  draftHasContent,
  loadInvoiceDraft,
  saveInvoiceDraft,
  type InvoiceDraft,
} from "@/lib/invoice-draft";
import { formatDate, formatMoney, toDateInputValue } from "@/lib/format";
import { Alert } from "@/components/ui";
import type { Product, ProductDetails, SalesRep } from "@/lib/types";

type Line = {
  key: string;
  productId: string;
  quantity: string;
  price: string;
  expiryDate: string;
};

function emptyLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    quantity: "1",
    price: "",
    expiryDate: "",
  };
}

function linesFromDraft(draft: InvoiceDraft | null): Line[] {
  if (!draft?.lines?.length) return [emptyLine()];
  return draft.lines.map((line) => ({
    key: line.key || Math.random().toString(36).slice(2),
    productId: line.productId || "",
    quantity: line.quantity || "1",
    price: line.price || "",
    expiryDate: line.expiryDate || "",
  }));
}

function readDraft(kind: InvoiceKind): InvoiceDraft | null {
  const draft = loadInvoiceDraft(kind);
  return draft && draftHasContent(draft) ? draft : null;
}

function draftFromState(input: {
  kind: InvoiceKind;
  customerName: string;
  date: string;
  discountType: DiscountType;
  discountValue: string;
  amountPaid: string;
  note: string;
  repId: string;
  lines: Line[];
}): InvoiceDraft {
  return {
    kind: input.kind,
    customerName: input.customerName,
    date: input.date,
    discountType: input.discountType,
    discountValue: input.discountValue,
    amountPaid: input.amountPaid,
    note: input.note,
    repId: input.repId,
    lines: input.lines.map((line) => ({ ...line })),
    savedAt: new Date().toISOString(),
  };
}

export function InvoiceForm({
  kind = "sale",
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  kind?: InvoiceKind;
  onSaved: (invoiceId: string) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data } = useSWR<{ products: Product[] }>("/api/products", apiFetch);
  const { data: repsData } = useSWR<{ reps: SalesRep[] }>(
    kind === "sale" ? "/api/reps?active=1" : null,
    apiFetch,
  );
  const products = useMemo(() => data?.products ?? [], [data?.products]);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product._id, product])),
    [products],
  );
  const reps = repsData?.reps ?? [];

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(() =>
    Boolean(readDraft(kind)),
  );
  const [customerName, setCustomerName] = useState(
    () => readDraft(kind)?.customerName ?? "",
  );
  const [date, setDate] = useState(
    () => readDraft(kind)?.date || toDateInputValue(new Date()),
  );
  const [discountType, setDiscountType] = useState<DiscountType>(
    () => readDraft(kind)?.discountType || "amount",
  );
  const [discountValue, setDiscountValue] = useState(
    () => readDraft(kind)?.discountValue || "0",
  );
  const [amountPaid, setAmountPaid] = useState(
    () => readDraft(kind)?.amountPaid || "",
  );
  const [note, setNote] = useState(() => readDraft(kind)?.note || "");
  const [repId, setRepId] = useState(() => readDraft(kind)?.repId || "");
  const [lines, setLines] = useState<Line[]>(() =>
    linesFromDraft(readDraft(kind)),
  );
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      onDirtyChange?.(draftRestored);
      // Drop stale empty drafts left by older quantity-based detection.
      if (!draftRestored) clearInvoiceDraft(kind);
      return;
    }
    const draft = draftFromState({
      kind,
      customerName,
      date,
      discountType,
      discountValue,
      amountPaid,
      note,
      repId,
      lines,
    });
    const dirty = draftHasContent(draft);
    onDirtyChange?.(dirty);
    const timer = window.setTimeout(() => {
      if (dirty) saveInvoiceDraft(draft);
      else clearInvoiceDraft(kind);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    kind,
    customerName,
    date,
    discountType,
    discountValue,
    amountPaid,
    note,
    repId,
    lines,
    onDirtyChange,
    draftRestored,
  ]);

  const { data: productDetails, isLoading: detailsLoading } = useSWR<ProductDetails>(
    detailProductId ? `/api/products/${detailProductId}/details` : null,
    apiFetch,
  );

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          const product = productMap.get(patch.productId);
          if (product && !line.price) {
            next.price = String(
              kind === "purchase" ? product.purchasePrice : product.salePrice,
            );
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
      const price = Number(line.price || 0);
      if (!product || qty <= 0) continue;
      subtotal += qty * price;
      needed.set(line.productId, (needed.get(line.productId) ?? 0) + qty);
    }

    if (kind === "sale") {
      for (const [productId, qty] of needed) {
        const product = productMap.get(productId)!;
        if (product.quantity < qty) {
          warnings.push(
            `الرصيد المتاح من "${product.name}" هو ${product.quantity} والكمية المطلوبة ${qty}`,
          );
        }
      }
    }

    const rawDiscount = Number(discountValue || 0);
    const discountResolved =
      discountType === "percent"
        ? Math.min(subtotal, (subtotal * rawDiscount) / 100)
        : Math.min(subtotal, rawDiscount);
    const total = Math.max(0, subtotal - discountResolved);
    return { subtotal, discountResolved, total, warnings };
  }, [lines, productMap, discountType, discountValue, kind]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const items = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => {
        const price = Number(line.price || 0);
        return {
          productId: line.productId,
          quantity: Number(line.quantity),
          ...(kind === "purchase"
            ? {
                purchasePrice: price,
                expiryDate: line.expiryDate || null,
              }
            : { salePrice: price }),
        };
      });

    if (!customerName.trim()) {
      setError(kind === "purchase" ? "أدخل اسم المورد" : "أدخل اسم العميل");
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
            kind,
            customerName,
            date: date || undefined,
            discountType,
            discountValue: Number(discountValue || 0),
            amountPaid:
              amountPaid === ""
                ? computed.total
                : Number(amountPaid || 0),
            note,
            repId: kind === "sale" && repId ? repId : null,
            items,
          }),
        },
      );
      clearInvoiceDraft(kind);
      onDirtyChange?.(false);
      onSaved(result.invoice._id);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function clearDraft() {
    clearInvoiceDraft(kind);
    setCustomerName("");
    setDate(toDateInputValue(new Date()));
    setDiscountType("amount");
    setDiscountValue("0");
    setAmountPaid("");
    setNote("");
    setRepId("");
    setLines([emptyLine()]);
    setDraftRestored(false);
    onDirtyChange?.(false);
  }

  const partyLabel = kind === "purchase" ? "اسم المورد" : "اسم العميل";
  const partyPlaceholder =
    kind === "purchase" ? "مثال: مورد النور" : "مثال: سوبر ماركت الأمل";
  const priceLabel = kind === "purchase" ? "سعر الشراء" : "سعر البيع";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Alert message={error} /> : null}

      {draftRestored ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>تم استعادة مسودة غير محفوظة لهذه الفاتورة.</span>
          <button
            type="button"
            className="btn-ghost px-3 py-1 text-xs"
            onClick={clearDraft}
          >
            تفريغ المسودة
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="invoice-customer">
            {partyLabel}
          </label>
          <input
            id="invoice-customer"
            className="field-input"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder={partyPlaceholder}
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

        {kind === "sale" ? (
          <div>
            <label className="field-label" htmlFor="invoice-rep">
              المندوب
            </label>
            <select
              id="invoice-rep"
              className="field-input"
              value={repId}
              onChange={(event) => setRepId(event.target.value)}
            >
              <option value="">بدون مندوب</option>
              {reps.map((rep) => (
                <option key={rep._id} value={rep._id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="invoice-discount-type">
            نوع الخصم
          </label>
          <select
            id="invoice-discount-type"
            className="field-input"
            value={discountType}
            onChange={(event) =>
              setDiscountType(event.target.value as DiscountType)
            }
          >
            {(Object.keys(DISCOUNT_TYPE_LABELS) as DiscountType[]).map(
              (key) => (
                <option key={key} value={key}>
                  {DISCOUNT_TYPE_LABELS[key]}
                </option>
              ),
            )}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="invoice-discount">
            الخصم {discountType === "percent" ? "(%)" : "(مبلغ)"}
          </label>
          <input
            id="invoice-discount"
            type="number"
            min="0"
            step="0.01"
            className="field-input"
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
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
            Number(line.quantity || 0) * Number(line.price || 0);
          return (
            <div
              key={line.key}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12"
            >
              <div className={kind === "purchase" ? "sm:col-span-4" : "sm:col-span-5"}>
                <label className="field-label">الصنف</label>
                <div className="flex gap-1">
                  <select
                    className="field-input"
                    value={line.productId}
                    onChange={(event) => {
                      const productId = event.target.value;
                      const selected = productMap.get(productId);
                      updateLine(line.key, {
                        productId,
                        price: selected
                          ? String(
                              kind === "purchase"
                                ? selected.purchasePrice
                                : selected.salePrice,
                            )
                          : line.price,
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
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                    disabled={!line.productId}
                    onClick={() => setDetailProductId(line.productId)}
                    aria-label="تفاصيل الصنف"
                    title="تفاصيل الصنف"
                  >
                    <Info size={16} />
                  </button>
                </div>
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
                <label className="field-label">{priceLabel}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="field-input"
                  value={line.price}
                  onChange={(event) =>
                    updateLine(line.key, { price: event.target.value })
                  }
                />
              </div>
              {kind === "purchase" ? (
                <div className="sm:col-span-2">
                  <label className="field-label">الصلاحية</label>
                  <input
                    type="date"
                    className="field-input"
                    value={line.expiryDate}
                    onChange={(event) =>
                      updateLine(line.key, { expiryDate: event.target.value })
                    }
                  />
                </div>
              ) : null}
              <div
                className={`flex items-end justify-between gap-2 ${
                  kind === "purchase" ? "sm:col-span-2" : "sm:col-span-3"
                }`}
              >
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

      {detailProductId ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="font-bold text-slate-900">تفاصيل الصنف</h4>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() => setDetailProductId(null)}
            >
              إغلاق
            </button>
          </div>
          {detailsLoading ? (
            <p className="text-slate-500">جارٍ التحميل...</p>
          ) : productDetails ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <p>
                <span className="text-slate-500">الاسم: </span>
                <span className="font-semibold">
                  {productDetails.product.name}
                </span>
              </p>
              <p>
                <span className="text-slate-500">الرصيد: </span>
                <span className="font-semibold">
                  {productDetails.product.quantity}{" "}
                  {productDetails.product.unit}
                </span>
              </p>
              <p>
                <span className="text-slate-500">سعر الشراء: </span>
                {formatMoney(productDetails.product.purchasePrice)}
              </p>
              <p>
                <span className="text-slate-500">سعر البيع: </span>
                {formatMoney(productDetails.product.salePrice)}
              </p>
              <p>
                <span className="text-slate-500">الصلاحية: </span>
                {formatDate(productDetails.product.expiryDate)}
              </p>
              <div className="sm:col-span-2">
                <p className="mb-1 text-slate-500">آخر الحركات</p>
                <ul className="space-y-1 text-xs text-slate-700">
                  {productDetails.recentMovements.slice(0, 5).map((movement) => (
                    <li key={movement._id}>
                      {formatDate(movement.date)} —{" "}
                      {MOVEMENT_LABELS[movement.type as MovementType] ??
                        movement.type}{" "}
                      — كمية {movement.quantity}
                    </li>
                  ))}
                  {productDetails.recentMovements.length === 0 ? (
                    <li>لا توجد حركات</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-rose-600">تعذر تحميل تفاصيل الصنف</p>
          )}
        </div>
      ) : null}

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
          <dt className="text-slate-500">
            الخصم
            {discountType === "percent" && Number(discountValue) > 0
              ? ` (${discountValue}%)`
              : ""}
          </dt>
          <dd className="font-bold">{formatMoney(computed.discountResolved)}</dd>
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
