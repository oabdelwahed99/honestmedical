import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { refreshInvoices } from "@/lib/accounts";
import { MOVEMENT_LABELS, isInbound, type MovementType } from "@/lib/constants";
import { recalculateProductLedger } from "@/lib/ledger";
import { getSessionUser } from "@/lib/session";
import { Product } from "@/models/Product";
import { ReturnNote } from "@/models/ReturnNote";
import { Transaction } from "@/models/Transaction";
import type { ReturnNote as ReturnNoteType } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/returns/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الاذن غير صالح", 400);

    await connectToDatabase();

    const note = await ReturnNote.findById(id).lean();
    if (!note) return errorResponse("اذن الارتجاع غير موجود", 404);

    return NextResponse.json({ returnNote: toPlain<ReturnNoteType>(note) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/returns/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الاذن غير صالح", 400);

    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();

    const note = await ReturnNote.findById(id);
    if (!note) return errorResponse("اذن الارتجاع غير موجود", 404);

    const movements = await Transaction.find({ returnNote: note._id });

    // Undoing inbound rows removes stock; it must still be on hand.
    const needed = new Map<string, { quantity: number; type: MovementType }>();
    for (const movement of movements) {
      const type = movement.type as MovementType;
      if (!isInbound(type)) continue;
      const key = String(movement.product);
      const row = needed.get(key) ?? { quantity: 0, type };
      row.quantity += movement.quantity;
      needed.set(key, row);
    }
    if (needed.size > 0) {
      const products = await Product.find({ _id: { $in: [...needed.keys()] } });
      for (const product of products) {
        const row = needed.get(String(product._id))!;
        if (product.quantity < row.quantity) {
          return errorResponse(
            `لا يمكن حذف الاذن: رصيد "${product.name}" (${product.quantity}) أقل من كمية "${MOVEMENT_LABELS[row.type]}" (${row.quantity})`,
            409,
          );
        }
      }
    }

    const productIds = [
      ...new Set(movements.map((movement) => String(movement.product))),
    ];

    await Transaction.deleteMany({ returnNote: note._id });
    await ReturnNote.deleteOne({ _id: note._id });

    for (const productId of productIds) {
      await recalculateProductLedger(productId);
    }
    await refreshInvoices([note.invoice], user);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
