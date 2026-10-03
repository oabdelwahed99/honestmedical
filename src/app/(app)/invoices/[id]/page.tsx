"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  HandCoins,
  Loader2,
  Printer,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  Alert,
  Loading,
  PageHeader,
} from "@/components/ui";
import { InvoicePrint } from "@/components/invoice-print";
import { Modal } from "@/components/modal";
import { PaymentForm } from "@/components/payment-form";
import { apiFetch } from "@/lib/client";
import {
  INVOICE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_DIRECTION_LABELS,
  RETURN_SETTLEMENT_LABELS,
  partyKindForInvoice,
} from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Invoice, OpenInvoice, Payment, ReturnNote } from "@/lib/types";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [statementNumber, setStatementNumber] = useState<string | null>(null);
  const [savingStatement, setSavingStatement] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{
    invoice: Invoice;
    payments: Payment[];
    returns: ReturnNote[];
  }>(params.id ? `/api/invoices/${params.id}` : null, apiFetch);
  const invoice = data?.invoice ?? null;
  const payments = data?.payments ?? [];
  const returns = data?.returns ?? [];
  const kind = invoice?.kind ?? "sale";
  const isPurchase = kind === "purchase";

  async function saveStatementNumber() {
    if (!invoice || statementNumber === null) return;
    if (!statementNumber.trim()) {
      setActionError("أدخل رقم البيان");
      return;
    }
    setSavingStatement(true);
    setActionError("");
    try {
      await apiFetch(`/api/invoices/${invoice._id}`, {
        method: "PATCH",
        body: JSON.stringify({ statementNumber }),
      });
      setStatementNumber(null);
      await mutate();
    } catch (saveError) {
      setActionError((saveError as Error).message);
    } finally {
      setSavingStatement(false);
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    if (
      !confirm(
        isPurchase
          ? "حذف فاتورة الشراء سينقص الكميات الواردة من المخزون. هل تريد المتابعة؟"
          : "حذف الفاتورة سيعيد كميات البيع إلى المخزون. هل تريد المتابعة؟",
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

  const discountLabel =
    invoice.discountType === "percent" && invoice.discountValue > 0
      ? `الخصم (${invoice.discountValue}%)`
      : "الخصم";
  const taxLabel =
    invoice.taxType === "percent" && invoice.taxValue > 0
      ? `الضريبة (${invoice.taxValue}%)`
      : "الضريبة";
  const remaining = Math.max(
    0,
    invoice.total - invoice.returnedTotal - invoice.amountPaid,
  );
  const openInvoice: OpenInvoice[] =
    remaining > 0.005
      ? [
          {
            _id: invoice._id,
            number: invoice.number,
            statementNumber: invoice.statementNumber,
            date: invoice.date,
            total: invoice.total,
            returnedTotal: invoice.returnedTotal,
            amountPaid: invoice.amountPaid,
            remaining,
          },
        ]
      : [];
  const returnHref = `/returns/new?${new URLSearchParams({
    direction: isPurchase ? "supplier" : "customer",
    invoice: invoice.number,
    ...(isPurchase ? {} : { statement: invoice.statementNumber }),
  }).toString()}`;

  return (
    <>
      <InvoicePrint invoice={invoice} />

      <div className="print:hidden">
        <PageHeader
          title={invoice.number}
          subtitle={`${INVOICE_KIND_LABELS[kind]} · ${invoice.customerName} · ${formatDate(invoice.date)}`}
          actions={
            <div className="flex flex-wrap gap-2">
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
              {invoice.party ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPaying(true)}
                >
                  <HandCoins size={16} />
                  {isPurchase ? "سداد للمورد" : "تحصيل دفعة"}
                </button>
              ) : null}
              <Link href={returnHref} className="btn-ghost">
                <Undo2 size={16} />
                اذن ارتجاع
              </Link>
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

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-900">Honest Medical</p>
                <p className="text-sm text-slate-500">
                  {INVOICE_KIND_LABELS[kind]}
                </p>
              </div>
              <div className="text-left">
                <p className="text-xs text-slate-500">رقم الفاتورة</p>
                <p className="text-xl font-bold text-brand-700">
                  {invoice.number}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">
                  {isPurchase ? "المورد" : "العميل"}
                </p>
                {invoice.party ? (
                  <Link
                    href={`/accounts/${invoice.party}`}
                    className="font-bold text-brand-600 hover:underline"
                  >
                    {invoice.customerName}
                  </Link>
                ) : (
                  <p className="font-bold text-slate-900">{invoice.customerName}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">التاريخ</p>
                <p className="font-bold text-slate-900">
                  {formatDate(invoice.date)}
                </p>
              </div>
              {!isPurchase ? (
                <div>
                  <p className="text-xs text-slate-500">رقم البيان</p>
                  <p className="font-bold text-slate-900">
                    {invoice.statementNumber || "—"}
                  </p>
                </div>
              ) : null}
              {!isPurchase ? (
                <div>
                  <p className="text-xs text-slate-500">المندوب</p>
                  <p className="font-bold text-slate-900">
                    {invoice.repName || "—"}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-slate-500">الحالة</p>
                <p className="font-bold text-slate-900">
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">الصنف</th>
                  <th className="px-4 py-3 font-semibold">الوحدة</th>
                  <th className="px-4 py-3 font-semibold">الكمية</th>
                  <th className="px-4 py-3 font-semibold">
                    {isPurchase ? "سعر الشراء" : "السعر"}
                  </th>
                  {isPurchase ? (
                    <th className="px-4 py-3 font-semibold">الصلاحية</th>
                  ) : null}
                  <th className="px-4 py-3 font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item, index) => (
                  <tr key={`${item.product}-${index}`}>
                    <td className="px-4 py-3 font-medium">{item.productName}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3">{formatNumber(item.quantity)}</td>
                    <td className="px-4 py-3">
                      {formatMoney(
                        isPurchase ? item.purchasePrice : item.salePrice,
                      )}
                    </td>
                    {isPurchase ? (
                      <td className="px-4 py-3">
                        {formatDate(item.expiryDate)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 font-semibold">
                      {formatMoney(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-2">
            <div className="space-y-2">
              {!isPurchase ? (
                <>
                  <label className="field-label" htmlFor="statement-number">
                    رقم البيان
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="statement-number"
                      className="field-input"
                      value={statementNumber ?? invoice.statementNumber}
                      onChange={(event) => setStatementNumber(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={saveStatementNumber}
                      disabled={
                        savingStatement ||
                        statementNumber === null ||
                        returns.length > 0
                      }
                    >
                      {savingStatement ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : null}
                      حفظ
                    </button>
                  </div>
                </>
              ) : null}
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
                <dt className="text-slate-500">{discountLabel}</dt>
                <dd className="font-semibold">{formatMoney(invoice.discount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{taxLabel}</dt>
                <dd className="font-semibold">{formatMoney(invoice.tax)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-base">
                <dt className="font-bold text-slate-900">الصافي</dt>
                <dd className="font-bold text-brand-600">
                  {formatMoney(invoice.total)}
                </dd>
              </div>
              {invoice.returnedTotal !== 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">المرتجع</dt>
                  <dd className="font-semibold text-orange-700">
                    {formatMoney(invoice.returnedTotal)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">المدفوع</dt>
                <dd className="font-semibold">
                  {formatMoney(invoice.amountPaid)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">المتبقي</dt>
                <dd className="font-bold text-rose-700">
                  {formatMoney(remaining)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">سندات السداد</h2>
            </div>
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">لا توجد سندات على الفاتورة</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {payments.map((payment) => {
                  const share = payment.allocations
                    .filter((allocation) => allocation.invoice === invoice._id)
                    .reduce((sum, allocation) => sum + allocation.amount, 0);
                  return (
                    <li
                      key={payment._id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {payment.number}
                          <span className="mr-2 text-xs font-normal text-slate-400">
                            {PAYMENT_DIRECTION_LABELS[payment.direction]} ·{" "}
                            {formatDate(payment.date)}
                          </span>
                        </p>
                        {payment.note ? (
                          <p className="text-xs text-slate-500">{payment.note}</p>
                        ) : null}
                      </div>
                      <p className="font-bold text-emerald-700">{formatMoney(share)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">اذون الارتجاع</h2>
            </div>
            {returns.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">لا توجد مرتجعات على الفاتورة</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {returns.map((note) => (
                  <li
                    key={note._id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <Link
                        href={`/returns/${note._id}`}
                        className="font-semibold text-brand-600 hover:underline"
                      >
                        {note.number}
                      </Link>
                      <span className="mr-2 text-xs text-slate-400">
                        {RETURN_SETTLEMENT_LABELS[note.settlement]} ·{" "}
                        {formatDate(note.date)} ·{" "}
                        {formatNumber(
                          note.items.reduce((sum, item) => sum + item.quantity, 0),
                        )}{" "}
                        وحدة
                      </span>
                    </div>
                    <p className="font-bold text-orange-700">
                      {formatMoney(note.moneyEffect)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={paying}
        title={isPurchase ? "سند صرف للمورد" : "سند قبض من العميل"}
        onClose={() => setPaying(false)}
      >
        {paying && invoice.party ? (
          <PaymentForm
            partyId={invoice.party}
            partyKind={partyKindForInvoice(kind)}
            openInvoices={openInvoice}
            defaultInvoiceId={invoice._id}
            onSaved={async () => {
              setPaying(false);
              await mutate();
            }}
            onCancel={() => setPaying(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}
