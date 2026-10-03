import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError, toPlain } from "@/lib/api-helpers";
import { reverseProduction } from "@/lib/production";
import { StockError } from "@/lib/stock";
import type { ProductionRun as ProductionRunType } from "@/lib/types";

export async function POST(
  _request: NextRequest,
  context: RouteContext<"/api/packages/[id]/productions/[runId]/reverse">,
) {
  try {
    const { id, runId } = await context.params;
    if (!isValidObjectId(id) || !isValidObjectId(runId)) {
      return errorResponse("معرّف غير صالح", 400);
    }

    await connectToDatabase();
    const run = await reverseProduction(id, runId);

    return NextResponse.json({ run: toPlain<ProductionRunType>(run.toObject()) });
  } catch (error) {
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
