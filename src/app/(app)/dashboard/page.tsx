"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Coins,
  Package,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { MovementForm } from "@/components/movement-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  EXPIRY_WARNING_DAYS,
  MOVEMENT_LABELS,
  isOutbound,
  type MovementType,
} from "@/lib/constants";
import {
  daysUntil,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  toMonthInputValue,
} from "@/lib/format";
import type {
  AccountingSummary,
  Movement,
  Product,
  Stats,
} from "@/lib/types";

const MOVEMENT_ICON_STYLE: Record<MovementType, string> = {
  purchase: "bg-emerald-50 text-emerald-600",
  sale: "bg-brand-50 text-brand-600",
  return_in: "bg-teal-50 text-teal-600",
  return_out: "bg-orange-50 text-orange-600",
  damaged: "bg-rose-50 text-rose-600",
  expired: "bg-fuchsia-50 text-fuchsia-600",
  sample: "bg-sky-50 text-sky-600",
  adjustment: "bg-amber-50 text-amber-600",
};

export default function DashboardPage() {
  const [dialogType, setDialogType] = useState<MovementType | null>(null);
  const month = toMonthInputValue();

  const statsQuery = useSWR<{ stats: Stats }>("/api/stats", apiFetch);
  const productsQuery = useSWR<{ products: Product[] }>(
    "/api/products",
    apiFetch,
  );
  const movementsQuery = useSWR<{ movements: Movement[] }>(
    "/api/movements?limit=8",
    apiFetch,
  );
  const accountingQuery = useSWR<{ summary: AccountingSummary }>(
    `/api/accounting/summary?month=${month}`,
    apiFetch,
  );

  const stats = statsQuery.data?.stats ?? null;
  const products = productsQuery.data?.products ?? [];
  const movements = movementsQuery.data?.movements ?? [];
  const accounting = accountingQuery.data?.summary ?? null;
  const error = (
    (statsQuery.error ?? productsQuery.error ?? movementsQuery.error) as
      | Error
      | undefined
  )?.message;

  const reload = async () => {
    await Promise.all([
      statsQuery.mutate(),
      productsQuery.mutate(),
      movementsQuery.mutate(),
      accountingQuery.mutate(),
    ]);
  };

  const attention = products
    .filter((product) => {
      const remaining = daysUntil(product.expiryDate);
      return (
        product.quantity <= product.lowStockThreshold ||
        (remaining !== null && remaining <= EXPIRY_WARNING_DAYS)
      );
    })
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة سريعة على المخزون وحركة آخر ٣٠ يوم"
        actions={
          <>
            <button
              type="button"
              className="btn bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setDialogType("purchase")}
            >
              <ArrowDownLeft size={18} />
              تسجيل شراء
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDialogType("sale")}
            >
              <ArrowUpRight size={18} />
              تسجيل بيع
            </button>
          </>
        }
      />

      {error ? <Alert message={error} /> : null}

      {!stats ? (
        error ? null : (
          <div className="card">
            <Loading />
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="عدد الأصناف"
              value={formatNumber(stats.productCount)}
              hint={`${formatNumber(stats.totalUnits)} وحدة في المخزن`}
              icon={<Package size={20} />}
            />
            <StatCard
              label="قيمة المخزون (بالشراء)"
              value={formatMoney(stats.stockValue)}
              hint={`العائد المتوقع ${formatMoney(stats.expectedRevenue)}`}
              icon={<Coins size={20} />}
              tone="success"
            />
            <StatCard
              label="مبيعات آخر ٣٠ يوم"
              value={formatMoney(stats.salesLast30Days)}
              hint={`الربح التقديري ${formatMoney(stats.profitLast30Days)} · المشتريات ${formatMoney(stats.purchasesLast30Days)}`}
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              label="أصناف تحتاج انتباه"
              value={formatNumber(stats.lowStockCount + stats.expiringSoonCount)}
              hint={`${formatNumber(stats.lowStockCount)} شارفت على النفاد · ${formatNumber(stats.expiringSoonCount)} قاربت الصلاحية`}
              icon={<TriangleAlert size={20} />}
              tone={
                stats.lowStockCount + stats.expiringSoonCount > 0
                  ? "warning"
                  : "default"
              }
            />
          </div>

          {accounting ? (
            <Link href="/accounting" className="mt-4 block">
              <div className="card grid gap-4 p-5 transition hover:border-brand-200 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Wallet size={20} />
                  </span>
                  <div>
                    <p className="text-sm text-slate-500">
                      صافي ربح {accounting.period.label}
                    </p>
                    <p className="text-xl font-bold text-slate-900">
                      {formatMoney(accounting.netProfit)}
                    </p>
                    <p className="text-xs text-slate-500">
                      هامش {formatPercent(accounting.netMargin)} · مجمل{" "}
                      {formatMoney(accounting.grossProfit)}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500">نقطة التعادل</p>
                  {accounting.breakeven ? (
                    <>
                      <p className="text-xl font-bold text-slate-900">
                        {formatMoney(accounting.breakeven.breakevenRevenue)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {accounting.breakeven.reached
                          ? `تم التخطي · أمان ${formatNumber(Number(accounting.breakeven.marginOfSafetyPercent.toFixed(0)))}%`
                          : `التقدم ${formatNumber(Number(accounting.breakeven.progressPercent.toFixed(0)))}%`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {accounting.breakevenUnavailableReason ?? "غير متاح"}
                    </p>
                  )}
                </div>
                <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="text-sm text-slate-500">
                    مصروفات تشغيلية{" "}
                    {formatMoney(accounting.operatingExpenses)}
                  </p>
                  <span className="text-sm font-semibold text-brand-600">
                    عرض التقرير ←
                  </span>
                </div>
              </div>
            </Link>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="card overflow-hidden lg:col-span-2">
              <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold text-slate-900">آخر الحركات</h2>
                <Link
                  href="/movements"
                  className="text-sm font-semibold text-brand-600 hover:underline"
                >
                  عرض السجل كاملاً
                </Link>
              </header>

              {movements.length === 0 ? (
                <EmptyState message="لم يتم تسجيل أي حركة بعد." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {movements.map((movement) => (
                    <li
                      key={movement._id}
                      className="flex items-center gap-3 px-5 py-3.5"
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${MOVEMENT_ICON_STYLE[movement.type]}`}
                      >
                        {isOutbound(movement.type) ? (
                          <ArrowUpRight size={17} />
                        ) : (
                          <ArrowDownLeft size={17} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">
                          {movement.productName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {MOVEMENT_LABELS[movement.type]}
                          {movement.partyName
                            ? ` · ${movement.partyName}`
                            : ""}{" "}
                          · {formatNumber(movement.quantity)} {movement.unit} ·{" "}
                          {formatDate(movement.date)}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">
                          {movement.total ? formatMoney(movement.total) : "—"}
                        </p>
                        <p className="text-xs text-slate-400">
                          الرصيد: {formatNumber(movement.balanceAfter)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
                <CalendarClock size={18} className="text-amber-500" />
                <h2 className="font-bold text-slate-900">تنبيهات المخزون</h2>
              </header>

              {attention.length === 0 ? (
                <EmptyState message="كل الأصناف في وضع جيد." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {attention.map((product) => {
                    const remaining = daysUntil(product.expiryDate);
                    const lowStock =
                      product.quantity <= product.lowStockThreshold;

                    return (
                      <li key={product._id} className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {lowStock ? (
                            <span className="badge bg-rose-50 text-rose-700">
                              الرصيد {formatNumber(product.quantity)}{" "}
                              {product.unit}
                            </span>
                          ) : null}
                          {remaining !== null && remaining < 0 ? (
                            <span className="badge bg-rose-50 text-rose-700">
                              منتهي منذ {Math.abs(remaining)} يوم
                            </span>
                          ) : remaining !== null &&
                            remaining <= EXPIRY_WARNING_DAYS ? (
                            <span className="badge bg-amber-50 text-amber-700">
                              ينتهي خلال {remaining} يوم
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <Modal
        open={dialogType !== null}
        title="تسجيل حركة"
        onClose={() => setDialogType(null)}
      >
        {dialogType ? (
          <MovementForm
            products={products}
            defaultType={dialogType}
            onSaved={async () => {
              setDialogType(null);
              await reload();
            }}
            onCancel={() => setDialogType(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
