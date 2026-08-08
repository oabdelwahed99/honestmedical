import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError, toPlain } from "@/lib/api-helpers";
import { clampDayOfMonth, resolvePeriod } from "@/lib/period";
import { Expense } from "@/models/Expense";
import { RecurringExpense } from "@/models/RecurringExpense";
import type { Expense as ExpenseType } from "@/lib/types";

const generateInput = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "صيغة الشهر غير صالحة. استخدم YYYY-MM"),
});

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const { month } = generateInput.parse(await request.json());
    const period = resolvePeriod({ month });

    const templates = await RecurringExpense.find({ active: true });
    const created: ExpenseType[] = [];
    let skipped = 0;

    for (const template of templates) {
      const already = await Expense.exists({
        recurring: template._id,
        date: { $gte: period.start, $lte: period.end },
      });

      if (already) {
        skipped += 1;
        continue;
      }

      const date = clampDayOfMonth(month, template.dayOfMonth);
      const expense = await Expense.create({
        category: template.category,
        label: template.label,
        amount: template.amount,
        date,
        behavior: template.behavior,
        paidTo: template.paidTo,
        note: template.note || `توليد تلقائي — ${period.label}`,
        recurring: template._id,
        partner: template.partner ?? null,
      });

      created.push(toPlain<ExpenseType>(expense.toObject()));
    }

    if (templates.length === 0) {
      return errorResponse("لا توجد قوالب نشطة لتوليد المصروفات", 422);
    }

    return NextResponse.json({
      created,
      skipped,
      month,
      message: `تم إنشاء ${created.length} مصروف، وتجاوز ${skipped} قالب موجود مسبقاً.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("YYYY-MM")) {
      return errorResponse(error.message, 422);
    }
    return handleRouteError(error);
  }
}
