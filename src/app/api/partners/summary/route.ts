import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError, toPlain } from "@/lib/api-helpers";
import { buildAccountingSummary } from "@/lib/accounting";
import { resolvePeriod } from "@/lib/period";
import { Expense } from "@/models/Expense";
import { Partner } from "@/models/Partner";
import { PartnerEntry } from "@/models/PartnerEntry";
import type {
  Partner as PartnerType,
  PartnerBalance,
  PartnerSummary,
} from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    let period;
    try {
      period = resolvePeriod({
        month: params.get("month"),
        from: params.get("from"),
        to: params.get("to"),
      });
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "فترة غير صالحة",
        422,
      );
    }

    const partners = await Partner.find().sort({ active: -1, name: 1 }).lean();
    const entries = await PartnerEntry.find({ type: "distribution" }).lean();
    const salaryExpenses = await Expense.find({
      partner: { $ne: null },
      category: "salary",
      date: { $gte: period.start, $lte: period.end },
    }).lean();

    const accounting = await buildAccountingSummary(period);
    const monthKey = period.month;

    const distributionEntries = monthKey
      ? entries.filter((entry) => entry.period === monthKey)
      : [];

    const alreadyDistributed = distributionEntries.length > 0;
    const distributedAmount = distributionEntries.reduce(
      (sum, entry) => sum + entry.amount,
      0,
    );

    const activePartners = partners.filter((partner) => partner.active);
    const totalEquityPercent = activePartners.reduce(
      (sum, partner) => sum + partner.equityPercent,
      0,
    );
    const equityComplete = Math.abs(totalEquityPercent - 100) < 0.01;

    const balances: PartnerBalance[] = partners.map((partner) => {
      const partnerEntries = entries.filter(
        (entry) => String(entry.partner) === String(partner._id),
      );
      const distributions = partnerEntries.reduce(
        (sum, entry) => sum + entry.amount,
        0,
      );

      const salaryThisMonth = salaryExpenses
        .filter((expense) => String(expense.partner) === String(partner._id))
        .reduce((sum, expense) => sum + expense.amount, 0);

      const shareOfMonth = alreadyDistributed
        ? distributionEntries
            .filter((entry) => String(entry.partner) === String(partner._id))
            .reduce((sum, entry) => sum + entry.amount, 0)
        : equityComplete && partner.active
          ? (accounting.netProfit * partner.equityPercent) / 100
          : 0;

      return {
        partner: toPlain<PartnerType>({
          ...partner,
          salary: partner.salary ?? 0,
        }),
        distributions,
        shareOfMonth,
        salaryThisMonth,
      };
    });

    const partnerSalariesTotal = balances.reduce(
      (sum, row) => sum + (row.partner.active ? row.partner.salary : 0),
      0,
    );

    const summary: PartnerSummary = {
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        days: period.days,
        label: period.label,
        month: period.month,
      },
      partners: balances,
      totalEquityPercent,
      equityComplete,
      netProfit: accounting.netProfit,
      distributable: Math.max(0, accounting.netProfit),
      alreadyDistributed,
      distributedAmount,
      partnerSalariesTotal,
    };

    return NextResponse.json({ summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
