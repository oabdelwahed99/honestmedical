import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError, toPlain } from "@/lib/api-helpers";
import { producePackage } from "@/lib/production";
import { StockError } from "@/lib/stock";
import type { ProductionRun as ProductionRunType } from "@/lib/types";

const produceInput = z.object({
  quantity: z.coerce.number().gt(0, "عدد الوحدات المصنّعة يجب أن يكون أكبر من صفر"),
  date: z.string().optional(),
  note: z.string().trim().default(""),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/packages/[id]/produce">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصنّع غير صالح", 400);

    await connectToDatabase();
    const data = produceInput.parse(await request.json());

    const run = await producePackage({
      recipeId: id,
      quantity: data.quantity,
      date: data.date ? new Date(data.date) : undefined,
      note: data.note,
    });

    return NextResponse.json(
      { run: toPlain<ProductionRunType>(run.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
