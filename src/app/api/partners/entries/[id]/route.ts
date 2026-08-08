import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api-helpers";
import { PartnerEntry } from "@/models/PartnerEntry";

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/partners/entries/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الحركة غير صالح", 400);

    await connectToDatabase();

    const entry = await PartnerEntry.findById(id);
    if (!entry) return errorResponse("الحركة غير موجودة", 404);

    if (entry.type === "distribution") {
      return errorResponse(
        "لا يمكن حذف توزيع فردي — استخدم إلغاء توزيع الشهر بالكامل.",
        422,
      );
    }

    await PartnerEntry.deleteOne({ _id: entry._id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
