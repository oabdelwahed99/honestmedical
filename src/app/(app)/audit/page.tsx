"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronLeft } from "lucide-react";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
} from "@/components/ui";
import { roleLabel, type UserRole } from "@/lib/auth-types";
import { apiFetch } from "@/lib/client";
import {
  INVOICE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@/lib/constants";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import type { AuditAction, AuditChange, InvoiceAuditEntry } from "@/lib/types";

type AuditUser = {
  id: string;
  displayName: string;
  username: string;
  role: UserRole;
};

const ACTION_LABELS: Record<AuditAction, string> = {
  update: "تعديل",
  delete: "حذف",
};

const ACTION_STYLE: Record<AuditAction, string> = {
  update: "bg-amber-50 text-amber-700",
  delete: "bg-rose-50 text-rose-700",
};

const FIELD_LABELS: Record<string, string> = {
  customerName: "العميل / المورد",
  statementNumber: "رقم البيان",
  date: "تاريخ الفاتورة",
  note: "ملاحظة",
  amountPaid: "المبلغ المدفوع",
  returnedTotal: "قيمة المرتجع",
  status: "الحالة",
};

function formatChangeValue(field: string, value: AuditChange["before"]) {
  if (value === null || value === "") return "—";
  if (field === "date") return formatDate(String(value));
  if (field === "amountPaid" || field === "returnedTotal") {
    return formatMoney(Number(value));
  }
  if (field === "status") {
    return INVOICE_STATUS_LABELS[value as InvoiceStatus] ?? String(value);
  }
  return String(value);
}

export default function AuditPage() {
  const [action, setAction] = useState<"" | AuditAction>("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (userId) params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [action, userId, from, to, search]);

  const { data, error, isLoading } = useSWR<{
    entries: InvoiceAuditEntry[];
    users: AuditUser[];
  }>(`/api/audit${query ? `?${query}` : ""}`, apiFetch);

  const entries = data?.entries ?? [];
  const users = data?.users ?? [];

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="سجل التعديلات"
        subtitle="كل عمليات تعديل وحذف الفواتير — من قام بها ومتى وما الذي تغيّر"
      />

      {error ? <Alert message={(error as Error).message} /> : null}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="field-label" htmlFor="audit-action">
            نوع العملية
          </label>
          <select
            id="audit-action"
            className="field-input"
            value={action}
            onChange={(event) =>
              setAction(event.target.value as "" | AuditAction)
            }
          >
            <option value="">الكل</option>
            {(Object.keys(ACTION_LABELS) as AuditAction[]).map((key) => (
              <option key={key} value={key}>
                {ACTION_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="audit-user">
            المستخدم
          </label>
          <select
            id="audit-user"
            className="field-input"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">الكل</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.username} ({roleLabel(user.role)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="audit-from">
            من تاريخ
          </label>
          <input
            id="audit-from"
            type="date"
            className="field-input"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="audit-to">
            إلى تاريخ
          </label>
          <input
            id="audit-to"
            type="date"
            className="field-input"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="audit-search">
            بحث
          </label>
          <input
            id="audit-search"
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
        ) : entries.length === 0 ? (
          <EmptyState message="لا توجد عمليات تعديل أو حذف مسجلة" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3" />
                    <th className="px-4 py-3 font-semibold">الوقت</th>
                    <th className="px-4 py-3 font-semibold">المستخدم</th>
                    <th className="px-4 py-3 font-semibold">العملية</th>
                    <th className="px-4 py-3 font-semibold">الفاتورة</th>
                    <th className="px-4 py-3 font-semibold">العميل / المورد</th>
                    <th className="px-4 py-3 font-semibold">ملخص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const isOpen = expanded.has(entry._id);
                    return (
                      <Fragment key={entry._id}>
                        <tr
                          className="cursor-pointer hover:bg-slate-50/70"
                          onClick={() => toggle(entry._id)}
                        >
                          <td className="px-4 py-3 text-slate-400">
                            {isOpen ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronLeft size={16} />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDateTime(entry.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {entry.user.displayName || entry.user.username}
                            </p>
                            <p className="text-xs text-slate-500">
                              {roleLabel(entry.user.role)}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`badge ${ACTION_STYLE[entry.action]}`}
                            >
                              {ACTION_LABELS[entry.action]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {entry.action === "update" ? (
                              <Link
                                href={`/invoices/${entry.invoice}`}
                                className="font-semibold text-brand-600"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {entry.invoiceNumber}
                              </Link>
                            ) : (
                              <span className="font-semibold text-slate-500 line-through">
                                {entry.invoiceNumber}
                              </span>
                            )}
                            <p className="text-xs text-slate-500">
                              {INVOICE_KIND_LABELS[entry.invoiceKind] ?? ""}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {entry.customerName || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {entry.action === "update"
                              ? entry.changes
                                  .map((change) => FIELD_LABELS[change.field] ?? change.field)
                                  .join("، ")
                              : entry.snapshot
                                ? `إجمالي ${formatMoney(entry.snapshot.total)}`
                                : "—"}
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-4">
                              {entry.action === "update" ? (
                                <ChangeList changes={entry.changes} />
                              ) : (
                                <DeletedSnapshot entry={entry} />
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {formatNumber(entries.length)} عملية
            </footer>
          </>
        )}
      </div>
    </>
  );
}

function ChangeList({ changes }: { changes: AuditChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-slate-500">لا توجد تفاصيل</p>;
  }

  return (
    <table className="w-full text-right text-sm">
      <thead className="text-xs text-slate-500">
        <tr>
          <th className="py-2 font-semibold">الحقل</th>
          <th className="py-2 font-semibold">القيمة السابقة</th>
          <th className="py-2 font-semibold">القيمة الجديدة</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {changes.map((change) => (
          <tr key={change.field}>
            <td className="py-2 font-semibold text-slate-700">
              {FIELD_LABELS[change.field] ?? change.field}
            </td>
            <td className="py-2 text-rose-700">
              {formatChangeValue(change.field, change.before)}
            </td>
            <td className="py-2 text-emerald-700">
              {formatChangeValue(change.field, change.after)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeletedSnapshot({ entry }: { entry: InvoiceAuditEntry }) {
  const invoice = entry.snapshot;
  if (!invoice) {
    return <p className="text-sm text-slate-500">لا توجد بيانات محفوظة</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span className="text-slate-500">تاريخ الفاتورة: </span>
          {formatDate(invoice.date)}
        </p>
        <p>
          <span className="text-slate-500">الإجمالي: </span>
          <span className="font-semibold">{formatMoney(invoice.total)}</span>
        </p>
        <p>
          <span className="text-slate-500">المدفوع: </span>
          {formatMoney(invoice.amountPaid)}
        </p>
        <p>
          <span className="text-slate-500">الحالة: </span>
          {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
        </p>
        {invoice.repName ? (
          <p>
            <span className="text-slate-500">المندوب: </span>
            {invoice.repName}
          </p>
        ) : null}
        {invoice.discount > 0 ? (
          <p>
            <span className="text-slate-500">الخصم: </span>
            {formatMoney(invoice.discount)}
          </p>
        ) : null}
        {(invoice.tax ?? 0) > 0 ? (
          <p>
            <span className="text-slate-500">الضريبة: </span>
            {formatMoney(invoice.tax)}
          </p>
        ) : null}
        {invoice.note ? (
          <p className="sm:col-span-2">
            <span className="text-slate-500">ملاحظة: </span>
            {invoice.note}
          </p>
        ) : null}
      </div>

      <table className="w-full text-right text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-2 font-semibold">الصنف</th>
            <th className="py-2 font-semibold">الكمية</th>
            <th className="py-2 font-semibold">السعر</th>
            <th className="py-2 font-semibold">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {invoice.items.map((item, index) => (
            <tr key={`${item.product}-${index}`}>
              <td className="py-2">{item.productName}</td>
              <td className="py-2">{formatNumber(item.quantity)}</td>
              <td className="py-2">
                {formatMoney(
                  invoice.kind === "purchase"
                    ? item.purchasePrice
                    : item.salePrice,
                )}
              </td>
              <td className="py-2 font-semibold">{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
