import type {
  ExpenseBehavior,
  ExpenseCategory,
  InvoiceStatus,
  MovementType,
  PartnerEntryType,
  Unit,
} from "@/lib/constants";

/** Product as returned by the API (dates serialised to ISO strings). */
export type Product = {
  _id: string;
  name: string;
  unit: Unit;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  expiryDate: string | null;
  lowStockThreshold: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

/** One line of the stock ledger. */
export type Movement = {
  _id: string;
  product: string | null;
  productName: string;
  unit: Unit;
  type: MovementType;
  date: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  total: number;
  balanceBefore: number;
  balanceAfter: number;
  expiryDate: string | null;
  partyName: string;
  note: string;
  invoice: string | null;
  invoiceNumber: string;
  createdAt: string;
};

export type Stats = {
  productCount: number;
  totalUnits: number;
  stockValue: number;
  expectedRevenue: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  purchasesLast30Days: number;
  salesLast30Days: number;
  profitLast30Days: number;
};

export type ProductTypeTotals = {
  quantity: number;
  total: number;
  count: number;
};

export type ProductSummary = {
  /** Current units in stock. */
  quantity: number;
  stockValue: number;
  expectedRevenue: number;
  potentialProfit: number;
  lowStock: boolean;
  daysUntilExpiry: number | null;
  expiryStatus: "none" | "ok" | "soon" | "expired";
  /** Current stock counted as expired (all of quantity if batch expired). */
  unitsExpired: number;
  /** Current stock counted as expiring soon. */
  unitsExpiringSoon: number;
  /** Aggregates from the ledger by movement type. */
  byType: Partial<Record<MovementType, ProductTypeTotals>>;
  movementCount: number;
};

export type ProductDetails = {
  product: Product;
  summary: ProductSummary;
  recentMovements: Movement[];
};

export type Expense = {
  _id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  date: string;
  behavior: ExpenseBehavior;
  paidTo: string;
  note: string;
  recurring: string | null;
  partner: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecurringExpense = {
  _id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  behavior: ExpenseBehavior;
  paidTo: string;
  dayOfMonth: number;
  active: boolean;
  note: string;
  partner: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceItem = {
  product: string;
  productName: string;
  unit: Unit;
  quantity: number;
  salePrice: number;
  purchasePrice: number;
  total: number;
};

export type Invoice = {
  _id: string;
  number: string;
  date: string;
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  cogs: number;
  amountPaid: number;
  status: InvoiceStatus;
  note: string;
  movements: string[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseBreakdownRow = {
  category: ExpenseCategory;
  label: string;
  amount: number;
  behavior: ExpenseBehavior;
  percent: number;
};

export type Breakeven = {
  fixedCosts: number;
  variableCosts: number;
  contributionMargin: number;
  contributionMarginRatio: number;
  breakevenRevenue: number;
  marginOfSafety: number;
  marginOfSafetyPercent: number;
  dailyTarget: number;
  progressPercent: number;
  reached: boolean;
} | null;

export type Insight = {
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body: string;
};

export type AccountingSummary = {
  period: {
    start: string;
    end: string;
    days: number;
    label: string;
    month: string | null;
    previousLabel: string;
  };
  revenue: number;
  salesTotal: number;
  returnsTotal: number;
  invoiceDiscounts: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  writeOffs: number;
  expensesTotal: number;
  operatingExpenses: number;
  netProfit: number;
  netMargin: number;
  expenseBreakdown: ExpenseBreakdownRow[];
  breakeven: Breakeven;
  breakevenUnavailableReason: string | null;
  previous: {
    revenue: number;
    grossProfit: number;
    netProfit: number;
    operatingExpenses: number;
  };
  insights: Insight[];
};

export type Partner = {
  _id: string;
  name: string;
  equityPercent: number;
  salary: number;
  phone: string;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PartnerEntry = {
  _id: string;
  partner: string;
  partnerName: string;
  type: PartnerEntryType;
  amount: number;
  date: string;
  period: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerBalance = {
  partner: Partner;
  distributions: number;
  shareOfMonth: number;
  salaryThisMonth: number;
};

export type PartnerSummary = {
  period: {
    start: string;
    end: string;
    days: number;
    label: string;
    month: string | null;
  };
  partners: PartnerBalance[];
  totalEquityPercent: number;
  equityComplete: boolean;
  netProfit: number;
  distributable: number;
  alreadyDistributed: boolean;
  distributedAmount: number;
  partnerSalariesTotal: number;
};
