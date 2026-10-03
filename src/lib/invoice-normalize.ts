import type { DiscountType, InvoiceKind } from "@/lib/constants";
import type { Invoice as InvoiceType } from "@/lib/types";

/** Fills defaults for invoices saved before newer fields existed. */
export function normalizeInvoice(invoice: InvoiceType): InvoiceType {
  return {
    ...invoice,
    kind: (invoice.kind as InvoiceKind | undefined) ?? "sale",
    party: invoice.party ?? null,
    statementNumber: invoice.statementNumber ?? "",
    rep: invoice.rep ?? null,
    repName: invoice.repName ?? "",
    discountType: (invoice.discountType as DiscountType | undefined) ?? "amount",
    discountValue: invoice.discountValue ?? invoice.discount ?? 0,
    taxType: (invoice.taxType as DiscountType | undefined) ?? "amount",
    taxValue: invoice.taxValue ?? 0,
    tax: invoice.tax ?? 0,
    returnedTotal: invoice.returnedTotal ?? 0,
    items: (invoice.items ?? []).map((item) => ({
      ...item,
      expiryDate: item.expiryDate ?? null,
    })),
  };
}
