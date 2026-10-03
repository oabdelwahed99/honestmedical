"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Eye, Plus } from "lucide-react";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
} from "@/components/ui";
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
  toMonthInputValue,
} from "@/lib/format";
import type { ReturnNote } from "@/lib/types";

const SETTLEMENT_STYLE = {
  credit: "bg-teal-50 text-teal-700",
  refund: "bg-orange-50 text-orange-700",
  exchange: "bg-violet-50 text-violet-700",
} as const;

export default function ReturnsPage() {
  const [direction, setDirection] = useState<PartyKind>("customer");
  const [month, setMonth] = useState(toMonthInputValue());
  const [search, setSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ direction });
    if (search.trim()) params.set("search", search.trim());
    else params.set("month", month);
    return `/api/returns?${params.toString()}`;
  }, [direction, month, search]);

  const { data, error, isLoading } = useSWR<{ returns: ReturnNote[] }>(
    query,
    apiFetch,
  );
  const notes = data?.returns ?? [];
  const total = notes.reduce((sum, note) => sum + note.moneyEffect, 0);
  const isCustomer = direction === "customer";

  return (
    <>
      <PageHeader
        title="اذون الارتجاع"
        subtitle="مرتجعات العملاء والموردين مربوطة بفواتيرها، مع أثرها على المخزون والحسابات"
        actions={
          <Link
            href={`/returns/new?direction=${direction}`}
            className="btn-primary"
          >
            <Plus size={18} />
            اذن ارتجاع جديد
          </Link>
        }
      />

      {error ? <Alert message={(error as Error).message} /> : null}

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["customer", "supplier"] as PartyKind[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              direction === value
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {RETURN_DIRECTION_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="returns-month">
            الشهر
          </label>
          <input
            id="returns-month"
            type="month"
            className="field-input"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            disabled={Boolean(search.trim())}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="returns-search">
            بحث
          </label>
          <input
            id="returns-search"
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              isCustomer
                ? "رقم الاذن أو الفاتورة أو البيان أو العميل"
                : "رقم الاذن أو الفاتورة أو المورد"
            }
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : notes.length === 0 ? (
          <EmptyState message="لا توجد اذون ارتجاع" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">رقم الاذن</th>
                    <th className="px-4 py-3 font-semibold">التاريخ</th>
                    <th className="px-4 py-3 font-semibold">الفاتورة</th>
                    {isCustomer ? (
                      <th className="px-4 py-3 font-semibold">رقم البيان</th>
                    ) : null}
                    <th className="px-4 py-3 font-semibold">
                      {isCustomer ? "العميل" : "المورد"}
                    </th>
                    <th className="px-4 py-3 font-semibold">التسوية</th>
                    <th className="px-4 py-3 font-semibold">الأصناف</th>
                    <th className="px-4 py-3 font-semibold">قيمة البضاعة</th>
                    <th className="px-4 py-3 font-semibold">أثر الحساب</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notes.map((note) => (
                    <tr key={note._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-brand-600">
                        <Link href={`/returns/${note._id}`}>{note.number}</Link>
                      </td>
                      <td className="px-4 py-3">{formatDate(note.date)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${note.invoice}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {note.invoiceNumber}
                        </Link>
                      </td>
                      {isCustomer ? (
                        <td className="px-4 py-3">{note.statementNumber || "—"}</td>
                      ) : null}
                      <td className="px-4 py-3">
                        <Link
                          href={`/accounts/${note.party}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {note.partyName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${SETTLEMENT_STYLE[note.settlement]}`}>
                          {RETURN_SETTLEMENT_LABELS[note.settlement]}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatNumber(note.items.length)}</td>
                      <td className="px-4 py-3">{formatMoney(note.goodsValue)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(note.moneyEffect)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/returns/${note._id}`}
                          className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                          aria-label="عرض"
                        >
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-500">
                {formatNumber(notes.length)} اذن
              </span>
              <span className="font-bold">
                إجمالي أثر الحساب: {formatMoney(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
