"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  settlingDirection,
  type PartyKind,
  type PaymentDirection,
} from "@/lib/constants";
import { formatDate, formatMoney, toDateInputValue } from "@/lib/format";
import type { OpenInvoice } from "@/lib/types";

const round = (value: number) => Math.round(value * 100) / 100;

function allocate(
  invoices: OpenInvoice[],
  amount: number,
): Record<string, string> {
  let left = amount;
  const result: Record<string, string> = {};
  for (const invoice of invoices) {
    const share = round(Math.max(0, Math.min(left, invoice.remaining)));
    result[invoice._id] = share > 0 ? String(share) : "";
    left = round(left - share);
  }
  return result;
}

export function PaymentForm({
  partyId,
  partyKind,
  openInvoices,
  defaultInvoiceId,
  onSaved,
  onCancel,
}: {
  partyId: string;
  partyKind: PartyKind;
  openInvoices: OpenInvoice[];
  defaultInvoiceId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const settling = settlingDirection(partyKind);
  const ordered = useMemo(
    () =>
      defaultInvoiceId
        ? [
            ...openInvoices.filter((invoice) => invoice._id === defaultInvoiceId),
            ...openInvoices.filter((invoice) => invoice._id !== defaultInvoiceId),
          ]
        : openInvoices,
    [openInvoices, defaultInvoiceId],
  );

  const defaultAmount = defaultInvoiceId
    ? (ordered[0]?._id === defaultInvoiceId ? ordered[0].remaining : 0)
    : 0;

  const [direction, setDirection] = useState<PaymentDirection>(settling);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    allocate(ordered, defaultAmount),
  );
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const settles = direction === settling;
  const amountValue = Number(amount || 0);
  const allocatedTotal = round(
    Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0),
  );
  const unallocated = round(amountValue - allocatedTotal);

  function changeAmount(value: string) {
    setAmount(value);
    if (!manual) setAllocations(allocate(ordered, Number(value || 0)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (amountValue <= 0) {
      setError("أدخل مبلغاً أكبر من صفر");
      return;
    }
    if (settles && unallocated < -0.005) {
      setError("مجموع التوزيع أكبر من مبلغ السند");
      return;
    }
    for (const invoice of ordered) {
      if (Number(allocations[invoice._id] || 0) > invoice.remaining + 0.005) {
        setError(`المبلغ الموزع على ${invoice.number} أكبر من المتبقي`);
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          partyId,
          direction,
          amount: amountValue,
          date: date || undefined,
          note,
          allocations: settles
            ? ordered
                .map((invoice) => ({
                  invoiceId: invoice._id,
                  amount: Number(allocations[invoice._id] || 0),
                }))
                .filter((row) => row.amount > 0)
            : [],
        }),
      });
      onSaved();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const settleLabel =
    partyKind === "customer" ? "تحصيل من العميل (سند قبض)" : "سداد للمورد (سند صرف)";
  const reverseLabel =
    partyKind === "customer"
      ? "رد مبلغ للعميل (سند صرف)"
      : "استلام مبلغ من المورد (سند قبض)";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Alert message={error} /> : null}

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[
          { value: settling, label: settleLabel },
          { value: settling === "in" ? "out" : "in", label: reverseLabel },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setDirection(option.value as PaymentDirection)}
            className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
              direction === option.value
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="payment-amount">
            المبلغ
          </label>
          <input
            id="payment-amount"
            type="number"
            min="0"
            step="0.01"
            className="field-input"
            value={amount}
            onChange={(event) => changeAmount(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="payment-date">
            التاريخ
          </label>
          <input
            id="payment-date"
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="payment-note">
            ملاحظات
          </label>
          <input
            id="payment-note"
            className="field-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="مثال: نقدي / تحويل بنكي / شيك رقم ..."
          />
        </div>
      </div>

      {settles ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              توزيع المبلغ على الفواتير المفتوحة
            </h3>
            {manual ? (
              <button
                type="button"
                className="btn-ghost px-3 py-1 text-xs"
                onClick={() => {
                  setManual(false);
                  setAllocations(allocate(ordered, amountValue));
                }}
              >
                توزيع تلقائي (الأقدم أولاً)
              </button>
            ) : null}
          </div>
          {ordered.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              لا توجد فواتير مفتوحة — سيُسجَّل المبلغ دفعة مقدمة على الحساب.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">الفاتورة</th>
                    <th className="px-3 py-2 font-semibold">التاريخ</th>
                    <th className="px-3 py-2 font-semibold">المتبقي</th>
                    <th className="px-3 py-2 font-semibold">يُخصم منها</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordered.map((invoice) => (
                    <tr key={invoice._id}>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {invoice.number}
                        {invoice.statementNumber ? (
                          <span className="block text-xs font-normal text-slate-400">
                            بيان {invoice.statementNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{formatDate(invoice.date)}</td>
                      <td className="px-3 py-2">{formatMoney(invoice.remaining)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="field-input py-1.5"
                          aria-label={`المبلغ الموزع على ${invoice.number}`}
                          value={allocations[invoice._id] ?? ""}
                          onChange={(event) => {
                            setManual(true);
                            setAllocations((current) => ({
                              ...current,
                              [invoice._id]: event.target.value,
                            }));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <div>
              <dt className="text-slate-500">الموزع على الفواتير</dt>
              <dd className="font-bold">{formatMoney(allocatedTotal)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">دفعة مقدمة على الحساب</dt>
              <dd
                className={`font-bold ${unallocated < -0.005 ? "text-rose-600" : ""}`}
              >
                {formatMoney(unallocated)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {partyKind === "customer"
            ? "يُستخدم لرد رصيد دائن للعميل (مثلاً بعد مرتجع على فاتورة مدفوعة). يزيد رصيد الحساب."
            : "يُستخدم عندما يرد المورد ثمن مرتجع نقداً. يقلل الرصيد الذي لنا عنده."}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          حفظ السند
        </button>
      </div>
    </form>
  );
}
