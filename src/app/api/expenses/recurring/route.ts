import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DEFAULT_EXPENSE_BEHAVIOR,
  EXPENSE_BEHAVIORS,
  EXPENSE_CATEGORIES,
} from "@/lib/constants";
import { handleRouteError, toPlain } from "@/lib/api-helpers";
import { RecurringExpense } from "@/models/RecurringExpense";
import type { RecurringExpense as RecurringExpenseType } from "@/lib/types";

const recurringInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { message: "اختر تصنيفاً صحيحاً" }),
  label: z.string().trim().min(1, "أدخل وصف المصروف"),
  amount: z.coerce.number().min(0, "المبلغ غير صالح"),
  behavior: z.enum(EXPENSE_BEHAVIORS).optional(),
  paidTo: z.string().trim().default(""),
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  active: z.boolean().default(true),
  note: z.string().trim().default(""),
});

export async function GET() {
  try {
    await connectToDatabase();

    const recurring = await RecurringExpense.find()
      .sort({ active: -1, category: 1, label: 1 })
      .lean();

    return NextResponse.json({
      recurring: toPlain<RecurringExpenseType[]>(recurring),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = recurringInput.parse(await request.json());
    const behavior =
      data.behavior ?? DEFAULT_EXPENSE_BEHAVIOR[data.category];

    const item = await RecurringExpense.create({
      category: data.category,
      label: data.label,
      amount: data.amount,
      behavior,
      paidTo: data.paidTo,
      dayOfMonth: data.dayOfMonth,
      active: data.active,
      note: data.note,
    });

    return NextResponse.json(
      { recurring: toPlain<RecurringExpenseType>(item.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
