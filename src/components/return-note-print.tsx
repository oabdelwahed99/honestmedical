import Image from "next/image";
import {
  RETURN_DIRECTION_LABELS,
  RETURN_SETTLEMENT_LABELS,
} from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { ReturnNote } from "@/lib/types";

const LOGO_SRC = "/honest-medical-logo.svg";

export function ReturnNotePrint({ note }: { note: ReturnNote }) {
  const isCustomer = note.direction === "customer";

  const meta: { label: string; value: string }[] = [
    { label: isCustomer ? "العميل" : "المورد", value: note.partyName },
    { label: "التاريخ", value: formatDate(note.date) },
    { label: "رقم الفاتورة", value: note.invoiceNumber },
    ...(isCustomer
      ? [
          { label: "رقم البيان", value: note.statementNumber || "—" },
          { label: "المندوب", value: note.repName || "—" },
        ]
      : []),
    { label: "التسوية", value: RETURN_SETTLEMENT_LABELS[note.settlement] },
  ];

  return (
    <div className="invoice-print hidden print:block">
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
              اذن ارتجاع · {RETURN_DIRECTION_LABELS[note.direction]}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              رقم الاذن:{" "}
              <span className="font-bold text-slate-900" dir="ltr">
                {note.number}
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
              <p className="text-[11px] font-medium text-slate-500">{entry.label}</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{entry.value}</p>
            </div>
          ))}
        </section>

        <table className="invoice-print-items mt-6 w-full text-right text-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>الصنف المرتجع</th>
              <th>الوحدة</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((item, index) => (
              <tr key={`${item.line}-${index}`}>
                <td className="text-slate-500">{index + 1}</td>
                <td className="font-semibold text-slate-900">{item.productName}</td>
                <td>{item.unit}</td>
                <td>{formatNumber(item.quantity)}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td className="font-bold text-slate-900">{formatMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {note.replacements.length > 0 ? (
          <table className="invoice-print-items mt-6 w-full text-right text-sm">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>البضاعة البديلة</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الشراء</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {note.replacements.map((row, index) => (
                <tr key={`${row.product}-${index}`}>
                  <td className="text-slate-500">{index + 1}</td>
                  <td className="font-semibold text-slate-900">{row.productName}</td>
                  <td>{row.unit}</td>
                  <td>{formatNumber(row.quantity)}</td>
                  <td>{formatMoney(row.purchasePrice)}</td>
                  <td className="font-bold text-slate-900">{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <section className="invoice-print-avoid-break mt-6 flex items-start justify-between gap-6">
          <div className="flex-1">
            {note.note ? (
              <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
                <p className="text-[11px] font-medium text-slate-500">ملاحظات</p>
                <p className="mt-1 text-sm text-slate-800">{note.note}</p>
              </div>
            ) : null}
          </div>
          <dl className="w-72 overflow-hidden rounded-lg border border-slate-200 text-sm">
            <div className="flex justify-between bg-white/70 px-4 py-2">
              <dt className="text-slate-500">قيمة البضاعة</dt>
              <dd className="font-semibold">{formatMoney(note.goodsValue)}</dd>
            </div>
            {note.settlement === "exchange" ? (
              <div className="flex justify-between border-t border-slate-200 bg-white/70 px-4 py-2">
                <dt className="text-slate-500">قيمة البدل</dt>
                <dd className="font-semibold">{formatMoney(note.replacementValue)}</dd>
              </div>
            ) : null}
            <div className="invoice-print-total flex justify-between px-4 py-2.5 text-base">
              <dt className="font-bold">أثر الحساب</dt>
              <dd className="font-extrabold">{formatMoney(note.moneyEffect)}</dd>
            </div>
          </dl>
        </section>

        <footer className="invoice-print-avoid-break mt-16 grid grid-cols-2 gap-12 text-center text-sm text-slate-600">
          <div>
            <div className="mx-auto mb-2 h-px w-40 bg-slate-400" />
            توقيع المستلم
          </div>
          <div>
            <div className="mx-auto mb-2 h-px w-40 bg-slate-400" />
            توقيع أمين المخزن
          </div>
        </footer>
      </div>
    </div>
  );
}
