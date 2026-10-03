"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  Coins,
  HandCoins,
  Plus,
  Printer,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { PaymentForm } from "@/components/payment-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { PARTY_KIND_LABELS } from "@/lib/constants";
import {
  describeBalance,
  formatDate,
  formatMoney,
} from "@/lib/format";
import type { AccountDetails, StatementEntry } from "@/lib/types";

const ENTRY_STYLE: Record<StatementEntry["kind"], string> = {
  invoice: "bg-brand-50 text-brand-700",
  payment: "bg-emerald-50 text-emerald-700",
  return: "bg-orange-50 text-orange-700",
};

const ENTRY_LABEL: Record<StatementEntry["kind"], string> = {
  invoice: "فاتورة",
  payment: "سند",
  return: "مرتجع",
};

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const [paymentFor, setPaymentFor] = useState<string | null | undefined>(
    undefined,
  );
  const [actionError, setActionError] = useState("");

  const { data, error, isLoading, mutate } = useSWR<AccountDetails>(
    params.id ? `/api/accounts/${params.id}` : null,
    apiFetch,
  );

  async function deletePayment(entry: StatementEntry) {
    if (
      !confirm(
        `حذف السند ${entry.number}؟ سيُعاد حساب المدفوع على الفواتير المرتبطة به.`,
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await apiFetch(`/api/payments/${entry.id}`, { method: "DELETE" });
      await mutate();
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

  if (!data) {
    return (
      <>
        <PageHeader title="الحساب" />
        <Alert message={(error as Error | undefined)?.message ?? "الحساب غير موجود"} />
        <Link href="/accounts" className="btn-ghost mt-4 inline-flex">
          <ArrowRight size={16} />
          العودة للحسابات
        </Link>
      </>
    );
  }

  const { party, totals, statement, openInvoices } = data;
  const kind = party.kind;
  const isCustomer = kind === "customer";
  const balance = describeBalance(kind, totals.balance);

  return (
    <>
      <PageHeader
        title={party.name}
        subtitle={`كشف حساب ${PARTY_KIND_LABELS[kind]}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href="/accounts" className="btn-ghost">
              <ArrowRight size={16} />
              رجوع
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              طباعة الكشف
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setPaymentFor(null)}
            >
              <Plus size={16} />
              {isCustomer ? "تحصيل دفعة" : "سداد دفعة"}
            </button>
          </div>
        }
      />

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`إجمالي الفواتير (${totals.invoiceCount})`}
          value={formatMoney(totals.invoiced)}
          icon={<Coins size={20} />}
        />
        <StatCard
          label={isCustomer ? "المحصّل" : "المسدَّد"}
          value={formatMoney(totals.paid)}
          icon={<HandCoins size={20} />}
          tone="success"
        />
        <StatCard
          label="المرتجعات"
          value={formatMoney(totals.returned)}
          icon={<Undo2 size={20} />}
          tone="warning"
        />
        <StatCard
          label="الرصيد"
          value={balance.text}
          icon={<Wallet size={20} />}
          tone={totals.balance > 0.005 ? "danger" : "success"}
        />
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">الفواتير المفتوحة</h2>
        </div>
        {openInvoices.length === 0 ? (
          <EmptyState message="لا توجد فواتير عليها متبقي" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">الفاتورة</th>
                  <th className="px-4 py-3 font-semibold">التاريخ</th>
                  <th className="px-4 py-3 font-semibold">الإجمالي</th>
                  <th className="px-4 py-3 font-semibold">المرتجع</th>
                  <th className="px-4 py-3 font-semibold">المدفوع</th>
                  <th className="px-4 py-3 font-semibold">المتبقي</th>
                  <th className="px-4 py-3 font-semibold print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openInvoices.map((invoice) => (
                  <tr key={invoice._id}>
                    <td className="px-4 py-3 font-semibold text-brand-600">
                      <Link href={`/invoices/${invoice._id}`}>{invoice.number}</Link>
                      {invoice.statementNumber ? (
                        <span className="block text-xs font-normal text-slate-400">
                          بيان {invoice.statementNumber}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{formatDate(invoice.date)}</td>
                    <td className="px-4 py-3">{formatMoney(invoice.total)}</td>
                    <td className="px-4 py-3">{formatMoney(invoice.returnedTotal)}</td>
                    <td className="px-4 py-3">{formatMoney(invoice.amountPaid)}</td>
                    <td className="px-4 py-3 font-bold text-rose-700">
                      {formatMoney(invoice.remaining)}
                    </td>
                    <td className="px-4 py-3 print:hidden">
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1 text-xs"
                        onClick={() => setPaymentFor(invoice._id)}
                      >
                        {isCustomer ? "تحصيل" : "سداد"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">كشف الحساب</h2>
        </div>
        {statement.length === 0 ? (
          <EmptyState message="لا توجد حركات على الحساب" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">التاريخ</th>
                  <th className="px-4 py-3 font-semibold">المستند</th>
                  <th className="px-4 py-3 font-semibold">البيان</th>
                  <th className="px-4 py-3 font-semibold">مدين</th>
                  <th className="px-4 py-3 font-semibold">دائن</th>
                  <th className="px-4 py-3 font-semibold">الرصيد</th>
                  <th className="px-4 py-3 font-semibold print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.map((entry) => {
                  const running = describeBalance(kind, entry.balance);
                  const href =
                    entry.kind === "invoice"
                      ? `/invoices/${entry.id}`
                      : entry.kind === "return"
                        ? `/returns/${entry.id}`
                        : null;
                  return (
                    <tr key={`${entry.kind}-${entry.id}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ml-2 ${ENTRY_STYLE[entry.kind]}`}>
                          {ENTRY_LABEL[entry.kind]}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            className="font-semibold text-brand-600 hover:underline"
                          >
                            {entry.number}
                          </Link>
                        ) : (
                          <span className="font-semibold">{entry.number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{entry.description}</td>
                      <td className="px-4 py-3">
                        {entry.debit ? formatMoney(entry.debit) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {entry.credit ? formatMoney(entry.credit) : "—"}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${running.tone}`}>
                        {running.text}
                      </td>
                      <td className="px-4 py-3 print:hidden">
                        {entry.kind === "payment" ? (
                          <button
                            type="button"
                            title="حذف السند"
                            aria-label="حذف السند"
                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                            onClick={() => deletePayment(entry)}
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={paymentFor !== undefined}
        title={isCustomer ? "سند قبض من العميل" : "سند صرف للمورد"}
        onClose={() => setPaymentFor(undefined)}
      >
        {paymentFor !== undefined ? (
          <PaymentForm
            partyId={party._id}
            partyKind={kind}
            openInvoices={openInvoices}
            defaultInvoiceId={paymentFor ?? undefined}
            onSaved={async () => {
              setPaymentFor(undefined);
              await mutate();
            }}
            onCancel={() => setPaymentFor(undefined)}
          />
        ) : null}
      </Modal>
    </>
  );
}
