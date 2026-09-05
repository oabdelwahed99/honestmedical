"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pencil, UserPlus, UserX } from "lucide-react";
import { Modal } from "@/components/modal";
import { RepForm } from "@/components/rep-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  formatMoney,
  formatNumber,
  toMonthInputValue,
} from "@/lib/format";
import type { SalesRep, SalesRepSummary } from "@/lib/types";

type Dialog =
  | { kind: "none" }
  | { kind: "rep"; rep?: SalesRep };

export default function RepsPage() {
  const [month, setMonth] = useState(toMonthInputValue());
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [actionError, setActionError] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{
    summary: SalesRepSummary;
  }>(`/api/reps/summary?month=${month}`, apiFetch);

  const summary = data?.summary ?? null;
  const closeDialog = () => setDialog({ kind: "none" });

  async function deactivate(rep: SalesRep) {
    if (!confirm(`إيقاف المندوب "${rep.name}"؟`)) return;
    setActionError("");
    try {
      await apiFetch(`/api/reps/${rep._id}`, { method: "DELETE" });
      await mutate();
    } catch (deactivateError) {
      setActionError((deactivateError as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="المناديب"
        subtitle="إدارة مناديب المبيعات ومتابعة إجمالي فواتير كل مندوب"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setDialog({ kind: "rep" })}
          >
            <UserPlus size={18} />
            مندوب جديد
          </button>
        }
      />

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      <div className="card mb-4 p-4">
        <label className="field-label" htmlFor="reps-month">
          الشهر
        </label>
        <input
          id="reps-month"
          type="month"
          className="field-input max-w-xs"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="card">
          <Loading />
        </div>
      ) : summary ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <StatCard
              label="إجمالي مبيعات المناديب"
              value={formatMoney(summary.totalSales)}
              hint={summary.period.label}
              icon={<UserPlus size={20} />}
              tone="success"
            />
            <StatCard
              label="عدد الفواتير"
              value={formatNumber(summary.invoiceCount)}
              hint={`${formatNumber(summary.reps.filter((row) => row.rep.active).length)} مندوب نشط`}
              icon={<Pencil size={20} />}
            />
          </div>

          <div className="card overflow-hidden">
            {summary.reps.length === 0 ? (
              <EmptyState message="لا يوجد مناديب بعد. أضف مندوباً لربطه بفواتير البيع." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">المندوب</th>
                      <th className="px-4 py-3 font-semibold">الهاتف</th>
                      <th className="px-4 py-3 font-semibold">الحالة</th>
                      <th className="px-4 py-3 font-semibold">الفواتير</th>
                      <th className="px-4 py-3 font-semibold">مبيعات الشهر</th>
                      <th className="px-4 py-3 font-semibold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.reps.map(({ rep, invoiceCount, salesTotal }) => (
                      <tr key={rep._id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {rep.name}
                          </p>
                          {rep.note ? (
                            <p className="text-xs text-slate-400">{rep.note}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {rep.phone || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`badge ${
                              rep.active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {rep.active ? "نشط" : "موقوف"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {formatNumber(invoiceCount)}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatMoney(salesTotal)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                              onClick={() => setDialog({ kind: "rep", rep })}
                              aria-label="تعديل"
                            >
                              <Pencil size={16} />
                            </button>
                            {rep.active ? (
                              <button
                                type="button"
                                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                                onClick={() => deactivate(rep)}
                                aria-label="إيقاف"
                              >
                                <UserX size={16} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      <Modal
        open={dialog.kind === "rep"}
        title={dialog.kind === "rep" && dialog.rep ? "تعديل مندوب" : "مندوب جديد"}
        onClose={closeDialog}
      >
        {dialog.kind === "rep" ? (
          <RepForm
            rep={dialog.rep}
            onCancel={closeDialog}
            onSaved={async () => {
              closeDialog();
              await mutate();
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
