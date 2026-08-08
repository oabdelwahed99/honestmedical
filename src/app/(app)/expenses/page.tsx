"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { ExpenseForm } from "@/components/expense-form";
import { RecurringExpenseForm } from "@/components/recurring-expense-form";
import {
  Alert,
  EmptyState,
  Loading,
  PageHeader,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  EXPENSE_BEHAVIOR_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "@/lib/constants";
import {
  formatDate,
  formatMoney,
  formatNumber,
  toMonthInputValue,
} from "@/lib/format";
import type { Expense, RecurringExpense } from "@/lib/types";

type Tab = "entries" | "recurring";

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; expense: Expense }
  | { kind: "create-recurring" }
  | { kind: "edit-recurring"; recurring: RecurringExpense };

export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>("entries");
  const [month, setMonth] = useState(toMonthInputValue());
  const [category, setCategory] = useState<"" | ExpenseCategory>("");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [actionError, setActionError] = useState("");
  const [generating, setGenerating] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ month });
    if (category) params.set("category", category);
    return `/api/expenses?${params.toString()}`;
  }, [month, category]);

  const expensesQuery = useSWR<{ expenses: Expense[] }>(query, apiFetch);
  const recurringQuery = useSWR<{ recurring: RecurringExpense[] }>(
    "/api/expenses/recurring",
    apiFetch,
  );

  const expenses = expensesQuery.data?.expenses ?? [];
  const recurring = recurringQuery.data?.recurring ?? [];
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const error = (
    (expensesQuery.error ?? recurringQuery.error) as Error | undefined
  )?.message;

  const closeDialog = () => setDialog({ kind: "none" });

  const reload = async () => {
    await Promise.all([expensesQuery.mutate(), recurringQuery.mutate()]);
  };

  async function deleteExpense(id: string) {
    if (!confirm("هل تريد حذف هذا المصروف؟")) return;
    setActionError("");
    try {
      await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
      await expensesQuery.mutate();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  async function deleteRecurring(id: string) {
    if (!confirm("هل تريد حذف هذا القالب؟")) return;
    setActionError("");
    try {
      await apiFetch(`/api/expenses/recurring/${id}`, { method: "DELETE" });
      await recurringQuery.mutate();
    } catch (deleteError) {
      setActionError((deleteError as Error).message);
    }
  }

  async function generateMonth() {
    setGenerating(true);
    setActionError("");
    try {
      const result = await apiFetch<{ message: string }>(
        "/api/expenses/recurring/generate",
        {
          method: "POST",
          body: JSON.stringify({ month }),
        },
      );
      await expensesQuery.mutate();
      alert(result.message);
      setTab("entries");
    } catch (generateError) {
      setActionError((generateError as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="المصروفات"
        subtitle="رواتب، إيجارات، صيانة، ومصروفات أخرى مع قوالب شهرية"
        actions={
          tab === "entries" ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDialog({ kind: "create" })}
            >
              <Plus size={18} />
              مصروف جديد
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDialog({ kind: "create-recurring" })}
            >
              <Plus size={18} />
              قالب شهري
            </button>
          )
        }
      />

      {error || actionError ? (
        <Alert message={error || actionError} />
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === "entries" ? "btn-primary" : "btn-ghost"}
          onClick={() => setTab("entries")}
        >
          مصروفات الشهر
        </button>
        <button
          type="button"
          className={tab === "recurring" ? "btn-primary" : "btn-ghost"}
          onClick={() => setTab("recurring")}
        >
          القوالب الشهرية
        </button>
      </div>

      {tab === "entries" ? (
        <>
          <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="expense-month">
                الشهر
              </label>
              <input
                id="expense-month"
                type="month"
                className="field-input"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="expense-filter-category">
                التصنيف
              </label>
              <select
                id="expense-filter-category"
                className="field-input"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as "" | ExpenseCategory)
                }
              >
                <option value="">الكل</option>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {EXPENSE_CATEGORY_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={generateMonth}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <RefreshCw size={18} />
                )}
                توليد مصروفات الشهر
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            {expensesQuery.isLoading ? (
              <Loading />
            ) : expenses.length === 0 ? (
              <EmptyState message="لا توجد مصروفات في هذا الشهر" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-right text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">التاريخ</th>
                        <th className="px-4 py-3 font-semibold">التصنيف</th>
                        <th className="px-4 py-3 font-semibold">الوصف</th>
                        <th className="px-4 py-3 font-semibold">النوع</th>
                        <th className="px-4 py-3 font-semibold">المدفوع إليه</th>
                        <th className="px-4 py-3 font-semibold">المبلغ</th>
                        <th className="px-4 py-3 font-semibold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.map((expense) => (
                        <tr key={expense._id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3">{formatDate(expense.date)}</td>
                          <td className="px-4 py-3">
                            <span className="badge bg-slate-100 text-slate-700">
                              {EXPENSE_CATEGORY_LABELS[expense.category]}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {expense.label}
                          </td>
                          <td className="px-4 py-3">
                            {EXPENSE_BEHAVIOR_LABELS[expense.behavior]}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {expense.paidTo || "—"}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {formatMoney(expense.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                onClick={() =>
                                  setDialog({ kind: "edit", expense })
                                }
                                aria-label="تعديل"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                                onClick={() => deleteExpense(expense._id)}
                                aria-label="حذف"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-500">
                    {formatNumber(expenses.length)} مصروف
                  </span>
                  <span className="font-bold text-slate-900">
                    الإجمالي {formatMoney(total)}
                  </span>
                </footer>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          {recurringQuery.isLoading ? (
            <Loading />
          ) : recurring.length === 0 ? (
            <EmptyState message="لا توجد قوالب شهرية بعد — أضف رواتب أو إيجارات دورية" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">التصنيف</th>
                    <th className="px-4 py-3 font-semibold">الوصف</th>
                    <th className="px-4 py-3 font-semibold">المبلغ</th>
                    <th className="px-4 py-3 font-semibold">يوم الشهر</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recurring.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        {EXPENSE_CATEGORY_LABELS[item.category]}
                      </td>
                      <td className="px-4 py-3 font-medium">{item.label}</td>
                      <td className="px-4 py-3">{formatMoney(item.amount)}</td>
                      <td className="px-4 py-3">{item.dayOfMonth}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            item.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {item.active ? "نشط" : "موقوف"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            onClick={() =>
                              setDialog({
                                kind: "edit-recurring",
                                recurring: item,
                              })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                            onClick={() => deleteRecurring(item._id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={dialog.kind === "create" || dialog.kind === "edit"}
        title={dialog.kind === "edit" ? "تعديل مصروف" : "مصروف جديد"}
        onClose={closeDialog}
      >
        <ExpenseForm
          expense={dialog.kind === "edit" ? dialog.expense : undefined}
          onCancel={closeDialog}
          onSaved={async () => {
            closeDialog();
            await reload();
          }}
        />
      </Modal>

      <Modal
        open={
          dialog.kind === "create-recurring" ||
          dialog.kind === "edit-recurring"
        }
        title={
          dialog.kind === "edit-recurring" ? "تعديل قالب" : "قالب شهري جديد"
        }
        onClose={closeDialog}
      >
        <RecurringExpenseForm
          recurring={
            dialog.kind === "edit-recurring" ? dialog.recurring : undefined
          }
          onCancel={closeDialog}
          onSaved={async () => {
            closeDialog();
            await recurringQuery.mutate();
          }}
        />
      </Modal>
    </>
  );
}
