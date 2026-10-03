import Image from "next/image";
import { INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Invoice } from "@/lib/types";

const LOGO_SRC = "/honest-medical-logo.svg";

export function InvoicePrint({ invoice }: { invoice: Invoice }) {
  const kind = invoice.kind ?? "sale";
  const isPurchase = kind === "purchase";
  const returnedTotal = invoice.returnedTotal ?? 0;
  const remaining = Math.max(
    0,
    invoice.total - returnedTotal - invoice.amountPaid,
  );
  const discountLabel =
    invoice.discountType === "percent" && invoice.discountValue > 0
      ? `الخصم (${invoice.discountValue}%)`
      : "الخصم";
  const taxLabel =
    invoice.taxType === "percent" && invoice.taxValue > 0
      ? `الضريبة (${invoice.taxValue}%)`
      : "الضريبة";

  const meta: { label: string; value: string }[] = [
    { label: isPurchase ? "المورد" : "العميل", value: invoice.customerName },
    { label: "التاريخ", value: formatDate(invoice.date) },
    ...(isPurchase
      ? []
      : [
          { label: "رقم البيان", value: invoice.statementNumber || "—" },
          { label: "المندوب", value: invoice.repName || "—" },
        ]),
    { label: "الحالة", value: INVOICE_STATUS_LABELS[invoice.status] },
  ];

  return (
    <div className="invoice-print hidden print:block">
      {/* position: fixed repeats the watermark on every printed page. */}
      <div className="invoice-print-watermark" aria-hidden="true">
        <Image src={LOGO_SRC} alt="" width={420} height={420} loading="eager" />
      </div>

      <div className="relative z-10">
        <header className="flex items-center justify-between gap-6 border-b-2 border-brand-600 pb-5">
          <div className="flex items-center gap-3">
            <Image
              src={LOGO_SRC}
              alt="Honest Medical"
              width={64}
              height={64}
              loading="eager"
            />
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              Honest Medical
            </p>
          </div>
          <div className="text-left">
            <p className="text-2xl font-extrabold text-brand-700">
              {INVOICE_KIND_LABELS[kind]}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              رقم الفاتورة:{" "}
              <span className="font-bold text-slate-900" dir="ltr">
                {invoice.number}
              </span>
            </p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-3">
          {meta.map((entry) => (
            <div
              key={entry.label}
              className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2"
            >
              <p className="text-[11px] font-medium text-slate-500">
                {entry.label}
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {entry.value}
              </p>
            </div>
          ))}
        </section>

        <table className="invoice-print-items mt-6 w-full text-right text-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>الصنف</th>
              <th>الوحدة</th>
              <th>الكمية</th>
              <th>{isPurchase ? "سعر الشراء" : "السعر"}</th>
              {isPurchase ? <th>الصلاحية</th> : null}
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${item.product}-${index}`}>
                <td className="text-slate-500">{index + 1}</td>
                <td className="font-semibold text-slate-900">
                  {item.productName}
                </td>
                <td>{item.unit}</td>
                <td>{formatNumber(item.quantity)}</td>
                <td>
                  {formatMoney(isPurchase ? item.purchasePrice : item.salePrice)}
                </td>
                {isPurchase ? <td>{formatDate(item.expiryDate)}</td> : null}
                <td className="font-bold text-slate-900">
                  {formatMoney(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="invoice-print-avoid-break mt-6 flex items-start justify-between gap-6">
          <div className="flex-1">
            {invoice.note ? (
              <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                <p className="text-[11px] font-medium text-slate-500">ملاحظات</p>
                <p className="mt-1 text-sm text-slate-800">{invoice.note}</p>
              </div>
            ) : null}
          </div>

          <dl className="w-72 overflow-hidden rounded-lg border border-slate-200 text-sm">
            <div className="flex justify-between bg-white/70 px-4 py-2">
              <dt className="text-slate-500">المجموع</dt>
              <dd className="font-semibold">{formatMoney(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 bg-white/70 px-4 py-2">
              <dt className="text-slate-500">{discountLabel}</dt>
              <dd className="font-semibold">{formatMoney(invoice.discount)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 bg-white/70 px-4 py-2">
              <dt className="text-slate-500">{taxLabel}</dt>
              <dd className="font-semibold">{formatMoney(invoice.tax)}</dd>
            </div>
            <div className="invoice-print-total flex justify-between px-4 py-2.5 text-base">
              <dt className="font-bold">الصافي</dt>
              <dd className="font-extrabold">{formatMoney(invoice.total)}</dd>
            </div>
            {returnedTotal !== 0 ? (
              <div className="flex justify-between bg-white/70 px-4 py-2">
                <dt className="text-slate-500">المرتجع</dt>
                <dd className="font-semibold">{formatMoney(returnedTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-200 bg-white/70 px-4 py-2">
              <dt className="text-slate-500">المدفوع</dt>
              <dd className="font-semibold">
                {formatMoney(invoice.amountPaid)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 bg-white/70 px-4 py-2">
              <dt className="text-slate-500">المتبقي</dt>
              <dd className="font-semibold">{formatMoney(remaining)}</dd>
            </div>
          </dl>
        </section>

        <footer className="invoice-print-avoid-break mt-12 text-center">
          <div className="mx-auto mb-4 h-px w-40 bg-brand-600/40" />
          <p className="text-xl font-bold text-brand-700">
            شكراً لتعاملكم معنا
          </p>
          <p className="mt-1 text-xs text-slate-400">Honest Medical</p>
        </footer>
      </div>
    </div>
  );
}
