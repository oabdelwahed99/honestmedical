"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Banknote,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { canAccessPartners } from "@/lib/auth-types";
import { apiFetch } from "@/lib/client";
import {
  EXPENSE_BEHAVIOR_LABELS,
} from "@/lib/constants";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  toMonthInputValue,
} from "@/lib/format";
import type { AccountingSummary } from "@/lib/types";

const INSIGHT_TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
} as const;

const INSIGHT_ICONS = {
  info: Info,
  success: TrendingUp,
  warning: AlertTriangle,
  danger: TrendingDown,
} as const;

function deltaText(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "ثابت مقارنة بالفترة السابقة" : "لا مقارنة متاحة";
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const arrow = delta >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(delta).toFixed(1)}% عن الفترة السابقة`;
}

export default function AccountingPage() {
  const user = useAuth();
  const [month, setMonth] = useState(toMonthInputValue());

  const { data, error, isLoading } = useSWR<{ summary: AccountingSummary }>(
    `/api/accounting/summary?month=${month}`,
    apiFetch,
  );
  const summary = data?.summary ?? null;
  const showPartners = canAccessPartners(user.role);

  return (
    <>
      <PageHeader
        title="التقارير المالية"
        subtitle="إجمالي وصافي الربح، نقطة التعادل، ورؤى شهرية"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/expenses" className="btn-ghost">
              المصروفات
            </Link>
            <Link href="/invoices" className="btn-ghost">
              الفواتير
            </Link>
            {showPartners ? (
              <Link href="/partners" className="btn-primary">
                توزيع الأرباح
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="card mb-4 max-w-xs p-4">
        <label className="field-label" htmlFor="accounting-month">
          الشهر
        </label>
        <input
          id="accounting-month"
          type="month"
          className="field-input"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </div>

      {error ? <Alert message={(error as Error).message} /> : null}

      {isLoading || !summary ? (
        error ? null : (
          <div className="card">
            <Loading />
          </div>
        )
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            تقرير {summary.period.label} مقارنة بـ {summary.period.previousLabel}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="الإيرادات"
              value={formatMoney(summary.revenue)}
              hint={deltaText(summary.revenue, summary.previous.revenue)}
              icon={<Banknote size={20} />}
              tone="success"
            />
            <StatCard
              label="تكلفة البضاعة (COGS)"
              value={formatMoney(summary.cogs)}
              hint={`مبيعات ${formatMoney(summary.salesTotal)} · مرتجعات ${formatMoney(summary.returnsTotal)}`}
              icon={<Wallet size={20} />}
            />
            <StatCard
              label="مجمل الربح"
              value={formatMoney(summary.grossProfit)}
              hint={`الهامش ${formatPercent(summary.grossMargin)} · ${deltaText(summary.grossProfit, summary.previous.grossProfit)}`}
              icon={<TrendingUp size={20} />}
              tone={summary.grossProfit >= 0 ? "success" : "danger"}
            />
            <StatCard
              label="المصروفات التشغيلية"
              value={formatMoney(summary.operatingExpenses)}
              hint={`مصروفات ${formatMoney(summary.expensesTotal)} · هالك ${formatMoney(summary.writeOffs)}`}
              icon={<TrendingDown size={20} />}
              tone="warning"
            />
            <StatCard
              label="صافي الربح"
              value={formatMoney(summary.netProfit)}
              hint={`الهامش ${formatPercent(summary.netMargin)} · ${deltaText(summary.netProfit, summary.previous.netProfit)}`}
              icon={<Lightbulb size={20} />}
              tone={summary.netProfit >= 0 ? "success" : "danger"}
            />
            <StatCard
              label="خصومات الفواتير"
              value={formatMoney(summary.invoiceDiscounts)}
              hint={`${formatNumber(summary.period.days)} يوم في الفترة`}
              icon={<Info size={20} />}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">
                نقطة التعادل
              </h2>
              {!summary.breakeven ? (
                <EmptyState
                  message={
                    summary.breakevenUnavailableReason ??
                    "تعذر حساب نقطة التعادل"
                  }
                />
              ) : (
                <>
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-500">التقدم نحو التعادل</span>
                      <span className="font-semibold">
                        {formatNumber(
                          Number(summary.breakeven.progressPercent.toFixed(1)),
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          summary.breakeven.reached
                            ? "bg-emerald-500"
                            : "bg-brand-500"
                        }`}
                        style={{
                          width: `${Math.min(100, summary.breakeven.progressPercent)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">إيرادات التعادل</dt>
                      <dd className="text-lg font-bold text-slate-900">
                        {formatMoney(summary.breakeven.breakevenRevenue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">الهدف اليومي</dt>
                      <dd className="text-lg font-bold text-slate-900">
                        {formatMoney(summary.breakeven.dailyTarget)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">التكاليف الثابتة</dt>
                      <dd className="font-semibold">
                        {formatMoney(summary.breakeven.fixedCosts)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">التكاليف المتغيرة</dt>
                      <dd className="font-semibold">
                        {formatMoney(summary.breakeven.variableCosts)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">هامش المساهمة</dt>
                      <dd className="font-semibold">
                        {formatPercent(
                          summary.breakeven.contributionMarginRatio,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">هامش الأمان</dt>
                      <dd
                        className={`font-semibold ${
                          summary.breakeven.marginOfSafety >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatMoney(summary.breakeven.marginOfSafety)} (
                        {formatNumber(
                          Number(
                            summary.breakeven.marginOfSafetyPercent.toFixed(1),
                          ),
                        )}
                        %)
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-4 text-lg font-bold text-slate-900">
                توزيع المصروفات
              </h2>
              {summary.expenseBreakdown.length === 0 ? (
                <EmptyState message="لا توجد مصروفات في هذه الفترة" />
              ) : (
                <ul className="space-y-3">
                  {summary.expenseBreakdown.map((row) => (
                    <li key={`${row.category}-${row.label}`}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">
                          {row.label}
                          <span className="mr-2 text-xs text-slate-400">
                            ({EXPENSE_BEHAVIOR_LABELS[row.behavior]})
                          </span>
                        </span>
                        <span className="font-semibold">
                          {formatMoney(row.amount)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${Math.min(100, Math.max(row.percent, 2))}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card mt-4 p-5">
            <h2 className="mb-4 text-lg font-bold text-slate-900">رؤى وتحليلات</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {summary.insights.map((insight, index) => {
                const Icon = INSIGHT_ICONS[insight.tone];
                return (
                  <li
                    key={`${insight.title}-${index}`}
                    className={`rounded-xl border p-4 ${INSIGHT_TONES[insight.tone]}`}
                  >
                    <div className="mb-1 flex items-center gap-2 font-bold">
                      <Icon size={16} />
                      {insight.title}
                    </div>
                    <p className="text-sm opacity-90">{insight.body}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
