"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Factory,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { ProductForm } from "@/components/product-form";
import { Alert, EmptyState, Loading, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { daysUntil, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Product } from "@/lib/types";

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; product: Product };

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<{ products: Product[] }>("/api/products", apiFetch);

  const products = data?.products ?? [];
  const error = actionError || (loadError as Error | undefined)?.message || "";

  async function handleDelete(product: Product) {
    if (product.manufactured) {
      setActionError(
        `"${product.name}" صنف مصنّع — احذفه أو عدّله من صفحة المصنعات`,
      );
      return;
    }
    const confirmed = window.confirm(
      `سيتم حذف "${product.name}" وكل حركاته المسجلة. هل أنت متأكد؟`,
    );
    if (!confirmed) return;

    setActionError("");
    try {
      await apiFetch(`/api/products/${product._id}`, { method: "DELETE" });
      await mutate();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  const visible = products.filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const closeDialog = () => setDialog({ kind: "none" });
  const onSaved = async () => {
    closeDialog();
    await mutate();
  };

  return (
    <>
      <PageHeader
        title="الأصناف"
        subtitle="إضافة وتعديل الأصناف ومتابعة أرصدتها"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus size={18} />
            إضافة صنف
          </button>
        }
      />

      {error ? <Alert message={error} /> : null}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-sm">
            <Search
              size={18}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="field-input pe-10"
              placeholder="ابحث باسم الصنف..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <Loading />
        ) : loadError ? null : visible.length === 0 ? (
          <EmptyState
            message={
              products.length === 0
                ? "لا توجد أصناف بعد. ابدأ بإضافة أول صنف."
                : "لا توجد نتائج مطابقة للبحث."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">اسم الصنف</th>
                  <th className="px-4 py-3 font-semibold">الوحدة</th>
                  <th className="px-4 py-3 font-semibold">الرصيد</th>
                  <th className="px-4 py-3 font-semibold">سعر الشراء</th>
                  <th className="px-4 py-3 font-semibold">سعر البيع</th>
                  <th className="px-4 py-3 font-semibold">قيمة المخزون</th>
                  <th className="px-4 py-3 font-semibold">تاريخ الصلاحية</th>
                  <th className="px-4 py-3 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((product) => {
                  const remaining = daysUntil(product.expiryDate);
                  const expired = remaining !== null && remaining < 0;
                  const expiringSoon =
                    remaining !== null &&
                    remaining >= 0 &&
                    remaining <= EXPIRY_WARNING_DAYS;
                  const lowStock = product.quantity <= product.lowStockThreshold;

                  return (
                    <tr key={product._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${product._id}`}
                          className="group block"
                        >
                          <p className="flex items-center gap-2 font-semibold text-slate-900 group-hover:text-brand-600 group-hover:underline">
                            {product.name}
                            {product.manufactured ? (
                              <span className="badge bg-indigo-50 text-indigo-700">
                                مصنّع
                              </span>
                            ) : null}
                          </p>
                          {product.note ? (
                            <p className="text-xs text-slate-400">
                              {product.note}
                            </p>
                          ) : (
                            <p className="text-xs text-brand-500 opacity-0 transition group-hover:opacity-100">
                              عرض التفاصيل
                            </p>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {product.unit}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            lowStock
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {formatNumber(product.quantity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(product.purchasePrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(product.salePrice)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatMoney(product.quantity * product.purchasePrice)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            expired
                              ? "font-semibold text-rose-600"
                              : expiringSoon
                                ? "font-semibold text-amber-600"
                                : "text-slate-600"
                          }
                        >
                          {formatDate(product.expiryDate)}
                        </span>
                        {expired ? (
                          <p className="text-xs text-rose-500">منتهي الصلاحية</p>
                        ) : expiringSoon ? (
                          <p className="text-xs text-amber-500">
                            ينتهي خلال {remaining} يوم
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {product.manufactured ? (
                            <Link
                              href="/packages"
                              title="تصنيع"
                              aria-label="تصنيع"
                              className="rounded-lg p-2 text-indigo-600 transition hover:bg-indigo-50"
                            >
                              <Factory size={17} />
                            </Link>
                          ) : (
                            <Link
                              href="/invoices?kind=purchase&new=1"
                              title="فاتورة شراء"
                              aria-label="فاتورة شراء"
                              className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50"
                            >
                              <ArrowDownLeft size={17} />
                            </Link>
                          )}
                          <Link
                            href="/invoices?kind=sale&new=1"
                            title="فاتورة بيع"
                            aria-label="فاتورة بيع"
                            className="rounded-lg p-2 text-brand-600 transition hover:bg-brand-50"
                          >
                            <ArrowUpRight size={17} />
                          </Link>
                          <IconButton
                            title="تعديل"
                            className="text-slate-500 hover:bg-slate-100"
                            onClick={() => setDialog({ kind: "edit", product })}
                          >
                            <Pencil size={16} />
                          </IconButton>
                          <IconButton
                            title="حذف"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
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
        open={dialog.kind === "create" || dialog.kind === "edit"}
        title={dialog.kind === "edit" ? "تعديل الصنف" : "إضافة صنف جديد"}
        onClose={closeDialog}
      >
        <ProductForm
          key={dialog.kind === "edit" ? dialog.product._id : "create"}
          product={dialog.kind === "edit" ? dialog.product : undefined}
          onSaved={onSaved}
          onCancel={closeDialog}
        />
      </Modal>

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
