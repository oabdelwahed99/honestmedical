import type { Types } from "mongoose";
import { RecurringExpense } from "@/models/RecurringExpense";

/**
 * Keeps a partner's monthly salary in sync as a recurring salary expense.
 * salary <= 0 or inactive partner → deactivate the linked template.
 */
export async function syncPartnerSalary(partner: {
  _id: Types.ObjectId | string;
  name: string;
  salary: number;
  active: boolean;
}) {
  const existing = await RecurringExpense.findOne({ partner: partner._id });

  if (!partner.active || partner.salary <= 0) {
    if (existing) {
      existing.active = false;
      existing.amount = partner.salary > 0 ? partner.salary : existing.amount;
      existing.label = `راتب الشريك: ${partner.name}`;
      existing.paidTo = partner.name;
      await existing.save();
    }
    return existing;
  }

  if (existing) {
    existing.category = "salary";
    existing.label = `راتب الشريك: ${partner.name}`;
    existing.amount = partner.salary;
    existing.behavior = "fixed";
    existing.paidTo = partner.name;
    existing.active = true;
    existing.dayOfMonth = existing.dayOfMonth || 1;
    existing.note = "راتب شريك — يُولَّد مع المصروفات الشهرية";
    await existing.save();
    return existing;
  }

  return RecurringExpense.create({
    category: "salary",
    label: `راتب الشريك: ${partner.name}`,
    amount: partner.salary,
    behavior: "fixed",
    paidTo: partner.name,
    dayOfMonth: 1,
    active: true,
    note: "راتب شريك — يُولَّد مع المصروفات الشهرية",
    partner: partner._id,
  });
}
