"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  RETURN_DIRECTION_LABELS,
  RETURN_SETTLEMENT_LABELS,
  type PartyKind,
} from "@/lib/constants";
import {
  formatDate,
  formatMoney,
  formatNumber,
  toDateInputValue,
} from "@/lib/format";
import type { Product, ReturnLookup, ReturnNote } from "@/lib/types";

const round = (value: number) => Math.round(value * 100) / 100;

type ReplacementLine = {
  key: string;
  productId: string;
  quantity: string;
  price: string;
  expiryDate: string;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

function fetchLookup(
  direction: PartyKind,
  invoiceNumber: string,
  statementNumber: string,
) {
  const params = new URLSearchParams({
    direction,
    invoiceNumber: invoiceNumber.trim(),
    statementNumber: statementNumber.trim(),
  });
  return apiFetch<ReturnLookup>(`/api/returns/lookup?${params.toString()}`);
}

export function ReturnForm({
  initialDirection = "customer",
  initialInvoiceNumber = "",
  initialStatementNumber = "",
}: {
  initialDirection?: PartyKind;
  initialInvoiceNumber?: string;
  initialStatementNumber?: string;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<PartyKind>(initialDirection);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [statementNumber, setStatementNumber] = useState(initialStatementNumber);
  const [lookup, setLookup] = useState<ReturnLookup | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [searching, setSearching] = useState(Boolean(initialInvoiceNumber));

  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [settlement, setSettlement] = useState<"refund" | "exchange">("refund");
  const [receiveNow, setReceiveNow] = useState(true);
  const [replacements, setReplacements] = useState<ReplacementLine[]>([]);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isCustomer = direction === "customer";
  const exchange = !isCustomer && settlement === "exchange";

  const { data: productsData } = useSWR<{ products: Product[] }>(
    exchange ? "/api/products" : null,
    apiFetch,
  );
  const products = useMemo(
    () => productsData?.products ?? [],
    [productsData?.products],
  );

  async function runLookup() {
    setLookupError("");
    setError("");
    if (!invoiceNumber.trim()) {
      setLookupError("أدخل رقم الفاتورة");
      return;
    }
    if (isCustomer && !statementNumber.trim()) {
      setLookupError("أدخل رقم البيان");
      return;
    }
    setSearching(true);
    try {
      const result = await fetchLookup(direction, invoiceNumber, statementNumber);
      setLookup(result);
      setQuantities({});
      setReplacements([]);
    } catch (lookupFailure) {
      setLookup(null);
      setLookupError((lookupFailure as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const autoLookedUp = useRef(false);
  useEffect(() => {
    if (autoLookedUp.current || !initialInvoiceNumber) return;
    autoLookedUp.current = true;
    fetchLookup(initialDirection, initialInvoiceNumber, initialStatementNumber)
      .then(setLookup)
      .catch((lookupFailure: Error) => setLookupError(lookupFailure.message))
      .finally(() => setSearching(false));
  }, [initialDirection, initialInvoiceNumber, initialStatementNumber]);

  function resetLookup() {
    setLookup(null);
    setLookupError("");
    setQuantities({});
    setReplacements([]);
  }

  const selected = useMemo(
    () =>
      (lookup?.lines ?? [])
        .map((line) => ({ line, quantity: Number(quantities[line.line] || 0) }))
        .filter((row) => row.quantity > 0),
    [lookup, quantities],
  );

  const goodsValue = round(
    selected.reduce((sum, row) => sum + row.quantity * row.line.unitPrice, 0),
  );
  const replacementValue = round(
    replacements.reduce(
      (sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0),
      0,
    ),
  );
  const moneyEffect = exchange
    ? receiveNow && replacements.length > 0
      ? round(goodsValue - replacementValue)
      : 0
    : round(goodsValue * (lookup?.moneyRatio ?? 0));

  function prefillReplacements() {
    setReplacements(
      selected.map((row) => ({
        key: newKey(),
        productId: row.line.product,
        quantity: String(row.quantity),
        price: String(row.line.purchasePrice),
        expiryDate: "",
      })),
    );
  }

  function updateReplacement(key: string, patch: Partial<ReplacementLine>) {
    setReplacements((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!lookup) {
      setError("ابحث عن الفاتورة أولاً");
      return;
    }
    if (selected.length === 0) {
      setError("أدخل كمية مرتجعة لصنف واحد على الأقل");
      return;
    }
    for (const row of selected) {
      if (row.quantity > row.line.remaining) {
        setError(
          `الكمية المرتجعة من "${row.line.productName}" أكبر من المتاح (${row.line.remaining})`,
        );
        return;
      }
    }
    const replacementRows =
      exchange && receiveNow
        ? replacements
            .filter((row) => row.productId && Number(row.quantity) > 0)
            .map((row) => ({
              productId: row.productId,
              quantity: Number(row.quantity),
              purchasePrice: Number(row.price || 0),
              expiryDate: row.expiryDate || null,
            }))
        : [];
    if (exchange && receiveNow && replacementRows.length === 0) {
      setError("أضف البضاعة البديلة أو اختر استلام البدل لاحقاً");
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<{ returnNote: ReturnNote }>("/api/returns", {
        method: "POST",
        body: JSON.stringify({
          direction,
          invoiceNumber: lookup.invoice.number,
          statementNumber: isCustomer ? statementNumber.trim() : "",
          ...(isCustomer ? {} : { settlement }),
          date: date || undefined,
          note,
          items: selected.map((row) => ({
            line: row.line.line,
            quantity: row.quantity,
          })),
          replacements: replacementRows,
        }),
      });
      router.push(`/returns/${result.returnNote._id}`);
    } catch (submitError) {
      setError((submitError as Error).message);
      setSaving(false);
    }
  }

  const invoice = lookup?.invoice;
  const remainingOnInvoice = invoice
    ? Math.max(0, invoice.total - invoice.returnedTotal - invoice.amountPaid)
    : 0;

  const effectText = isCustomer
    ? `يُخصم ${formatMoney(moneyEffect)} من حساب العميل`
    : settlement === "refund"
      ? `يُخصم ${formatMoney(moneyEffect)} من مستحقات المورد`
      : !receiveNow || replacements.length === 0
        ? "لا يتغير الحساب — في انتظار استلام البدل"
        : Math.abs(moneyEffect) < 0.005
          ? "قيمة البدل مساوية — لا يتغير الحساب"
          : moneyEffect > 0
            ? `الفرق ${formatMoney(moneyEffect)} يُخصم من مستحقات المورد`
            : `الفرق ${formatMoney(-moneyEffect)} يُضاف لمستحقات المورد`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="card p-5">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(["customer", "supplier"] as PartyKind[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDirection(value);
                resetLookup();
              }}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                direction === value
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {RETURN_DIRECTION_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="return-invoice-number">
              {isCustomer ? "رقم فاتورة البيع" : "رقم فاتورة الشراء"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="return-invoice-number"
              className="field-input"
              dir="ltr"
              value={invoiceNumber}
              onChange={(event) => {
                setInvoiceNumber(event.target.value);
                if (lookup) resetLookup();
              }}
              placeholder={isCustomer ? "INV-2026-0001" : "PINV-2026-0001"}
            />
          </div>
          {isCustomer ? (
            <div>
              <label className="field-label" htmlFor="return-statement-number">
                رقم البيان <span className="text-rose-500">*</span>
              </label>
              <input
                id="return-statement-number"
                className="field-input"
                value={statementNumber}
                onChange={(event) => {
                  setStatementNumber(event.target.value);
                  if (lookup) resetLookup();
                }}
              />
            </div>
          ) : null}
          <div className="flex items-end">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={runLookup}
              disabled={searching}
            >
              {searching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              بحث عن الفاتورة
            </button>
          </div>
        </div>
        {isCustomer ? (
          <p className="mt-2 text-xs text-slate-500">
            لا يُقبل مرتجع العميل إلا إذا تطابق رقم الفاتورة ورقم البيان لنفس فاتورة البيع.
          </p>
        ) : null}
        {lookupError ? (
          <div className="mt-4">
            <Alert message={lookupError} />
          </div>
        ) : null}
      </div>

      {invoice && lookup ? (
        <>
          <div className="card p-5">
            <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-xs text-slate-500">
                  {isCustomer ? "العميل" : "المورد"}
                </p>
                <p className="font-bold text-slate-900">{invoice.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">تاريخ الفاتورة</p>
                <p className="font-bold text-slate-900">{formatDate(invoice.date)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">صافي الفاتورة</p>
                <p className="font-bold text-slate-900">{formatMoney(invoice.total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">مرتجع سابق</p>
                <p className="font-bold text-slate-900">
                  {formatMoney(invoice.returnedTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">المتبقي على الفاتورة</p>
                <p className="font-bold text-slate-900">
                  {formatMoney(remainingOnInvoice)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">الصنف</th>
                    <th className="px-3 py-2 font-semibold">
                      {isCustomer ? "المباع" : "المشترى"}
                    </th>
                    <th className="px-3 py-2 font-semibold">مرتجع سابق</th>
                    <th className="px-3 py-2 font-semibold">المتاح للارتجاع</th>
                    <th className="px-3 py-2 font-semibold">السعر</th>
                    <th className="px-3 py-2 font-semibold">الكمية المرتجعة</th>
                    <th className="px-3 py-2 font-semibold">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lookup.lines.map((line) => {
                    const qty = Number(quantities[line.line] || 0);
                    const over = qty > line.remaining;
                    return (
                      <tr key={line.line}>
                        <td className="px-3 py-2 font-medium">
                          {line.productName}
                          <span className="block text-xs text-slate-400">{line.unit}</span>
                        </td>
                        <td className="px-3 py-2">{formatNumber(line.sold)}</td>
                        <td className="px-3 py-2">{formatNumber(line.returned)}</td>
                        <td className="px-3 py-2 font-semibold">
                          {formatNumber(line.remaining)}
                        </td>
                        <td className="px-3 py-2">{formatMoney(line.unitPrice)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max={line.remaining}
                            step="any"
                            className={`field-input py-1.5 ${over ? "border-rose-400" : ""}`}
                            aria-label={`الكمية المرتجعة من ${line.productName}`}
                            disabled={line.remaining <= 0}
                            value={quantities[line.line] ?? ""}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [line.line]: event.target.value,
                              }))
                            }
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold">
                          {formatMoney(qty * line.unitPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!isCustomer ? (
            <div className="card p-5">
              <p className="field-label">طريقة التسوية مع المورد</p>
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(["refund", "exchange"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSettlement(value);
                      if (value === "exchange" && replacements.length === 0) {
                        prefillReplacements();
                      }
                    }}
                    className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      settlement === value
                        ? "bg-white text-brand-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {RETURN_SETTLEMENT_LABELS[value]}
                  </button>
                ))}
              </div>
              {settlement === "refund" ? (
                <p className="text-sm text-slate-600">
                  البضاعة تخرج من المخزون ويُخصم ثمنها من مستحقات المورد. لو الفاتورة
                  مسددة يصبح لنا رصيد عنده، وعند استلام المبلغ نقداً سجّل سند قبض من
                  حساب المورد.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-600">
                    البضاعة تخرج والمورد يرسل بدلاً منها بدون فاتورة شراء جديدة، فلا يتغير
                    الحساب إلا بفرق القيمة.
                  </p>
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={receiveNow}
                      onChange={(event) => setReceiveNow(event.target.checked)}
                    />
                    تم استلام البدل الآن (أو سجّله لاحقاً من صفحة الاذن)
                  </label>
                  {receiveNow ? (
                    <div className="space-y-2">
                      {replacements.map((row) => (
                        <div
                          key={row.key}
                          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-12"
                        >
                          <div className="sm:col-span-4">
                            <label className="field-label">صنف البدل</label>
                            <select
                              className="field-input"
                              value={row.productId}
                              onChange={(event) => {
                                const product = products.find(
                                  (item) => item._id === event.target.value,
                                );
                                updateReplacement(row.key, {
                                  productId: event.target.value,
                                  price: product ? String(product.purchasePrice) : row.price,
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
                              value={row.quantity}
                              onChange={(event) =>
                                updateReplacement(row.key, { quantity: event.target.value })
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="field-label">سعر الشراء</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="field-input"
                              value={row.price}
                              onChange={(event) =>
                                updateReplacement(row.key, { price: event.target.value })
                              }
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="field-label">الصلاحية</label>
                            <input
                              type="date"
                              className="field-input"
                              value={row.expiryDate}
                              onChange={(event) =>
                                updateReplacement(row.key, { expiryDate: event.target.value })
                              }
                            />
                          </div>
                          <div className="flex items-end sm:col-span-1">
                            <button
                              type="button"
                              aria-label="حذف البند"
                              className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                              onClick={() =>
                                setReplacements((current) =>
                                  current.filter((item) => item.key !== row.key),
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-xs"
                          onClick={() =>
                            setReplacements((current) => [
                              ...current,
                              {
                                key: newKey(),
                                productId: "",
                                quantity: "1",
                                price: "",
                                expiryDate: "",
                              },
                            ])
                          }
                        >
                          <Plus size={14} />
                          صنف بديل
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-xs"
                          onClick={prefillReplacements}
                          disabled={selected.length === 0}
                        >
                          نفس الأصناف المرتجعة
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="card p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="return-date">
                  تاريخ الارتجاع
                </label>
                <input
                  id="return-date"
                  type="date"
                  className="field-input"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="return-note">
                  سبب الارتجاع / ملاحظات
                </label>
                <input
                  id="return-note"
                  className="field-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </div>

            <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">قيمة البضاعة المرتجعة</dt>
                <dd className="font-bold">{formatMoney(goodsValue)}</dd>
              </div>
              {exchange ? (
                <div>
                  <dt className="text-slate-500">قيمة البدل</dt>
                  <dd className="font-bold">
                    {receiveNow ? formatMoney(replacementValue) : "—"}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="text-slate-500">بعد الخصم والضريبة</dt>
                  <dd className="font-bold">{formatMoney(moneyEffect)}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">أثر الحساب</dt>
                <dd className="font-bold text-brand-700">{effectText}</dd>
              </div>
            </dl>

            {error ? (
              <div className="mt-4">
                <Alert message={error} />
              </div>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                حفظ اذن الارتجاع
              </button>
            </div>
          </div>
        </>
      ) : null}
    </form>
  );
}
