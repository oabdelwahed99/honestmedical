"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowRight, Loader2, Printer, Trash2 } from "lucide-react";
import {
  Alert,
  Loading,
  PageHeader,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [amountPaid, setAmountPaid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{ invoice: Invoice }>(
    params.id ? `/api/invoices/${params.id}` : null,
    apiFetch,
  );
  const invoice = data?.invoice ?? null;

  async function savePayment() {
    if (!invoice || amountPaid === null) return;
    setSaving(true);
    setActionError("");
    try {
      await apiFetch(`/api/invoices/${invoice._id}`, {
        method: "PATCH",
        body: JSON.stringify({ amountPaid: Number(amountPaid || 0) }),
      });
      setAmountPaid(null);
      await mutate();
    } catch (saveError) {
      setActionError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    if (
      !confirm(
        "حذف الفاتورة سيعيد كميات البيع إلى المخزون. هل تريد المتابعة؟",
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await apiFetch(`/api/invoices/${invoice._id}`, { method: "DELETE" });
      router.push("/invoices");
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  if (isLoading) {
    return (
      <div className="card">
        <Loading />
      </div>
    );
  }

  if (!invoice) {
    return (
      <>
        <PageHeader title="الفاتورة" />
        <Alert message={(error as Error | undefined)?.message ?? "الفاتورة غير موجودة"} />
        <Link href="/invoices" className="btn-ghost mt-4 inline-flex">
          <ArrowRight size={16} />
          العودة للفواتير
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={`${invoice.customerName} · ${formatDate(invoice.date)}`}
        actions={
          <div className="print:hidden flex flex-wrap gap-2">
            <Link href="/invoices" className="btn-ghost">
              <ArrowRight size={16} />
              رجوع
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              طباعة
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={deleteInvoice}
            >
              <Trash2 size={16} />
              حذف
            </button>
          </div>
        }
      />

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      <div className="card overflow-hidden print:border-0 print:shadow-none">
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">العميل</p>
            <p className="font-bold text-slate-900">{invoice.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">التاريخ</p>
            <p className="font-bold text-slate-900">
              {formatDate(invoice.date)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">الحالة</p>
            <p className="font-bold text-slate-900">
              {INVOICE_STATUS_LABELS[invoice.status]}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">الصنف</th>
                <th className="px-4 py-3 font-semibold">الوحدة</th>
                <th className="px-4 py-3 font-semibold">الكمية</th>
                <th className="px-4 py-3 font-semibold">السعر</th>
                <th className="px-4 py-3 font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((item, index) => (
                <tr key={`${item.product}-${index}`}>
                  <td className="px-4 py-3 font-medium">{item.productName}</td>
                  <td className="px-4 py-3">{item.unit}</td>
                  <td className="px-4 py-3">{formatNumber(item.quantity)}</td>
                  <td className="px-4 py-3">{formatMoney(item.salePrice)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {formatMoney(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-2">
          <div className="print:hidden space-y-2">
            <label className="field-label" htmlFor="paid-amount">
              تحديث المدفوع
            </label>
            <div className="flex gap-2">
              <input
                id="paid-amount"
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={amountPaid ?? String(invoice.amountPaid)}
                onChange={(event) => setAmountPaid(event.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={savePayment}
                disabled={saving}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                حفظ
              </button>
            </div>
            {invoice.note ? (
              <p className="text-sm text-slate-500">ملاحظة: {invoice.note}</p>
            ) : null}
          </div>

          <dl className="space-y-2 text-sm sm:text-left">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">المجموع</dt>
              <dd className="font-semibold">{formatMoney(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">الخصم</dt>
              <dd className="font-semibold">{formatMoney(invoice.discount)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-base">
              <dt className="font-bold text-slate-900">الصافي</dt>
              <dd className="font-bold text-brand-600">
                {formatMoney(invoice.total)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">المدفوع</dt>
              <dd className="font-semibold">
                {formatMoney(invoice.amountPaid)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">المتبقي</dt>
              <dd className="font-semibold">
                {formatMoney(
                  Math.max(0, invoice.total - invoice.amountPaid),
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );
}
