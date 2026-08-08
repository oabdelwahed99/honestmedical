import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseBehavior,
  type ExpenseCategory,
} from "@/lib/constants";
import type { Period } from "@/lib/period";
import type {
  AccountingSummary,
  Breakeven,
  ExpenseBreakdownRow,
  Insight,
} from "@/lib/types";
import { Expense } from "@/models/Expense";
import { Invoice } from "@/models/Invoice";
import { Transaction } from "@/models/Transaction";

type MovementAgg = {
  salesTotal: number;
  returnsTotal: number;
  salesCogs: number;
  returnsCogs: number;
  writeOffs: number;
};

type ExpenseAgg = {
  total: number;
  fixed: number;
  variable: number;
  byCategory: Record<string, { amount: number; behavior: ExpenseBehavior }>;
};

async function aggregateMovements(
  start: Date,
  end: Date,
): Promise<MovementAgg> {
  const rows = await Transaction.aggregate<{
    _id: string;
    total: number;
    cogs: number;
  }>([
    { $match: { date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$total" },
        cogs: {
          $sum: { $multiply: ["$quantity", "$purchasePrice"] },
        },
      },
    },
  ]);

  const byType = Object.fromEntries(rows.map((row) => [row._id, row]));

  const sales = byType.sale ?? { total: 0, cogs: 0 };
  const returns = byType.return_in ?? { total: 0, cogs: 0 };
  const damaged = byType.damaged ?? { total: 0, cogs: 0 };
  const expired = byType.expired ?? { total: 0, cogs: 0 };
  const sample = byType.sample ?? { total: 0, cogs: 0 };

  return {
    salesTotal: sales.total,
    returnsTotal: returns.total,
    salesCogs: sales.cogs,
    returnsCogs: returns.cogs,
    writeOffs: damaged.cogs + expired.cogs + sample.cogs,
  };
}

async function aggregateExpenses(
  start: Date,
  end: Date,
): Promise<ExpenseAgg> {
  const expenses = await Expense.find({
    date: { $gte: start, $lte: end },
  }).lean();

  const result: ExpenseAgg = {
    total: 0,
    fixed: 0,
    variable: 0,
    byCategory: {},
  };

  for (const expense of expenses) {
    result.total += expense.amount;
    if (expense.behavior === "fixed") result.fixed += expense.amount;
    else result.variable += expense.amount;

    const key = expense.category as ExpenseCategory;
    if (!result.byCategory[key]) {
      result.byCategory[key] = {
        amount: 0,
        behavior: expense.behavior as ExpenseBehavior,
      };
    }
    result.byCategory[key].amount += expense.amount;
  }

  return result;
}

async function invoiceDiscounts(start: Date, end: Date): Promise<number> {
  const [row] = await Invoice.aggregate<{ total: number }>([
    { $match: { date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: "$discount" } } },
  ]);
  return row?.total ?? 0;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function buildBreakeven(input: {
  revenue: number;
  cogs: number;
  fixedCosts: number;
  variableExpenses: number;
  days: number;
}): { breakeven: Breakeven; reason: string | null } {
  const { revenue, cogs, fixedCosts, variableExpenses, days } = input;
  const variableCosts = cogs + variableExpenses;

  if (revenue <= 0) {
    return {
      breakeven: null,
      reason: "لا توجد إيرادات في هذه الفترة لحساب نقطة التعادل.",
    };
  }

  const contributionMargin = revenue - variableCosts;
  const contributionMarginRatio = contributionMargin / revenue;

  if (contributionMarginRatio <= 0) {
    return {
      breakeven: null,
      reason:
        "هامش المساهمة سالب أو صفري — التكاليف المتغيرة تتجاوز الإيرادات، لذا لا يمكن حساب نقطة تعادل.",
    };
  }

  const breakevenRevenue = fixedCosts / contributionMarginRatio;
  const marginOfSafety = revenue - breakevenRevenue;
  const progressPercent = Math.min(
    100,
    Math.max(0, (revenue / breakevenRevenue) * 100),
  );

  return {
    reason: null,
    breakeven: {
      fixedCosts,
      variableCosts,
      contributionMargin,
      contributionMarginRatio,
      breakevenRevenue,
      marginOfSafety,
      marginOfSafetyPercent: ratio(marginOfSafety, revenue) * 100,
      dailyTarget: breakevenRevenue / Math.max(1, days),
      progressPercent,
      reached: revenue >= breakevenRevenue,
    },
  };
}

