import type { DiscountType, InvoiceKind } from "@/lib/constants";

export type InvoiceDraftLine = {
  key: string;
  productId: string;
  quantity: string;
  price: string;
  expiryDate: string;
};

export type InvoiceDraft = {
  kind: InvoiceKind;
  customerName: string;
  date: string;
  discountType: DiscountType;
  discountValue: string;
  amountPaid: string;
  note: string;
  repId: string;
  lines: InvoiceDraftLine[];
  savedAt: string;
};

function storageKey(kind: InvoiceKind) {
  return `invoice-draft:${kind}`;
}

export function loadInvoiceDraft(kind: InvoiceKind): InvoiceDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InvoiceDraft;
    if (!parsed || parsed.kind !== kind || !Array.isArray(parsed.lines)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveInvoiceDraft(draft: InvoiceDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(draft.kind),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearInvoiceDraft(kind: InvoiceKind) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(kind));
  } catch {
    // Ignore.
  }
}

/** True when the draft has meaningful content worth protecting. */
export function draftHasContent(draft: Pick<
  InvoiceDraft,
  "customerName" | "note" | "lines" | "discountValue" | "repId"
>): boolean {
  if (draft.customerName.trim()) return true;
  if (draft.note.trim()) return true;
  if (draft.repId) return true;
  if (Number(draft.discountValue || 0) > 0) return true;
  // Default empty lines use quantity "1" — that alone is not real content.
  return draft.lines.some(
    (line) =>
      Boolean(line.productId) ||
      Boolean(line.price?.trim()) ||
      Boolean(line.expiryDate),
  );
}
