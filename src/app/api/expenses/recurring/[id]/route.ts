import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  EXPENSE_BEHAVIORS,
  EXPENSE_CATEGORIES,
} from "@/lib/constants";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { RecurringExpense } from "@/models/RecurringExpense";
import type { RecurringExpense as RecurringExpenseType } from "@/lib/types";

const recurringPatch = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  label: z.string().trim().min(1, "أدخل وصف المصروف").optional(),
  amount: z.coerce.number().min(0, "المبلغ غير صالح").optional(),
  behavior: z.enum(EXPENSE_BEHAVIORS).optional(),
  paidTo: z.string().trim().optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  active: z.boolean().optional(),
  note: z.string().trim().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/expenses/recurring/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) {
      return errorResponse("معرّف القالب غير صالح", 400);
    }

    await connectToDatabase();

    const data = recurringPatch.parse(await request.json());

    const item = await RecurringExpense.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    ).lean();

    if (!item) return errorResponse("القالب غير موجود", 404);

    return NextResponse.json({
      recurring: toPlain<RecurringExpenseType>(item),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/expenses/recurring/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) {
      return errorResponse("معرّف القالب غير صالح", 400);
    }

    await connectToDatabase();

    const item = await RecurringExpense.findByIdAndDelete(id);
    if (!item) return errorResponse("القالب غير موجود", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