function buildInsights(input: {
  revenue: number;
  previousRevenue: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  previousNetProfit: number;
  operatingExpenses: number;
  previousExpenses: number;
  writeOffs: number;
  expenseBreakdown: ExpenseBreakdownRow[];
  breakeven: Breakeven;
}): Insight[] {
  const insights: Insight[] = [];

  if (input.previousRevenue > 0) {
    const delta =
      ((input.revenue - input.previousRevenue) / input.previousRevenue) * 100;
    if (Math.abs(delta) >= 5) {
      insights.push({
        tone: delta >= 0 ? "success" : "warning",
        title: delta >= 0 ? "نمو في الإيرادات" : "تراجع في الإيرادات",
        body: `الإيرادات ${delta >= 0 ? "ارتفعت" : "انخفضت"} بنسبة ${Math.abs(delta).toFixed(1)}% مقارنة بالفترة السابقة.`,
      });
    }
  }

  if (input.revenue > 0 && input.grossMargin < 0.15) {
    insights.push({
      tone: "warning",
      title: "هامش إجمالي منخفض",
      body: `الهامش الإجمالي ${(input.grossMargin * 100).toFixed(1)}% — راجع أسعار البيع أو تكلفة الشراء.`,
    });
  } else if (input.revenue > 0 && input.grossMargin >= 0.3) {
    insights.push({
      tone: "success",
      title: "هامش إجمالي جيد",
      body: `الهامش الإجمالي ${(input.grossMargin * 100).toFixed(1)}% يعكس تسعيرًا سليمًا.`,
    });
  }

  if (input.netProfit < 0) {
    insights.push({
      tone: "danger",
      title: "خسارة صافية",
      body: `صافي الخسارة ${Math.abs(input.netProfit).toLocaleString("ar-EG")} ج.م — راجع المصروفات والهوامش.`,
    });
  } else if (input.netProfit > 0 && input.previousNetProfit > 0) {
    const delta =
      ((input.netProfit - input.previousNetProfit) / input.previousNetProfit) *
      100;
    if (Math.abs(delta) >= 10) {
      insights.push({
        tone: delta >= 0 ? "success" : "warning",
        title: delta >= 0 ? "تحسن في صافي الربح" : "تراجع في صافي الربح",
        body: `صافي الربح ${delta >= 0 ? "ارتفع" : "انخفض"} بنسبة ${Math.abs(delta).toFixed(1)}% عن الفترة السابقة.`,
      });
    }
  }

  if (input.previousExpenses > 0) {
    const delta =
      ((input.operatingExpenses - input.previousExpenses) /
        input.previousExpenses) *
      100;
    if (delta >= 15) {
      insights.push({
        tone: "warning",
        title: "ارتفاع في المصروفات",
        body: `المصروفات التشغيلية ارتفعت بنسبة ${delta.toFixed(1)}% عن الفترة السابقة.`,
      });
    }
  }

  if (input.writeOffs > 0 && input.revenue > 0) {
    const share = (input.writeOffs / input.revenue) * 100;
    if (share >= 3) {
      insights.push({
        tone: "warning",
        title: "هالك وانتهاء صلاحية مرتفع",
        body: `قيمة الهالك والعينات تمثل ${share.toFixed(1)}% من الإيرادات — راجع التخزين والصلاحية.`,
      });
    }
  }

  const top = input.expenseBreakdown[0];
  if (top && top.percent >= 40 && input.operatingExpenses > 0) {
    insights.push({
      tone: "info",
      title: `أكبر بند مصروف: ${top.label}`,
      body: `يمثل ${top.percent.toFixed(0)}% من المصروفات التشغيلية (${top.amount.toLocaleString("ar-EG")} ج.م).`,
    });
  }

  if (input.breakeven) {
    if (input.breakeven.reached) {
      insights.push({
        tone: "success",
        title: "تم تخطي نقطة التعادل",
        body: `هامش الأمان ${input.breakeven.marginOfSafetyPercent.toFixed(0)}% فوق نقطة التعادل.`,
      });
    } else {
      insights.push({
        tone: "danger",
        title: "تحت نقطة التعادل",
        body: `ينقصك ${Math.max(0, input.breakeven.breakevenRevenue - input.revenue).toLocaleString("ar-EG")} ج.م من الإيرادات للوصول لنقطة التعادل.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      tone: "info",
      title: "لا توجد تنبيهات بارزة",
      body: "الأرقام مستقرة نسبيًا مقارنة بالفترة السابقة.",
    });
  }

  return insights;
}

export async function buildAccountingSummary(
  period: Period,
): Promise<AccountingSummary> {
  const [currentMoves, previousMoves, currentExpenses, previousExpenses, discounts] =
    await Promise.all([
      aggregateMovements(period.start, period.end),
      aggregateMovements(period.previous.start, period.previous.end),
      aggregateExpenses(period.start, period.end),
      aggregateExpenses(period.previous.start, period.previous.end),
      invoiceDiscounts(period.start, period.end),
    ]);

  const previousDiscounts = await invoiceDiscounts(
    period.previous.start,
    period.previous.end,
  );

  const revenue =
    currentMoves.salesTotal - currentMoves.returnsTotal - discounts;
  const cogs = currentMoves.salesCogs - currentMoves.returnsCogs;
  const grossProfit = revenue - cogs;
  const writeOffs = currentMoves.writeOffs;
  const operatingExpenses = currentExpenses.total + writeOffs;
  const netProfit = grossProfit - operatingExpenses;

  const previousRevenue =
    previousMoves.salesTotal - previousMoves.returnsTotal - previousDiscounts;
  const previousCogs = previousMoves.salesCogs - previousMoves.returnsCogs;
  const previousGross = previousRevenue - previousCogs;
  const previousOps = previousExpenses.total + previousMoves.writeOffs;
  const previousNet = previousGross - previousOps;

  const expenseBreakdown: ExpenseBreakdownRow[] = Object.entries(
    currentExpenses.byCategory,
  )
    .map(([category, row]) => ({
      category: category as ExpenseCategory,
      label: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory],
      amount: row.amount,
      behavior: row.behavior,
      percent:
        operatingExpenses > 0
          ? (row.amount / operatingExpenses) * 100
          : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  if (writeOffs > 0) {
    expenseBreakdown.push({
      category: "other",
      label: "هالك / صلاحية / عينات",
      amount: writeOffs,
      behavior: "variable",
      percent:
        operatingExpenses > 0 ? (writeOffs / operatingExpenses) * 100 : 0,
    });
    expenseBreakdown.sort((a, b) => b.amount - a.amount);
  }

  const { breakeven, reason } = buildBreakeven({
    revenue,
    cogs,
    fixedCosts: currentExpenses.fixed,
    variableExpenses: currentExpenses.variable + writeOffs,
    days: period.days,
  });

  const insights = buildInsights({
    revenue,
    previousRevenue,
    grossProfit,
    grossMargin: ratio(grossProfit, revenue),
    netProfit,
    netMargin: ratio(netProfit, revenue),
    previousNetProfit: previousNet,
    operatingExpenses,
    previousExpenses: previousOps,
    writeOffs,
    expenseBreakdown,
    breakeven,
  });

  return {
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      days: period.days,
      label: period.label,
      month: period.month,
      previousLabel: period.previous.label,
    },
    revenue,
    salesTotal: currentMoves.salesTotal,
    returnsTotal: currentMoves.returnsTotal,
    invoiceDiscounts: discounts,
    cogs,
    grossProfit,
    grossMargin: ratio(grossProfit, revenue),
    writeOffs,
    expensesTotal: currentExpenses.total,
    operatingExpenses,
    netProfit,
    netMargin: ratio(netProfit, revenue),
    expenseBreakdown,
    breakeven,
    breakevenUnavailableReason: reason,
    previous: {
      revenue: previousRevenue,
      grossProfit: previousGross,
      netProfit: previousNet,
      operatingExpenses: previousOps,
    },
    insights,
  };
}
