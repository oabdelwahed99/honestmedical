"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  PiggyBank,
  RotateCcw,
  Share2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/modal";
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
  formatPercent,
  toMonthInputValue,
} from "@/lib/format";
import type { Partner, PartnerSummary } from "@/lib/types";

type Dialog =
  | { kind: "none" }
  | { kind: "partner"; partner?: Partner }
  | { kind: "distribute" };

export default function PartnersPage() {
  const [month, setMonth] = useState(toMonthInputValue());
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{
    summary: PartnerSummary;
  }>(`/api/partners/summary?month=${month}`, apiFetch);

  const summary = data?.summary ?? null;
  const closeDialog = () => setDialog({ kind: "none" });

  async function distribute() {
    setBusy(true);
    setActionError("");
    try {
      await apiFetch("/api/partners/distributions", {
        method: "POST",
        body: JSON.stringify({ month }),
      });
      closeDialog();
      await mutate();
    } catch (distributeError) {
      setActionError((distributeError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undoDistribution() {
    if (!confirm("إلغاء توزيع أرباح هذا الشهر؟")) return;
    setBusy(true);
    setActionError("");
    try {
      await apiFetch(`/api/partners/distributions?month=${month}`, {
        method: "DELETE",
      });
      await mutate();
    } catch (undoError) {
      setActionError((undoError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="الشركاء"
        subtitle="حصص الملكية ورواتب الشركاء وتوزيع الأرباح الشهرية"
        actions={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDialog({ kind: "partner" })}
            >
              <UserPlus size={18} />
              شريك جديد
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDialog({ kind: "distribute" })}
              disabled={!summary || summary.alreadyDistributed}
            >
              <Share2 size={18} />
              توزيع أرباح الشهر
            </button>
          </>
        }
      />

      <div className="card mb-4 max-w-xs p-4">
        <label className="field-label" htmlFor="partners-month">
          الشهر
        </label>
        <input
          id="partners-month"
          type="month"
          className="field-input"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </div>

      {error || actionError ? (
        <Alert message={(error as Error | undefined)?.message || actionError} />
      ) : null}

      {isLoading || !summary ? (
        error ? null : (
          <div className="card">
            <Loading />
          </div>
        )
      ) : (
        <>
          {!summary.equityComplete ? (
            <div className="mb-4">
              <Alert
                message={`مجموع نسب الملكية للشركاء النشطين هو ${formatNumber(summary.totalEquityPercent)}% ويجب أن يصل إلى 100% قبل توزيع الأرباح.`}
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="صافي ربح الشهر"
              value={formatMoney(summary.netProfit)}
              hint={summary.period.label}
              icon={<PiggyBank size={20} />}
              tone={summary.netProfit >= 0 ? "success" : "danger"}
            />
            <StatCard
              label="القابل للتوزيع"
              value={formatMoney(summary.distributable)}
              hint={
                summary.alreadyDistributed
                  ? `تم توزيع ${formatMoney(summary.distributedAmount)}`
                  : "لم يُوزَّع بعد"
              }
              icon={<Share2 size={20} />}
            />
            <StatCard
              label="رواتب الشركاء"
              value={formatMoney(summary.partnerSalariesTotal)}
              hint="شهرياً — تُسجَّل مع توليد المصروفات"
              icon={<Wallet size={20} />}
            />
            <StatCard
              label="مجموع الحصص"
              value={`${formatNumber(summary.totalEquityPercent)}%`}
              hint={
                summary.equityComplete ? "جاهز للتوزيع" : "يحتاج تعديلاً"
              }
              icon={<UserPlus size={20} />}
              tone={summary.equityComplete ? "success" : "warning"}
            />
          </div>

          {summary.alreadyDistributed ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn-ghost"
                onClick={undoDistribution}
                disabled={busy}
              >
                <RotateCcw size={16} />
                إلغاء توزيع الشهر
              </button>
            </div>
          ) : null}

          {summary.partners.length === 0 ? (
            <div className="card mt-4">
              <EmptyState message="أضف الشركاء ونسب ملكيتهم للبدء" />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {summary.partners.map((row) => (
                <article key={row.partner._id} className="card p-5">
                  <header className="mb-4 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {row.partner.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        حصة {formatPercent(row.partner.equityPercent / 100, 0)}
                        {!row.partner.active ? " · موقوف" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() =>
                        setDialog({ kind: "partner", partner: row.partner })
                      }
                    >
                      تعديل
                    </button>
                  </header>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-slate-500">الراتب الشهري</dt>
                      <dd className="font-semibold">
                        {row.partner.salary > 0
                          ? formatMoney(row.partner.salary)
                          : "بدون راتب"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">راتب هذا الشهر</dt>
                      <dd className="font-semibold">
                        {row.salaryThisMonth > 0
                          ? formatMoney(row.salaryThisMonth)
                          : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">إجمالي التوزيعات السابقة</dt>
                      <dd className="font-semibold">
                        {formatMoney(row.distributions)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="text-slate-500">
                      {summary.alreadyDistributed
                        ? "نصيب هذا الشهر (موزّع)"
                        : "نصيب متوقع هذا الشهر"}
                    </p>
                    <p className="text-lg font-bold text-slate-900">
                      {formatMoney(row.shareOfMonth)}
                    </p>
                    {row.partner.salary > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        بالإضافة إلى الراتب الشهري{" "}
                        {formatMoney(row.partner.salary)}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={dialog.kind === "partner"}
        title={
          dialog.kind === "partner" && dialog.partner
            ? "تعديل شريك"
            : "شريك جديد"
        }
        onClose={closeDialog}
      >
        {dialog.kind === "partner" ? (
          <PartnerForm
            partner={dialog.partner}
            onCancel={closeDialog}
            onSaved={async () => {
              closeDialog();
              await mutate();
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={dialog.kind === "distribute"}
        title="توزيع أرباح الشهر"
        onClose={closeDialog}
      >
        {summary ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              سيتم توزيع{" "}
              <strong>{formatMoney(summary.distributable)}</strong> على الشركاء
              النشطين حسب حصصهم لشهر {summary.period.label}.
            </p>
            {summary.partnerSalariesTotal > 0 ? (
              <p className="text-sm text-slate-500">
                رواتب الشركاء ({formatMoney(summary.partnerSalariesTotal)})
                مصروف تشغيلي منفصل وتُولَّد من صفحة المصروفات.
              </p>
            ) : null}
            {!summary.equityComplete ? (
              <Alert message="يجب أن يصل مجموع الحصص إلى 100% أولاً." />
            ) : null}
            {summary.netProfit <= 0 ? (
              <Alert message="لا يوجد ربح صافٍ قابل للتوزيع هذا الشهر." />
            ) : null}
            {actionError ? <Alert message={actionError} /> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={closeDialog}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  busy ||
                  !summary.equityComplete ||
                  summary.distributable <= 0
                }
                onClick={distribute}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                تأكيد التوزيع
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function PartnerForm({
  partner,
  onSaved,
  onCancel,
}: {
  partner?: Partner;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(partner);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: partner?.name ?? "",
    equityPercent: String(partner?.equityPercent ?? ""),
    hasSalary: (partner?.salary ?? 0) > 0,
    salary: String(partner?.salary && partner.salary > 0 ? partner.salary : ""),
    phone: partner?.phone ?? "",
    note: partner?.note ?? "",
    active: partner?.active ?? true,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(isEdit ? `/api/partners/${partner!._id}` : "/api/partners", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          equityPercent: Number(form.equityPercent || 0),
          salary: form.hasSalary ? Number(form.salary || 0) : 0,
          phone: form.phone,
          note: form.note,
          active: form.active,
        }),
      });
      onSaved();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Alert message={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">اسم الشريك</label>
          <input
            className="field-input"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </div>
        <div>
          <label className="field-label">نسبة الملكية %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="field-input"
            value={form.equityPercent}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                equityPercent: event.target.value,
              }))
            }
            required
          />
        </div>
        <div>
          <label className="field-label">الهاتف</label>
          <input
            className="field-input"
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </div>

        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.hasSalary}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  hasSalary: event.target.checked,
                }))
              }
              className="size-4 rounded border-slate-300"
            />
            يتقاضى راتباً شهرياً
          </label>
          {form.hasSalary ? (
            <div className="mt-3">
              <label className="field-label">مبلغ الراتب</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field-input"
                value={form.salary}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    salary: event.target.value,
                  }))
                }
                required={form.hasSalary}
                placeholder="مثال: 5000"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                يُنشأ تلقائياً كقالب مصروف شهري (رواتب) ويمكن توليده من صفحة
                المصروفات.
              </p>
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">ملاحظات</label>
          <input
            className="field-input"
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                active: event.target.checked,
              }))
            }
            className="size-4 rounded border-slate-300"
          />
          شريك نشط
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          حفظ
        </button>
      </div>
    </form>
  );
}
