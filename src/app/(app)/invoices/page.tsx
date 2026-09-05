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
  INVOICE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  type InvoiceKind,
  type InvoiceStatus,
} from "@/lib/constants";
import {
  formatDate,
  formatMoney,
  formatNumber,
  toMonthInputValue,
} from "@/lib/format";
import type { Invoice, SalesRep } from "@/lib/types";

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  unpaid: "bg-rose-50 text-rose-700",
};

export default function InvoicesPage() {
  const router = useRouter();
  const [kind, setKind] = useState<InvoiceKind>("sale");
  const [month, setMonth] = useState(toMonthInputValue());
  const [status, setStatus] = useState<"" | InvoiceStatus>("");
  const [repId, setRepId] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: repsData } = useSWR<{ reps: SalesRep[] }>(
    kind === "sale" ? "/api/reps?active=1" : null,
    apiFetch,
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({ kind });
    if (search.trim()) {
      params.set("search", search.trim());
    } else {
      params.set("month", month);
    }
    if (status) params.set("status", status);
    if (kind === "sale" && repId) params.set("repId", repId);
    return `/api/invoices?${params.toString()}`;
  }, [kind, month, status, search, repId]);

  const { data, error, isLoading, mutate } = useSWR<{ invoices: Invoice[] }>(
    query,
    apiFetch,
  );
  const invoices = data?.invoices ?? [];
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  async function deleteInvoice(id: string) {
    if (
      !confirm(
        kind === "purchase"
          ? "حذف فاتورة الشراء سينقص الكميات الواردة من المخزون. هل تريد المتابعة؟"
          : "حذف الفاتورة سيعيد كميات البيع إلى المخزون. هل تريد المتابعة؟",
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

  function closeModal() {
    setOpen(false);
    setFormDirty(false);
  }

  return (
    <>
      <PageHeader
        title="الفواتير"
        subtitle="فواتير البيع والشراء — البيع يخصم من المخزون والشراء يزيده"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            <Plus size={18} />
            {kind === "purchase" ? "فاتورة شراء جديدة" : "فاتورة بيع جديدة"}
          </button>
        }
      />

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {(Object.keys(INVOICE_KIND_LABELS) as InvoiceKind[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setKind(value);
              setRepId("");
            }}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              kind === value
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {INVOICE_KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
            disabled={Boolean(search.trim())}
          />
          {search.trim() ? (
            <p className="mt-1 text-xs text-slate-400">
              البحث يشمل كل الفترات
            </p>
          ) : null}
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
        {kind === "sale" ? (
          <div>
            <label className="field-label" htmlFor="invoice-rep-filter">
              المندوب
            </label>
            <select
              id="invoice-rep-filter"
              className="field-input"
              value={repId}
              onChange={(event) => setRepId(event.target.value)}
            >
              <option value="">الكل</option>
              {(repsData?.reps ?? []).map((rep) => (
                <option key={rep._id} value={rep._id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="field-label" htmlFor="invoice-search">
            بحث
          </label>
          <input
            id="invoice-search"
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="رقم الفاتورة أو الطرف"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <EmptyState
            message={
              search.trim()
                ? "لا توجد فواتير مطابقة للبحث"
                : "لا توجد فواتير في هذا الشهر"
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">الرقم</th>
                    <th className="px-4 py-3 font-semibold">التاريخ</th>
                    <th className="px-4 py-3 font-semibold">
                      {kind === "purchase" ? "المورد" : "العميل"}
                    </th>
                    {kind === "sale" ? (
                      <th className="px-4 py-3 font-semibold">المندوب</th>
                    ) : null}
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
                      {kind === "sale" ? (
                        <td className="px-4 py-3">
                          {invoice.repName || "—"}
                        </td>
                      ) : null}
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
        title={
          kind === "purchase" ? "فاتورة شراء جديدة" : "فاتورة بيع جديدة"
        }
        onClose={closeModal}
        confirmCloseMessage={
          formDirty
            ? "يوجد بيانات غير محفوظة في المسودة. هل تريد الإغلاق؟ (المسودة محفوظة محلياً)"
            : null
        }
      >
        <InvoiceForm
          key={kind}
          kind={kind}
          onDirtyChange={setFormDirty}
          onCancel={closeModal}
          onSaved={async (invoiceId) => {
            closeModal();
            await mutate();
            router.push(`/invoices/${invoiceId}`);
          }}
        />
      </Modal>
    </>
  );
}
