"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Coins, HandCoins, Undo2, Wallet } from "lucide-react";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import type { PartyKind } from "@/lib/constants";
import {
  describeBalance,
  formatDate,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import type { AccountRow } from "@/lib/types";

const TABS: { value: PartyKind; label: string }[] = [
  { value: "customer", label: "حسابات العملاء" },
  { value: "supplier", label: "حسابات الموردين" },
];

export default function AccountsPage() {
  const [kind, setKind] = useState<PartyKind>("customer");
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams({ kind });
    if (search.trim()) params.set("search", search.trim());
    return `/api/accounts?${params.toString()}`;
  }, [kind, search]);

  const { data, error, isLoading } = useSWR<{ accounts: AccountRow[] }>(
    query,
    apiFetch,
  );
  const all = useMemo(() => data?.accounts ?? [], [data?.accounts]);
  const accounts = onlyOpen
    ? all.filter((row) => Math.abs(row.balance) >= 0.005)
    : all;

  const totals = all.reduce(
    (sum, row) => ({
      invoiced: sum.invoiced + row.invoiced,
      paid: sum.paid + row.paid,
      returned: sum.returned + row.returned,
      outstanding: sum.outstanding + Math.max(0, row.balance),
      credit: sum.credit + Math.max(0, -row.balance),
    }),
    { invoiced: 0, paid: 0, returned: 0, outstanding: 0, credit: 0 },
  );

  const isCustomer = kind === "customer";

  return (
    <>
      <PageHeader
        title="الحسابات"
        subtitle="كشف حساب كل عميل ومورد: الفواتير، السداد، المرتجعات، والمتبقي"
      />

      {error ? <Alert message={(error as Error).message} /> : null}

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setKind(tab.value)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              kind === tab.value
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isCustomer ? "إجمالي فواتير البيع" : "إجمالي فواتير الشراء"}
          value={formatMoney(totals.invoiced)}
          icon={<Coins size={20} />}
        />
        <StatCard
          label={isCustomer ? "المحصّل" : "المسدَّد للموردين"}
          value={formatMoney(totals.paid)}
          icon={<HandCoins size={20} />}
          tone="success"
        />
        <StatCard
          label="قيمة المرتجعات"
          value={formatMoney(totals.returned)}
          icon={<Undo2 size={20} />}
          tone="warning"
        />
        <StatCard
          label={isCustomer ? "مستحق على العملاء" : "مستحق للموردين"}
          value={formatMoney(totals.outstanding)}
          hint={
            totals.credit > 0
              ? isCustomer
                ? `أرصدة دائنة للعملاء ${formatMoney(totals.credit)}`
                : `لنا عند الموردين ${formatMoney(totals.credit)}`
              : undefined
          }
          icon={<Wallet size={20} />}
          tone="danger"
        />
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor="accounts-search">
            بحث
          </label>
          <input
            id="accounts-search"
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isCustomer ? "اسم العميل" : "اسم المورد"}
          />
        </div>
        <label className="flex items-center gap-2 pb-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          الحسابات المفتوحة فقط
        </label>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : accounts.length === 0 ? (
          <EmptyState
            message={
              onlyOpen && all.length > 0
                ? "كل الحسابات مسددة"
                : "لا توجد حسابات بعد — تُنشأ تلقائياً مع أول فاتورة"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-right text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {isCustomer ? "العميل" : "المورد"}
                  </th>
                  <th className="px-4 py-3 font-semibold">الفواتير</th>
                  <th className="px-4 py-3 font-semibold">الإجمالي</th>
                  <th className="px-4 py-3 font-semibold">
                    {isCustomer ? "المحصّل" : "المسدَّد"}
                  </th>
                  <th className="px-4 py-3 font-semibold">المرتجع</th>
                  <th className="px-4 py-3 font-semibold">الرصيد</th>
                  <th className="px-4 py-3 font-semibold">آخر حركة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((row) => {
                  const balance = describeBalance(kind, row.balance);
                  return (
                    <tr key={row.party._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-brand-600">
                        <Link href={`/accounts/${row.party._id}`}>
                          {row.party.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatNumber(row.invoiceCount)}</td>
                      <td className="px-4 py-3">{formatMoney(row.invoiced)}</td>
                      <td className="px-4 py-3">{formatMoney(row.paid)}</td>
                      <td className="px-4 py-3">{formatMoney(row.returned)}</td>
                      <td className={`px-4 py-3 font-bold ${balance.tone}`}>
                        {balance.text}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(row.lastActivity)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
