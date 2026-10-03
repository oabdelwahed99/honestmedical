import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api-helpers";
import { refreshInvoices } from "@/lib/accounts";
import { getSessionUser } from "@/lib/session";
import { Payment } from "@/models/Payment";

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/payments/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف السند غير صالح", 400);

    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();

    const payment = await Payment.findByIdAndDelete(id);
    if (!payment) return errorResponse("السند غير موجود", 404);

    await refreshInvoices(
      payment.allocations.map((allocation) => allocation.invoice),
      user,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
