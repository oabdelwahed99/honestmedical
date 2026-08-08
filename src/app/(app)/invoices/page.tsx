"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Eye, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { InvoiceForm } from "@/components/invoice-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@/lib/constants";
import {
  formatDate,
  formatMoney,
  formatNumber,
  toMonthInputValue,
} from "@/lib/format";
import type { Invoice } from "@/lib/types";

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid: "bg-rose-50 text-rose-700",
};

export default function InvoicesPage() {
  const router = useRouter();
  const [month, setMonth] = useState(toMonthInputValue());
  const [status, setStatus] = useState<"" | InvoiceStatus>("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ month });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    return `/api/invoices?${params.toString()}`;
  }, [month, status, search]);

  const { data, error, isLoading, mutate } = useSWR<{ invoices: Invoice[] }>(
    query,
    apiFetch,
  );
  const invoices = data?.invoices ?? [];
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  async function deleteInvoice(id: string) {
    if (
      !confirm(
        "حذف الفاتورة سيعيد كميات البيع إلى المخزون. هل تريد المتابعة؟",
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await apiFetch(`/api/invoices/${id}`, { method: "DELETE" });
      await mutate();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="الفواتير"
        subtitle="فواتير البيع التي تخصم من المخزون وتدخل في حساب الأرباح"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            <Plus size={18} />
            فاتورة جديدة
          </button>
        }
      />

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="invoice-month">
            الشهر
          </label>
          <input
            id="invoice-month"
            type="month"
            className="field-input"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="invoice-status">
            الحالة
          </label>
          <select
            id="invoice-status"
            className="field-input"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "" | InvoiceStatus)
            }
          >
            <option value="">الكل</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (key) => (
                <option key={key} value={key}>
                  {INVOICE_STATUS_LABELS[key]}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="invoice-search">
            بحث
          </label>
          <input
            id="invoice-search"
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="رقم الفاتورة أو العميل"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <EmptyState message="لا توجد فواتير في هذا الشهر" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">الرقم</th>
                    <th className="px-4 py-3 font-semibold">التاريخ</th>
                    <th className="px-4 py-3 font-semibold">العميل</th>
                    <th className="px-4 py-3 font-semibold">الأصناف</th>
                    <th className="px-4 py-3 font-semibold">الإجمالي</th>
                    <th className="px-4 py-3 font-semibold">المدفوع</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-brand-600">
                        <Link href={`/invoices/${invoice._id}`}>
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatDate(invoice.date)}</td>
                      <td className="px-4 py-3">{invoice.customerName}</td>
                      <td className="px-4 py-3">
                        {formatNumber(invoice.items.length)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(invoice.total)}
                      </td>
                      <td className="px-4 py-3">
                        {formatMoney(invoice.amountPaid)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${STATUS_STYLE[invoice.status]}`}
                        >
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            href={`/invoices/${invoice._id}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            aria-label="عرض"
                          >
                            <Eye size={16} />
                          </Link>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                            onClick={() => deleteInvoice(invoice._id)}
                            aria-label="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">
                {formatNumber(invoices.length)} فاتورة
              </span>
              <span className="font-bold">{formatMoney(total)}</span>
            </footer>
          </>
        )}
      </div>

      <Modal
        open={open}
        title="فاتورة بيع جديدة"
        onClose={() => setOpen(false)}
      >
        <InvoiceForm
          onCancel={() => setOpen(false)}
          onSaved={async (invoiceId) => {
            setOpen(false);
            await mutate();
            router.push(`/invoices/${invoiceId}`);
          }}
        />
      </Modal>
    </>
  );
}
