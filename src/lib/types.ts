import type {
  DiscountType,
  ExpenseBehavior,
  ExpenseCategory,
  InvoiceKind,
  InvoiceStatus,
  MovementType,
  PartnerEntryType,
  PartyKind,
  PaymentDirection,
  PaymentSource,
  ReturnSettlement,
  Unit,
} from "@/lib/constants";
import type { UserRole } from "@/lib/auth-types";

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
  manufactured?: boolean;
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
  production?: string | null;
  returnNote?: string | null;
  createdAt: string;
};

export type PackageComponent = {
  product: string;
  quantity: number;
  /** Live values from the component product. */
  productName: string;
  unit: Unit | "";
  available: number;
  purchasePrice: number;
  missing: boolean;
};

export type PackageRecipe = {
  _id: string;
  name: string;
  note: string;
  product: Product;
  components: PackageComponent[];
  /** Current component cost of one package. */
  unitCost: number;
  /** Packages that can be made from current component stock. */
  maxProducible: number;
  productionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductionConsumed = {
  product: string;
  productName: string;
  unit: Unit;
  quantityPerUnit: number;
  quantity: number;
  purchasePrice: number;
};

export type ProductionRun = {
  _id: string;
  recipe: string;
  product: string;
  productName: string;
  date: string;
  quantity: number;
  unitCost: number;
  consumed: ProductionConsumed[];
  movements: string[];
  note: string;
  reversedAt: string | null;
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
  expiryDate: string | null;
};

export type Invoice = {
  _id: string;
  number: string;
  kind: InvoiceKind;
  date: string;
  customerName: string;
  party: string | null;
  statementNumber: string;
  rep: string | null;
  repName: string;
  items: InvoiceItem[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  taxType: DiscountType;
  taxValue: number;
  tax: number;
  total: number;
  cogs: number;
  amountPaid: number;
  /** Money effect of return notes against this invoice. */
  returnedTotal: number;
  status: InvoiceStatus;
  note: string;
  movements: string[];
  createdAt: string;
  updatedAt: string;
};

export type Party = {
  _id: string;
  name: string;
  kind: PartyKind;
  phone: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAllocation = {
  invoice: string;
  invoiceNumber: string;
  amount: number;
};

export type Payment = {
  _id: string;
  number: string;
  party: string;
  partyName: string;
  partyKind: PartyKind;
  direction: PaymentDirection;
  date: string;
  amount: number;
  allocations: PaymentAllocation[];
  source: PaymentSource;
  note: string;
  createdAt: string;
};

export type ReturnItem = {
  line: number;
  product: string;
  productName: string;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  total: number;
};

export type ReturnReplacement = {
  product: string;
  productName: string;
  unit: Unit;
  quantity: number;
  purchasePrice: number;
  total: number;
  expiryDate: string | null;
};

export type ReturnNote = {
  _id: string;
  number: string;
  direction: PartyKind;
  settlement: ReturnSettlement;
  date: string;
  party: string;
  partyName: string;
  invoice: string;
  invoiceNumber: string;
  statementNumber: string;
  rep: string | null;
  repName: string;
  items: ReturnItem[];
  goodsValue: number;
  revenueValue: number;
  moneyEffect: number;
  replacements: ReturnReplacement[];
  replacementValue: number;
  movements: string[];
  note: string;
  createdBy: string;
  createdAt: string;
};

export type ReturnLookupLine = {
  line: number;
  product: string;
  productName: string;
  unit: Unit;
  sold: number;
  returned: number;
  remaining: number;
  unitPrice: number;
  purchasePrice: number;
};

export type ReturnLookup = {
  invoice: Invoice;
  lines: ReturnLookupLine[];
  /** invoice.total / invoice.subtotal — spreads discount and tax over lines. */
  moneyRatio: number;
};

export type OpenInvoice = {
  _id: string;
  number: string;
  statementNumber: string;
  date: string;
  total: number;
  returnedTotal: number;
  amountPaid: number;
  remaining: number;
};

export type AccountTotals = {
  invoiceCount: number;
  invoiced: number;
  /** Net settling payments (receipts for customers, payments for suppliers). */
  paid: number;
  returned: number;
  /** Positive = customer owes us / we owe the supplier. */
  balance: number;
};

export type AccountRow = AccountTotals & {
  party: Party;
  lastActivity: string | null;
};

export type StatementEntry = {
  kind: "invoice" | "payment" | "return";
  id: string;
  number: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export type AccountDetails = {
  party: Party;
  totals: AccountTotals;
  statement: StatementEntry[];
  openInvoices: OpenInvoice[];
};

export type AuditAction = "update" | "delete";

export type AuditChange = {
  field: string;
  before: string | number | null;
  after: string | number | null;
};

export type InvoiceAuditEntry = {
  _id: string;
  action: AuditAction;
  invoice: string;
  invoiceNumber: string;
  invoiceKind: InvoiceKind;
  customerName: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
  };
  changes: AuditChange[];
  /** Full invoice as it was right before deletion. */
  snapshot: Invoice | null;
  createdAt: string;
};

export type SalesRep = {
  _id: string;
  name: string;
  phone: string;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SalesRepBalance = {
  rep: SalesRep;
  invoiceCount: number;
  salesTotal: number;
};

export type SalesRepSummary = {
  period: {
    start: string;
    end: string;
    days: number;
    label: string;
    month: string | null;
  };
  reps: SalesRepBalance[];
  totalSales: number;
  invoiceCount: number;
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
