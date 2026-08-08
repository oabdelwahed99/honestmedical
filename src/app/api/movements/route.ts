import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { MOVEMENT_TYPES, type MovementType } from "@/lib/constants";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { recordMovement, StockError } from "@/lib/stock";
import { Transaction } from "@/models/Transaction";
import type { Movement } from "@/lib/types";

const movementInput = z.object({
  productId: z.string().refine(isValidObjectId, "اختر صنفاً صحيحاً"),
  type: z.enum(MOVEMENT_TYPES),
  // For an adjustment this is the counted quantity, not a delta.
  quantity: z.coerce.number().min(0, "الكمية غير صالحة"),
  date: z.string().optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  expiryDate: z.string().nullable().optional(),
  partyName: z
    .string()
    .trim()
    .min(1, "أدخل اسم العميل أو المورد"),
  note: z.string().trim().default(""),
  updateProductPrices: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};

    const productId = params.get("productId");
    if (productId && isValidObjectId(productId)) filter.product = productId;

    const type = params.get("type");
    if (type && MOVEMENT_TYPES.includes(type as MovementType)) {
      filter.type = type;
    }

    const search = params.get("search")?.trim();
    if (search) {
      filter.productName = { $regex: escapeRegex(search), $options: "i" };
    }

    const party = params.get("party")?.trim();
    if (party) {
      filter.partyName = { $regex: escapeRegex(party), $options: "i" };
    }

    const from = params.get("from");
    const to = params.get("to");
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      filter.date = range;
    }

    const limit = Math.min(Number(params.get("limit")) || 200, 500);

    const movements = await Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ movements: toPlain<Movement[]>(movements) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = movementInput.parse(await request.json());

    const movement = await recordMovement({
      productId: data.productId,
      type: data.type,
      quantity: data.quantity,
      date: data.date ? new Date(data.date) : undefined,
      purchasePrice: data.purchasePrice,
      salePrice: data.salePrice,
      expiryDate:
        data.expiryDate === undefined
          ? undefined
          : data.expiryDate
            ? new Date(data.expiryDate)
            : null,
      partyName: data.partyName,
      note: data.note,
      updateProductPrices: data.updateProductPrices,
    });

    return NextResponse.json(
      { movement: toPlain<Movement>(movement.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
