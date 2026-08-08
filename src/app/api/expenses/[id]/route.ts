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
import { Expense } from "@/models/Expense";
import type { Expense as ExpenseType } from "@/lib/types";

const expensePatch = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  label: z.string().trim().min(1, "أدخل وصف المصروف").optional(),
  amount: z.coerce.number().min(0, "المبلغ غير صالح").optional(),
  date: z.string().optional(),
  behavior: z.enum(EXPENSE_BEHAVIORS).optional(),
  paidTo: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/expenses/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصروف غير صالح", 400);

    await connectToDatabase();

    const expense = await Expense.findById(id).lean();
    if (!expense) return errorResponse("المصروف غير موجود", 404);

    return NextResponse.json({ expense: toPlain<ExpenseType>(expense) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/expenses/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصروف غير صالح", 400);

    await connectToDatabase();

    const data = expensePatch.parse(await request.json());
    const update: Record<string, unknown> = { ...data };
    if (data.date) update.date = new Date(data.date);

    const expense = await Expense.findByIdAndUpdate(id, { $set: update }, {
      new: true,
      runValidators: true,
    }).lean();

    if (!expense) return errorResponse("المصروف غير موجود", 404);

    return NextResponse.json({ expense: toPlain<ExpenseType>(expense) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/expenses/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصروف غير صالح", 400);

    await connectToDatabase();

    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) return errorResponse("المصروف غير موجود", 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
