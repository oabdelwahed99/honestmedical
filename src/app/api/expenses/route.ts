import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DEFAULT_EXPENSE_BEHAVIOR,
  EXPENSE_BEHAVIORS,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/constants";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { resolvePeriod } from "@/lib/period";
import { Expense } from "@/models/Expense";
import type { Expense as ExpenseType } from "@/lib/types";

const expenseInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { message: "اختر تصنيفاً صحيحاً" }),
  label: z.string().trim().min(1, "أدخل وصف المصروف"),
  amount: z.coerce.number().min(0, "المبلغ غير صالح"),
  date: z.string().optional(),
  behavior: z.enum(EXPENSE_BEHAVIORS).optional(),
  paidTo: z.string().trim().default(""),
  note: z.string().trim().default(""),
  recurring: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};

    const category = params.get("category");
    if (category && EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
      filter.category = category;
    }

    const behavior = params.get("behavior");
    if (behavior && EXPENSE_BEHAVIORS.includes(behavior as "fixed" | "variable")) {
      filter.behavior = behavior;
    }

    const search = params.get("search")?.trim();
    if (search) {
      filter.$or = [
        { label: { $regex: escapeRegex(search), $options: "i" } },
        { paidTo: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    try {
      const period = resolvePeriod({
        month: params.get("month"),
        from: params.get("from"),
        to: params.get("to"),
      });
      // Only apply a date filter when the caller asked for one explicitly or
      // when a month was provided. Bare GETs still return everything.
      if (params.get("month") || params.get("from") || params.get("to")) {
        filter.date = { $gte: period.start, $lte: period.end };
      }
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "فترة غير صالحة",
        422,
      );
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ expenses: toPlain<ExpenseType[]>(expenses) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = expenseInput.parse(await request.json());
    const behavior =
      data.behavior ?? DEFAULT_EXPENSE_BEHAVIOR[data.category];

    const expense = await Expense.create({
      category: data.category,
      label: data.label,
      amount: data.amount,
      date: data.date ? new Date(data.date) : new Date(),
      behavior,
      paidTo: data.paidTo,
      note: data.note,
      recurring: data.recurring ?? null,
    });

    return NextResponse.json(
      { expense: toPlain<ExpenseType>(expense.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
