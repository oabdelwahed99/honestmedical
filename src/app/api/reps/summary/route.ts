import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { resolvePeriod } from "@/lib/period";
import { Invoice } from "@/models/Invoice";
import { ReturnNote } from "@/models/ReturnNote";
import { SalesRep } from "@/models/SalesRep";
import type {
  SalesRep as SalesRepType,
  SalesRepSummary,
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

    const [reps, aggregates, returnRows] = await Promise.all([
      SalesRep.find().sort({ active: -1, name: 1 }).lean(),
      Invoice.aggregate<{
        _id: string | null;
        invoiceCount: number;
        salesTotal: number;
      }>([
        {
          $match: {
            date: { $gte: period.start, $lte: period.end },
            $or: [{ kind: "sale" }, { kind: { $exists: false } }],
            rep: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$rep",
            invoiceCount: { $sum: 1 },
            salesTotal: {
              $sum: { $subtract: ["$total", { $ifNull: ["$tax", 0] }] },
            },
          },
        },
      ]),
      // Customer returns reduce rep sales in the period the goods came back.
      ReturnNote.aggregate<{ _id: string | null; total: number }>([
        {
          $match: {
            direction: "customer",
            date: { $gte: period.start, $lte: period.end },
            rep: { $ne: null },
          },
        },
        { $group: { _id: "$rep", total: { $sum: "$revenueValue" } } },
      ]),
    ]);

    const byRep = new Map(
      aggregates.map((row) => [String(row._id), row]),
    );
    const returnsByRep = new Map(
      returnRows.map((row) => [String(row._id), row.total]),
    );

    const balances = toPlain<SalesRepType[]>(reps).map((rep) => {
      const row = byRep.get(rep._id);
      return {
        rep,
        invoiceCount: row?.invoiceCount ?? 0,
        salesTotal: (row?.salesTotal ?? 0) - (returnsByRep.get(rep._id) ?? 0),
      };
    });

    const totalSales = balances.reduce(
      (sum, row) => sum + row.salesTotal,
      0,
    );
    const invoiceCount = balances.reduce(
      (sum, row) => sum + row.invoiceCount,
      0,
    );

    const summary: SalesRepSummary = {
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        days: period.days,
        label: period.label,
        month: period.month,
      },
      reps: balances,
      totalSales,
      invoiceCount,
    };

    return NextResponse.json({ summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
