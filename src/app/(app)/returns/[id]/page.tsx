"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowRight, PackagePlus, Printer, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { ReplacementForm } from "@/components/replacement-form";
import { ReturnNotePrint } from "@/components/return-note-print";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  RETURN_DIRECTION_LABELS,
  RETURN_SETTLEMENT_LABELS,
} from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { ReturnNote } from "@/lib/types";

export default function ReturnNotePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [actionError, setActionError] = useState("");
  const [receiving, setReceiving] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ returnNote: ReturnNote }>(
    params.id ? `/api/returns/${params.id}` : null,
    apiFetch,
  );
  const note = data?.returnNote ?? null;

  async function deleteNote() {
    if (!note) return;
    if (
      !confirm(
        "حذف اذن الارتجاع سيعكس حركات المخزون ويعيد قيمة المرتجع إلى الحساب. هل تريد المتابعة؟",
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await apiFetch(`/api/returns/${note._id}`, { method: "DELETE" });
      router.push("/returns");
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

  if (!note) {
    return (
      <>
        <PageHeader title="اذن الارتجاع" />
        <Alert message={(error as Error | undefined)?.message ?? "اذن الارتجاع غير موجود"} />
        <Link href="/returns" className="btn-ghost mt-4 inline-flex">
          <ArrowRight size={16} />
          العودة لاذون الارتجاع
        </Link>
      </>
    );
  }

  const isCustomer = note.direction === "customer";
  const exchange = note.settlement === "exchange";

  const effectText = isCustomer
    ? `خُصم ${formatMoney(note.moneyEffect)} من حساب العميل`
    : note.settlement === "refund"
      ? `خُصم ${formatMoney(note.moneyEffect)} من مستحقات المورد`
      : note.replacements.length === 0
        ? "في انتظار استلام البدل — لا يتغير الحساب"
        : Math.abs(note.moneyEffect) < 0.005
          ? "قيمة البدل مساوية — لا يتغير الحساب"
          : note.moneyEffect > 0
            ? `الفرق ${formatMoney(note.moneyEffect)} خُصم من مستحقات المورد`
            : `الفرق ${formatMoney(-note.moneyEffect)} أُضيف لمستحقات المورد`;

  return (
    <>
      <ReturnNotePrint note={note} />

      <div className="print:hidden">
        <PageHeader
          title={note.number}
          subtitle={`اذن ارتجاع · ${RETURN_DIRECTION_LABELS[note.direction]} · ${note.partyName} · ${formatDate(note.date)}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/returns" className="btn-ghost">
                <ArrowRight size={16} />
                رجوع
              </Link>
              <button type="button" className="btn-ghost" onClick={() => window.print()}>
                <Printer size={16} />
                طباعة
              </button>
              {exchange ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setReceiving(true)}
                >
                  <PackagePlus size={16} />
                  استلام بدل
                </button>
              ) : null}
              <button type="button" className="btn-danger" onClick={deleteNote}>
                <Trash2 size={16} />
                حذف
              </button>
            </div>
          }
        />

        {error || actionError ? (
          <Alert message={(error as Error | undefined)?.message || actionError} />
        ) : null}

        <div className="card overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">{isCustomer ? "العميل" : "المورد"}</p>
              <Link
                href={`/accounts/${note.party}`}
                className="font-bold text-brand-600 hover:underline"
              >
                {note.partyName}
              </Link>
            </div>
            <div>
              <p className="text-xs text-slate-500">الفاتورة</p>
              <Link
                href={`/invoices/${note.invoice}`}
                className="font-bold text-brand-600 hover:underline"
              >
                {note.invoiceNumber}
              </Link>
            </div>
            {isCustomer ? (
              <div>
                <p className="text-xs text-slate-500">رقم البيان</p>
                <p className="font-bold text-slate-900">{note.statementNumber || "—"}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-slate-500">التسوية</p>
              <p className="font-bold text-slate-900">
                {RETURN_SETTLEMENT_LABELS[note.settlement]}
              </p>
            </div>
            {isCustomer ? (
              <div>
                <p className="text-xs text-slate-500">المندوب</p>
                <p className="font-bold text-slate-900">{note.repName || "—"}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-slate-500">سجّله</p>
              <p className="font-bold text-slate-900">{note.createdBy || "—"}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">الصنف المرتجع</th>
                  <th className="px-4 py-3 font-semibold">الوحدة</th>
                  <th className="px-4 py-3 font-semibold">الكمية</th>
                  <th className="px-4 py-3 font-semibold">السعر</th>
                  <th className="px-4 py-3 font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {note.items.map((item, index) => (
                  <tr key={`${item.line}-${index}`}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/products/${item.product}`}
                        className="hover:text-brand-600 hover:underline"
                      >
                        {item.productName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3">{formatNumber(item.quantity)}</td>
                    <td className="px-4 py-3">{formatMoney(item.unitPrice)}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {exchange ? (
            <div className="border-t border-slate-200">
              <h3 className="px-5 pt-4 text-sm font-bold text-slate-900">البضاعة البديلة</h3>
              {note.replacements.length === 0 ? (
                <p className="px-5 py-4 text-sm text-amber-700">
                  لم يُستلم البدل بعد — اضغط «استلام بدل» عند وصول البضاعة.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-right text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">الصنف</th>
                        <th className="px-4 py-3 font-semibold">الكمية</th>
                        <th className="px-4 py-3 font-semibold">سعر الشراء</th>
                        <th className="px-4 py-3 font-semibold">الصلاحية</th>
                        <th className="px-4 py-3 font-semibold">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {note.replacements.map((row, index) => (
                        <tr key={`${row.product}-${index}`}>
                          <td className="px-4 py-3 font-medium">{row.productName}</td>
                          <td className="px-4 py-3">
                            {formatNumber(row.quantity)} {row.unit}
                          </td>
                          <td className="px-4 py-3">{formatMoney(row.purchasePrice)}</td>
                          <td className="px-4 py-3">{formatDate(row.expiryDate)}</td>
                          <td className="px-4 py-3 font-semibold">{formatMoney(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-2">
            <div>
              {note.note ? (
                <p className="text-sm text-slate-500">ملاحظة: {note.note}</p>
              ) : null}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">قيمة البضاعة المرتجعة</dt>
                <dd className="font-semibold">{formatMoney(note.goodsValue)}</dd>
              </div>
              {exchange ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">قيمة البدل</dt>
                  <dd className="font-semibold">{formatMoney(note.replacementValue)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 text-base">
                <dt className="font-bold text-slate-900">أثر الحساب</dt>
                <dd className="font-bold text-brand-600">{effectText}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <Modal open={receiving} title="استلام بضاعة بديلة" onClose={() => setReceiving(false)}>
        {receiving ? (
          <ReplacementForm
            note={note}
            onSaved={async () => {
              setReceiving(false);
              await mutate();
            }}
            onCancel={() => setReceiving(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}
