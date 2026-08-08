import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api-helpers";
import { buildAccountingSummary } from "@/lib/accounting";
import { resolvePeriod } from "@/lib/period";

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

    const summary = await buildAccountingSummary(period);
    return NextResponse.json({ summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
