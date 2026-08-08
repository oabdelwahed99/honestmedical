"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Coins,
  Package,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { MovementForm } from "@/components/movement-form";
import { ProductForm } from "@/components/product-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  MOVEMENT_LABELS,
  isOutbound,
  type MovementType,
} from "@/lib/constants";
import { daysUntil, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { ProductDetails, Product as ProductType } from "@/lib/types";

const TYPE_STYLES: Record<MovementType, string> = {
  purchase: "bg-emerald-50 text-emerald-700",
  sale: "bg-brand-50 text-brand-600",
  return_in: "bg-teal-50 text-teal-700",
  return_out: "bg-orange-50 text-orange-700",
  damaged: "bg-rose-50 text-rose-700",
  expired: "bg-fuchsia-50 text-fuchsia-700",
  sample: "bg-sky-50 text-sky-700",
  adjustment: "bg-amber-50 text-amber-700",
};

type Dialog =
  | { kind: "none" }
  | { kind: "edit" }
  | { kind: "movement"; type: MovementType };

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const detailsQuery = useSWR<ProductDetails>(
    id ? `/api/products/${id}/details` : null,
    apiFetch,
  );
  const productsQuery = useSWR<{ products: ProductType[] }>(
    "/api/products",
    apiFetch,
  );

  const details = detailsQuery.data;
  const product = details?.product;
  const summary = details?.summary;
  const movements = details?.recentMovements ?? [];
  const products = productsQuery.data?.products ?? [];
  const error = (detailsQuery.error as Error | undefined)?.message;

  const reload = async () => {
    await Promise.all([detailsQuery.mutate(), productsQuery.mutate()]);
  };

  const closeDialog = () => setDialog({ kind: "none" });
  const onSaved = async () => {
    closeDialog();
    await reload();
  };

  if (detailsQuery.isLoading && !details) {
    return (
      <div className="card">
        <Loading />
      </div>
    );
  }

  if (error || !product || !summary) {
    return (
      <>
        <Link
          href="/products"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600"
        >
          <ArrowLeft size={16} />
          العودة للأصناف
        </Link>
        <Alert message={error || "الصنف غير موجود"} />
      </>
    );
  }

  const remaining = daysUntil(product.expiryDate);
  const purchased = summary.byType.purchase?.quantity ?? 0;
  const sold = summary.byType.sale?.quantity ?? 0;
  const damaged = summary.byType.damaged?.quantity ?? 0;
  const expiredWrittenOff = summary.byType.expired?.quantity ?? 0;
  const samples = summary.byType.sample?.quantity ?? 0;
  const returnIn = summary.byType.return_in?.quantity ?? 0;
  const returnOut = summary.byType.return_out?.quantity ?? 0;

  const expiryHint =
    summary.expiryStatus === "none"
      ? "لا يوجد تاريخ صلاحية مسجل"
      : summary.expiryStatus === "expired"
        ? `منتهي منذ ${Math.abs(remaining ?? 0)} يوم — الكمية كلها ${formatNumber(summary.unitsExpired)} ${product.unit}`
        : summary.expiryStatus === "soon"
          ? `ينتهي خلال ${remaining} يوم — الكمية ${formatNumber(summary.unitsExpiringSoon)} ${product.unit}`
          : `متبقي ${remaining} يوم على الصلاحية`;

  return (
    <>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600"
      >
        <ArrowLeft size={16} />
        العودة للأصناف
      </Link>

      <PageHeader
        title={product.name}
        subtitle={`${product.unit}${product.note ? ` · ${product.note}` : ""}`}
        actions={
          <>
            <button
              type="button"
              className="btn bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setDialog({ kind: "movement", type: "purchase" })}
            >
              <ArrowDownLeft size={18} />
              شراء
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDialog({ kind: "movement", type: "sale" })}
            >
              <ArrowUpRight size={18} />
              بيع
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDialog({ kind: "edit" })}
            >
              <Pencil size={18} />
              تعديل
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="الكمية الحالية"
          value={`${formatNumber(summary.quantity)} ${product.unit}`}
          hint={
            summary.lowStock
              ? `تحت حد التنبيه (${formatNumber(product.lowStockThreshold)})`
              : `حد التنبيه ${formatNumber(product.lowStockThreshold)}`
          }
          icon={<Package size={20} />}
          tone={summary.lowStock ? "warning" : "success"}
        />
        <StatCard
          label="قيمة المخزون"
          value={formatMoney(summary.stockValue)}
          hint={`العائد المتوقع ${formatMoney(summary.expectedRevenue)}`}
          icon={<Coins size={20} />}
          tone="success"
        />
        <StatCard
          label="حالة الصلاحية"
          value={
            summary.expiryStatus === "expired"
              ? "منتهي"
              : summary.expiryStatus === "soon"
                ? "قارب على الانتهاء"
                : summary.expiryStatus === "ok"
                  ? "سليم"
                  : "غير محدد"
          }
          hint={expiryHint}
          icon={<CalendarClock size={20} />}
          tone={
            summary.expiryStatus === "expired"
              ? "danger"
              : summary.expiryStatus === "soon"
                ? "warning"
                : "default"
          }
        />
        <StatCard
          label="هامش الربح المتوقع"
          value={formatMoney(summary.potentialProfit)}
          hint={`شراء ${formatMoney(product.purchasePrice)} · بيع ${formatMoney(product.salePrice)}`}
          icon={<TriangleAlert size={20} />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <h2 className="mb-4 font-bold text-slate-900">تفاصيل الصنف</h2>
          <dl className="space-y-3 text-sm">
            <DetailRow label="الوحدة" value={product.unit} />
            <DetailRow
              label="تاريخ الصلاحية"
              value={formatDate(product.expiryDate)}
            />
            <DetailRow
              label="الكمية الكلية الحالية"
              value={`${formatNumber(summary.quantity)} ${product.unit}`}
            />
            <DetailRow
              label="كمية منتهية الصلاحية (حالياً)"
              value={`${formatNumber(summary.unitsExpired)} ${product.unit}`}
              danger={summary.unitsExpired > 0}
            />
            <DetailRow
              label="كمية قاربت الصلاحية"
              value={`${formatNumber(summary.unitsExpiringSoon)} ${product.unit}`}
              warning={summary.unitsExpiringSoon > 0}
            />
            <DetailRow
              label="إهلاك مسجّل (هالك)"
              value={`${formatNumber(damaged)} ${product.unit}`}
            />
            <DetailRow
              label="شطب انتهاء صلاحية (سجل)"
              value={`${formatNumber(expiredWrittenOff)} ${product.unit}`}
            />
            <DetailRow
              label="عدد الحركات"
              value={formatNumber(summary.movementCount)}
            />
          </dl>
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <header className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-900">ملخص الحركات</h2>
            <p className="mt-1 text-xs text-slate-500">
              مجموع الكميات المسجّلة طوال عمر الصنف
            </p>
          </header>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {(
              [
                ["purchase", purchased, "وارد شراء"],
                ["sale", sold, "مبيعات"],
                ["return_in", returnIn, "مرتجع عميل"],
                ["return_out", returnOut, "مرتجع مورد"],
                ["damaged", damaged, "هالك"],
                ["expired", expiredWrittenOff, "انتهاء صلاحية"],
                ["sample", samples, "عينات"],
              ] as const
            ).map(([type, qty, label]) => (
              <div
                key={type}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(summary.byType[type]?.count ?? 0)} حركة ·{" "}
                    {formatMoney(summary.byType[type]?.total ?? 0)}
                  </p>
                </div>
                <span className={`badge ${TYPE_STYLES[type]}`}>
                  {formatNumber(qty)} {product.unit}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-4 overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">آخر الحركات</h2>
          <Link
            href={`/movements?productId=${product._id}`}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            عرض كل الحركات
          </Link>
        </header>

        {movements.length === 0 ? (
          <EmptyState message="لا توجد حركات لهذا الصنف بعد." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">التاريخ</th>
                  <th className="px-4 py-3 font-semibold">النوع</th>
                  <th className="px-4 py-3 font-semibold">العميل / المورد</th>
                  <th className="px-4 py-3 font-semibold">الكمية</th>
                  <th className="px-4 py-3 font-semibold">الإجمالي</th>
                  <th className="px-4 py-3 font-semibold">الرصيد بعد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((movement) => (
                  <tr key={movement._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(movement.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${TYPE_STYLES[movement.type]}`}>
                        {MOVEMENT_LABELS[movement.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {movement.partyName || "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {isOutbound(movement.type) ? "−" : "+"}
                      {formatNumber(movement.quantity)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {movement.total ? formatMoney(movement.total) : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {formatNumber(movement.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={dialog.kind === "edit"}
        title="تعديل الصنف"
        onClose={closeDialog}
      >
        <ProductForm
          key={product._id}
          product={product}
          onSaved={onSaved}
          onCancel={closeDialog}
        />
      </Modal>

      <Modal
        open={dialog.kind === "movement"}
        title="تسجيل حركة"
        onClose={closeDialog}
      >
        {dialog.kind === "movement" ? (
          <MovementForm
            products={products.length ? products : [product]}
            defaultType={dialog.type}
            defaultProductId={product._id}
            onSaved={onSaved}
            onCancel={closeDialog}
          />
        ) : null}
      </Modal>
    </>
  );
}

function DetailRow({
  label,
  value,
  danger,
  warning,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-left font-semibold ${
          danger
            ? "text-rose-600"
            : warning
              ? "text-amber-600"
              : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
