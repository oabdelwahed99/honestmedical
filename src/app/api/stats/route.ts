import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { EXPIRY_WARNING_DAYS } from "@/lib/constants";
import { handleRouteError } from "@/lib/api-helpers";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";
import type { Stats } from "@/lib/types";

export async function GET() {
  try {
    await connectToDatabase();

    const now = new Date();
    // A rolling window keeps the figures meaningful on the 1st of the month.
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 30);
    const warningLimit = new Date(now);
    warningLimit.setDate(warningLimit.getDate() + EXPIRY_WARNING_DAYS);

    const [totals] = await Product.aggregate<{
      productCount: number;
      totalUnits: number;
      stockValue: number;
      expectedRevenue: number;
    }>([
      {
        $group: {
          _id: null,
          productCount: { $sum: 1 },
          totalUnits: { $sum: "$quantity" },
          stockValue: {
            $sum: { $multiply: ["$quantity", "$purchasePrice"] },
          },
          expectedRevenue: {
            $sum: { $multiply: ["$quantity", "$salePrice"] },
          },
        },
      },
    ]);

    const [lowStockCount, expiringSoonCount, expiredCount] = await Promise.all([
      Product.countDocuments({
        $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
      }),
      Product.countDocuments({
        expiryDate: { $ne: null, $gte: now, $lte: warningLimit },
      }),
      Product.countDocuments({ expiryDate: { $ne: null, $lt: now } }),
    ]);

    const recent = await Transaction.aggregate<{
      _id: string;
      total: number;
    }>([
      { $match: { date: { $gte: windowStart } } },
      { $group: { _id: "$type", total: { $sum: "$total" } } },
    ]);

    const purchasesLast30Days =
      recent.find((row) => row._id === "purchase")?.total ?? 0;
    const salesLast30Days =
      recent.find((row) => row._id === "sale")?.total ?? 0;

    // Profit uses the purchase price captured on each sale line, not the
    // product's current price, so past margins stay accurate.
    const [profit] = await Transaction.aggregate<{ profit: number }>([
      { $match: { type: "sale", date: { $gte: windowStart } } },
      {
        $group: {
          _id: null,
          profit: {
            $sum: {
              $multiply: [
                "$quantity",
                { $subtract: ["$salePrice", "$purchasePrice"] },
              ],
            },
          },
        },
      },
    ]);

    const stats: Stats = {
      productCount: totals?.productCount ?? 0,
      totalUnits: totals?.totalUnits ?? 0,
      stockValue: totals?.stockValue ?? 0,
      expectedRevenue: totals?.expectedRevenue ?? 0,
      lowStockCount,
      expiringSoonCount,
      expiredCount,
      purchasesLast30Days,
      salesLast30Days,
      profitLast30Days: profit?.profit ?? 0,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    return handleRouteError(error);
  }
}
