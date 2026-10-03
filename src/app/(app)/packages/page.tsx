"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Factory, History, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { PackageForm } from "@/components/package-form";
import { ProduceForm } from "@/components/produce-form";
import { Alert, EmptyState, Loading, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { PackageRecipe, Product, ProductionRun } from "@/lib/types";

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; pkg: PackageRecipe }
  | { kind: "produce"; pkg: PackageRecipe }
  | { kind: "history"; pkg: PackageRecipe };

export default function PackagesPage() {
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [actionError, setActionError] = useState("");

  const packagesQuery = useSWR<{ packages: PackageRecipe[] }>(
    "/api/packages",
    apiFetch,
  );
  const productsQuery = useSWR<{ products: Product[] }>(
    "/api/products",
    apiFetch,
  );

  const packages = packagesQuery.data?.packages ?? [];
  const products = productsQuery.data?.products ?? [];
  const error =
    actionError || (packagesQuery.error as Error | undefined)?.message || "";

  const reload = async () => {
    await Promise.all([packagesQuery.mutate(), productsQuery.mutate()]);
  };
  const closeDialog = () => setDialog({ kind: "none" });
  const onSaved = async () => {
    closeDialog();
    await reload();
  };

  async function handleDelete(pkg: PackageRecipe) {
    if (!window.confirm(`سيتم حذف المصنّع "${pkg.name}". هل أنت متأكد؟`)) return;
    setActionError("");
    try {
      await apiFetch(`/api/packages/${pkg._id}`, { method: "DELETE" });
      await reload();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="المصنعات"
        subtitle="باكدجات من أصناف المخزون — التصنيع يخصم المكوّنات ويضيف الباكدج كصنف قابل للبيع"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus size={18} />
            مصنّع جديد
          </button>
        }
      />

      {error ? <Alert message={error} /> : null}

      <div className="card overflow-hidden">
        {packagesQuery.isLoading ? (
          <Loading />
        ) : packagesQuery.error ? null : packages.length === 0 ? (
          <EmptyState message="لا توجد مصنعات بعد. أنشئ أول باكدج من أصناف المخزون." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">المصنّع</th>
                  <th className="px-4 py-3 font-semibold">المكوّنات (للوحدة)</th>
                  <th className="px-4 py-3 font-semibold">الرصيد</th>
                  <th className="px-4 py-3 font-semibold">تكلفة الوحدة</th>
                  <th className="px-4 py-3 font-semibold">سعر البيع</th>
                  <th className="px-4 py-3 font-semibold">يمكن تصنيع</th>
                  <th className="px-4 py-3 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packages.map((pkg) => (
                  <tr key={pkg._id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${pkg.product._id}`}
                        className="font-semibold text-slate-900 hover:text-brand-600 hover:underline"
                      >
                        {pkg.name}
                      </Link>
                      <p className="text-xs text-slate-400">
                        {pkg.product.unit}
                        {pkg.note ? ` · ${pkg.note}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5 text-xs text-slate-600">
                        {pkg.components.map((component) => (
                          <li
                            key={component.product}
                            className={component.missing ? "text-rose-600" : ""}
                          >
                            {formatNumber(component.quantity)} {component.unit}{" "}
                            {component.productName}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-emerald-50 text-emerald-700">
                        {formatNumber(pkg.product.quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMoney(pkg.product.purchasePrice)}
                      <p className="text-xs text-slate-400">
                        الدفعة القادمة {formatMoney(pkg.unitCost)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMoney(pkg.product.salePrice)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {formatNumber(pkg.maxProducible)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="btn bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
                          onClick={() => setDialog({ kind: "produce", pkg })}
                        >
                          <Factory size={16} />
                          تصنيع
                        </button>
                        <IconButton
                          title="سجل التصنيع"
                          className="text-slate-500 hover:bg-slate-100"
                          onClick={() => setDialog({ kind: "history", pkg })}
                        >
                          <History size={16} />
                        </IconButton>
                        <IconButton
                          title="تعديل"
                          className="text-slate-500 hover:bg-slate-100"
                          onClick={() => setDialog({ kind: "edit", pkg })}
                        >
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton
                          title="حذف"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(pkg)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={dialog.kind === "create" || dialog.kind === "edit"}
        title={dialog.kind === "edit" ? "تعديل المصنّع" : "مصنّع جديد"}
        onClose={closeDialog}
      >
        <PackageForm
          key={dialog.kind === "edit" ? dialog.pkg._id : "create"}
          pkg={dialog.kind === "edit" ? dialog.pkg : undefined}
          products={products}
          onSaved={onSaved}
          onCancel={closeDialog}
        />
      </Modal>

      <Modal
        open={dialog.kind === "produce"}
        title={dialog.kind === "produce" ? `تصنيع ${dialog.pkg.name}` : ""}
        onClose={closeDialog}
      >
        {dialog.kind === "produce" ? (
          <ProduceForm
            key={dialog.pkg._id}
            pkg={dialog.pkg}
            onSaved={onSaved}
            onCancel={closeDialog}
          />
        ) : null}
      </Modal>

      <Modal
        open={dialog.kind === "history"}
        title={dialog.kind === "history" ? `سجل تصنيع ${dialog.pkg.name}` : ""}
        onClose={closeDialog}
      >
        {dialog.kind === "history" ? (
          <ProductionHistory pkgId={dialog.pkg._id} onChanged={reload} />
        ) : null}
      </Modal>
    </>
  );
}

function ProductionHistory({
  pkgId,
  onChanged,
}: {
  pkgId: string;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const { data, isLoading, mutate } = useSWR<{
    package: PackageRecipe;
    runs: ProductionRun[];
  }>(`/api/packages/${pkgId}`, apiFetch);

  const runs = data?.runs ?? [];
  const onHand = data?.package.product.quantity ?? 0;

  async function reverse(run: ProductionRun) {
    if (
      !window.confirm(
        `سيتم إلغاء تصنيع ${formatNumber(run.quantity)} وحدة وإرجاع المكوّنات للمخزون. هل أنت متأكد؟`,
      )
    ) {
      return;
    }
    setError("");
    setBusy(run._id);
    try {
      await apiFetch(`/api/packages/${pkgId}/productions/${run._id}/reverse`, {
        method: "POST",
      });
      await Promise.all([mutate(), onChanged()]);
    } catch (reverseError) {
      setError((reverseError as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (isLoading) return <Loading />;

  return (
    <>
      {error ? <Alert message={error} /> : null}
      {runs.length === 0 ? (
        <EmptyState message="لم يتم تصنيع هذا الباكدج بعد." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">التاريخ</th>
                <th className="px-3 py-2 font-semibold">الكمية</th>
                <th className="px-3 py-2 font-semibold">تكلفة الوحدة</th>
                <th className="px-3 py-2 font-semibold">المكوّنات المصروفة</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((run) => (
                <tr
                  key={run._id}
                  className={`align-top ${run.reversedAt ? "text-slate-400" : ""}`}
                >
                  <td className="px-3 py-2">
                    {formatDate(run.date)}
                    {run.note ? (
                      <p className="text-xs text-slate-400">{run.note}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {formatNumber(run.quantity)}
                  </td>
                  <td className="px-3 py-2">{formatMoney(run.unitCost)}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5 text-xs">
                      {run.consumed.map((line) => (
                        <li key={line.product}>
                          {formatNumber(line.quantity)} {line.unit}{" "}
                          {line.productName}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2">
                    {run.reversedAt ? (
                      <span className="badge bg-slate-100 text-slate-500">
                        ملغاة
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1.5 text-xs"
                        disabled={busy === run._id || onHand < run.quantity}
                        title={
                          onHand < run.quantity
                            ? "الرصيد الحالي أقل من الكمية المصنّعة"
                            : "إلغاء التصنيع"
                        }
                        onClick={() => reverse(run)}
                      >
                        <Undo2 size={14} />
                        إلغاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function IconButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-2 transition ${className}`}
    >
      {children}
    </button>
  );
}
