import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { EXPIRY_WARNING_DAYS, MOVEMENT_TYPES, type MovementType } from "@/lib/constants";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";
import type {
  Movement,
  Product as ProductType,
  ProductDetails,
  ProductSummary,
  ProductTypeTotals,
} from "@/lib/types";

function buildSummary(
  product: ProductType,
  byType: Partial<Record<MovementType, ProductTypeTotals>>,
  movementCount: number,
): ProductSummary {
  const quantity = product.quantity;
  const stockValue = quantity * product.purchasePrice;
  const expectedRevenue = quantity * product.salePrice;

  let daysUntilExpiry: number | null = null;
  let expiryStatus: ProductSummary["expiryStatus"] = "none";

  if (product.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(product.expiryDate);
    expiry.setHours(0, 0, 0, 0);
    daysUntilExpiry = Math.round(
      (expiry.getTime() - today.getTime()) / 86_400_000,
    );

    if (daysUntilExpiry < 0) expiryStatus = "expired";
    else if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) expiryStatus = "soon";
    else expiryStatus = "ok";
  }

  return {
    quantity,
    stockValue,
    expectedRevenue,
    potentialProfit: expectedRevenue - stockValue,
    lowStock: quantity <= product.lowStockThreshold,
    daysUntilExpiry,
    expiryStatus,
    unitsExpired: expiryStatus === "expired" ? quantity : 0,
    unitsExpiringSoon: expiryStatus === "soon" ? quantity : 0,
    byType,
    movementCount,
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/products/[id]/details">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الصنف غير صالح", 400);

    await connectToDatabase();

    const product = await Product.findById(id).lean();
    if (!product) return errorResponse("الصنف غير موجود", 404);

    const plainProduct = toPlain<ProductType>(product);

    const [totals, recentMovements, movementCount] = await Promise.all([
      Transaction.aggregate<{
        _id: MovementType;
        quantity: number;
        total: number;
        count: number;
      }>([
        { $match: { product: product._id } },
        {
          $group: {
            _id: "$type",
            quantity: { $sum: "$quantity" },
            total: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.find({ product: id })
        .sort({ date: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      Transaction.countDocuments({ product: id }),
    ]);

    const byType: Partial<Record<MovementType, ProductTypeTotals>> = {};
    for (const type of MOVEMENT_TYPES) {
      byType[type] = { quantity: 0, total: 0, count: 0 };
    }
    for (const row of totals) {
      byType[row._id] = {
        quantity: row.quantity,
        total: row.total,
        count: row.count,
      };
    }

    const details: ProductDetails = {
      product: plainProduct,
      summary: buildSummary(plainProduct, byType, movementCount),
      recentMovements: toPlain<Movement[]>(recentMovements),
    };

    return NextResponse.json(details);
  } catch (error) {
    return handleRouteError(error);
  }
}
