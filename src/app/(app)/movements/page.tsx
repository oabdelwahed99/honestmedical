"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Download, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { MovementForm } from "@/components/movement-form";
import { Alert, EmptyState, Loading, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { MovementType } from "@/lib/constants";
import type { Movement, Product } from "@/lib/types";

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

const COLUMNS = [
  "اسم الصنف",
  "الوحدة",
  "التاريخ",
  "نوع الحركة",
  "العميل / المورد",
  "رقم الفاتورة",
  "الكمية",
  "سعر الشراء",
  "سعر البيع",
  "الرصيد قبل البيع",
  "الرصيد بعد البيع",
  "تاريخ الصلاحية",
  "الإجمالي",
];

export default function MovementsPage() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <Loading />
        </div>
      }
    >
      <MovementsPageContent />
    </Suspense>
  );
}

function MovementsPageContent() {
  const searchParams = useSearchParams();
  const productIdFilter = searchParams.get("productId") || "";
  const [actionError, setActionError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    party: "",
    invoice: "",
    type: "",
    from: "",
    to: "",
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.party) params.set("party", filters.party);
    if (filters.invoice) params.set("invoice", filters.invoice);
    if (filters.type) params.set("type", filters.type);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (productIdFilter) params.set("productId", productIdFilter);
    return params.toString();
  }, [filters, productIdFilter]);

  const {
    data: movementData,
    error: movementError,
    isLoading,
    mutate: reloadMovements,
  } = useSWR<{ movements: Movement[] }>(
    `/api/movements${query ? `?${query}` : ""}`,
    apiFetch,
  );

  const { data: productData, mutate: reloadProducts } = useSWR<{
    products: Product[];
  }>("/api/products", apiFetch);

  const { data: partiesData, mutate: reloadParties } = useSWR<{
    parties: string[];
  }>("/api/parties", apiFetch);

  const movements = movementData?.movements ?? [];
  const products = productData?.products ?? [];
  const filteredProduct = productIdFilter
    ? products.find((item) => item._id === productIdFilter)
    : null;
  const error =
    actionError || (movementError as Error | undefined)?.message || "";

  const reload = async () => {
    await Promise.all([reloadMovements(), reloadProducts(), reloadParties()]);
  };

  async function handleDelete(movement: Movement) {
    const confirmed = window.confirm(
      "سيتم حذف الحركة وإعادة حساب رصيد الصنف. هل أنت متأكد؟",
    );
    if (!confirmed) return;

    setActionError("");
    try {
      await apiFetch(`/api/movements/${movement._id}`, { method: "DELETE" });
      await reload();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  function exportCsv() {
    const header = [...COLUMNS, "ملاحظات"];
    const rows = movements.map((movement) => [
      movement.productName,
      movement.unit,
      formatDate(movement.date),
      MOVEMENT_LABELS[movement.type],
      movement.partyName || "",
      movement.invoiceNumber || "",
      movement.quantity,
      movement.purchasePrice,
      movement.salePrice,
      movement.balanceBefore,
      movement.balanceAfter,
      movement.expiryDate ? formatDate(movement.expiryDate) : "",
      movement.total,
      movement.note,
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    // The BOM makes Excel read the Arabic text as UTF-8.
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `سجل-الحركات-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totals = movements.reduce(
    (accumulator, movement) => {
      if (movement.type === "purchase") accumulator.purchases += movement.total;
      if (movement.type === "sale") accumulator.sales += movement.total;
      return accumulator;
    },
    { purchases: 0, sales: 0 },
  );

  return (
    <>
      <PageHeader
        title="سجل الحركات"
        subtitle={
          filteredProduct
            ? `حركات الصنف: ${filteredProduct.name}`
            : "شراء، بيع، مرتجعات، هالك، انتهاء صلاحية، عينات، وجرد — بالتاريخ والرصيد"
        }
        actions={
          <>
            {productIdFilter ? (
              <Link href="/movements" className="btn-ghost">
                عرض كل الأصناف
              </Link>
            ) : null}
            <button
              type="button"
              className="btn-ghost"
              onClick={exportCsv}
              disabled={movements.length === 0}
            >
              <Download size={18} />
              تصدير CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setFormOpen(true)}
            >
              <Plus size={18} />
              تسجيل حركة
            </button>
          </>
        }
      />

      {error ? <Alert message={error} /> : null}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="field-label" htmlFor="filter-search">
            بحث باسم الصنف
          </label>
          <input
            id="filter-search"
            className="field-input"
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="كل الأصناف"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="filter-party">
            العميل / المورد
          </label>
          <input
            id="filter-party"
            className="field-input"
            list="filter-party-suggestions"
            value={filters.party}
            onChange={(event) =>
              setFilters({ ...filters, party: event.target.value })
            }
            placeholder="كل الأسماء"
            autoComplete="off"
          />
          <datalist id="filter-party-suggestions">
            {(partiesData?.parties ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label" htmlFor="filter-invoice">
            رقم الفاتورة
          </label>
          <input
            id="filter-invoice"
            className="field-input"
            value={filters.invoice}
            onChange={(event) =>
              setFilters({ ...filters, invoice: event.target.value })
            }
            placeholder="INV- أو PINV-"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="filter-type">
            نوع الحركة
          </label>
          <select
            id="filter-type"
            className="field-input"
            value={filters.type}
            onChange={(event) =>
              setFilters({ ...filters, type: event.target.value })
            }
          >
            <option value="">الكل</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="filter-from">
            من تاريخ
          </label>
          <input
            id="filter-from"
            type="date"
            className="field-input"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label" htmlFor="filter-to">
            إلى تاريخ
          </label>
          <input
            id="filter-to"
            type="date"
            className="field-input"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : movementError ? null : movements.length === 0 ? (
          <EmptyState message="لا توجد حركات مسجلة بهذه الشروط." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} className="px-4 py-3 font-semibold">
                        {column}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold">ملاحظات</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((movement) => (
                    <tr key={movement._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {movement.product ? (
                          <Link
                            href={`/products/${movement.product}`}
                            className="hover:text-brand-600 hover:underline"
                          >
                            {movement.productName}
                          </Link>
                        ) : (
                          movement.productName
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {movement.unit}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(movement.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${TYPE_STYLES[movement.type]}`}>
                          {MOVEMENT_LABELS[movement.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {movement.partyName || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {movement.invoice ? (
                          <Link
                            href={`/invoices/${movement.invoice}`}
                            className="font-medium text-brand-600 hover:underline"
                          >
                            {movement.invoiceNumber || "فاتورة"}
                          </Link>
                        ) : (
                          movement.invoiceNumber || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatNumber(movement.quantity)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(movement.purchasePrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(movement.salePrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatNumber(movement.balanceBefore)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatNumber(movement.balanceAfter)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(movement.expiryDate)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {movement.total ? formatMoney(movement.total) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {movement.note || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          title="حذف الحركة"
                          aria-label="حذف الحركة"
                          onClick={() => handleDelete(movement)}
                          className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">
                عدد الحركات: {formatNumber(movements.length)}
              </span>
              <div className="flex flex-wrap gap-4">
                <span className="text-emerald-700">
                  إجمالي المشتريات: {formatMoney(totals.purchases)}
                </span>
                <span className="text-brand-600">
                  إجمالي المبيعات: {formatMoney(totals.sales)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={formOpen}
        title="تسجيل حركة"
        onClose={() => setFormOpen(false)}
      >
        <MovementForm
          products={products}
          onSaved={async () => {
            setFormOpen(false);
            await reload();
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </>
  );
}
