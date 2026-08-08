import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { PartnerEntry } from "@/models/PartnerEntry";
import type { PartnerEntry as PartnerEntryType } from "@/lib/types";

/** Lists distribution history. Capital/withdrawal entries are no longer used. */
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = { type: "distribution" };

    const partnerId = params.get("partnerId");
    if (partnerId && isValidObjectId(partnerId)) filter.partner = partnerId;

    const period = params.get("period")?.trim();
    if (period) filter.period = period;

    const entries = await PartnerEntry.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({
      entries: toPlain<PartnerEntryType[]>(entries),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  return errorResponse(
    "إضافة رأس المال والمسحوبات لم تعد مدعومة. استخدم توزيع الأرباح.",
    410,
  );
}
