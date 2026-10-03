import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api-helpers";
import { recalculateProductLedger } from "@/lib/ledger";
import { Transaction } from "@/models/Transaction";

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/movements/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الحركة غير صالح", 400);

    await connectToDatabase();

    const existing = await Transaction.findById(id).lean();
    if (!existing) return errorResponse("الحركة غير موجودة", 404);
    if (existing.production) {
      return errorResponse(
        "هذه الحركة جزء من عملية تصنيع — ألغِ عملية التصنيع من صفحة المصنعات",
        409,
      );
    }
    if (existing.returnNote) {
      return errorResponse(
        "هذه الحركة جزء من اذن ارتجاع — احذف اذن الارتجاع من صفحة اذون الارتجاع",
        409,
      );
    }
    if (existing.invoice) {
      return errorResponse(
        "هذه الحركة جزء من فاتورة — احذف الفاتورة من صفحة الفواتير",
        409,
      );
    }

    const movement = await Transaction.findByIdAndDelete(id);
    if (!movement) return errorResponse("الحركة غير موجودة", 404);

    const quantity = await recalculateProductLedger(movement.product);

    return NextResponse.json({ ok: true, quantity });
  } catch (error) {
    return handleRouteError(error);
  }
}
