export const UNITS = [
  "قطعة",
  "زجاجة",
  "كيلو",
  "جركن",
  "علبة",
  "كرتونة",
] as const;

export type Unit = (typeof UNITS)[number];

export const MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "return_in",
  "return_out",
  "damaged",
  "expired",
  "sample",
  "adjustment",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase: "شراء",
  sale: "بيع",
  return_in: "مرتجع عميل",
  return_out: "مرتجع مورد",
  damaged: "هالك",
  expired: "انتهاء الصلاحية",
  sample: "عينات",
  adjustment: "تسوية جرد",
};

/** Stock increases (inbound). */
export const INBOUND_TYPES = ["purchase", "return_in"] as const;

/** Stock decreases (outbound). */
export const OUTBOUND_TYPES = [
  "sale",
  "return_out",
  "damaged",
  "expired",
  "sample",
] as const;

export function isInbound(type: MovementType): boolean {
  return (INBOUND_TYPES as readonly string[]).includes(type);
}

export function isOutbound(type: MovementType): boolean {
  return (OUTBOUND_TYPES as readonly string[]).includes(type);
}

export function isAdjustment(type: MovementType): boolean {
  return type === "adjustment";
}

/** Samples are always free; write-offs and returns use cost/refund value. */
export function movementTotal(
  type: MovementType,
  quantity: number,
  purchasePrice: number,
  salePrice: number,
): number {
  switch (type) {
    case "sale":
    case "return_in":
      return quantity * salePrice;
    case "purchase":
    case "return_out":
    case "damaged":
    case "expired":
      return quantity * purchasePrice;
    case "sample":
    case "adjustment":
      return 0;
  }
}

/** Label for the counterparty field — customer vs supplier by movement type. */
export function partyLabel(type: MovementType): string {
  switch (type) {
    case "purchase":
    case "return_out":
      return "اسم المورد";
    case "sale":
    case "return_in":
    case "sample":
      return "اسم العميل";
    default:
      return "اسم العميل / المورد";
  }
}

export function partyPlaceholder(type: MovementType): string {
  switch (type) {
    case "purchase":
    case "return_out":
      return "مثال: مورد النور";
    case "sale":
    case "return_in":
    case "sample":
      return "مثال: سوبر ماركت الأمل";
    default:
      return "اكتب الاسم للبحث لاحقاً";
  }
}

/** Days before the expiry date at which a product is flagged as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 30;

export const EXPENSE_CATEGORIES = [
  "salary",
  "rent",
  "utilities",
  "vehicle",
  "maintenance",
  "parking",
  "transport",
  "marketing",
  "government",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salary: "رواتب",
  rent: "إيجارات",
  utilities: "مرافق",
  vehicle: "صيانة سيارات",
  maintenance: "صيانة",
  parking: "مواقف",
  transport: "نقل ومواصلات",
  marketing: "تسويق",
  government: "رسوم حكومية",
  other: "أخرى",
};

export const EXPENSE_BEHAVIORS = ["fixed", "variable"] as const;

export type ExpenseBehavior = (typeof EXPENSE_BEHAVIORS)[number];

export const EXPENSE_BEHAVIOR_LABELS: Record<ExpenseBehavior, string> = {
  fixed: "ثابت",
  variable: "متغير",
};

/** Default cost behavior when creating an expense of a given category. */
export const DEFAULT_EXPENSE_BEHAVIOR: Record<
  ExpenseCategory,
  ExpenseBehavior
> = {
  salary: "fixed",
  rent: "fixed",
  utilities: "fixed",
  vehicle: "variable",
  maintenance: "variable",
  parking: "fixed",
  transport: "variable",
  marketing: "variable",
  government: "fixed",
  other: "variable",
};

export const INVOICE_STATUSES = ["paid", "partial", "unpaid"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "مدفوعة",
  partial: "جزئية",
  unpaid: "غير مدفوعة",
};

export const PARTNER_ENTRY_TYPES = ["distribution"] as const;

export type PartnerEntryType = (typeof PARTNER_ENTRY_TYPES)[number];

export const PARTNER_ENTRY_LABELS: Record<PartnerEntryType, string> = {
  distribution: "توزيع أرباح",
};
