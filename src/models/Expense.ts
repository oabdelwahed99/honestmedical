import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPENSE_BEHAVIORS, EXPENSE_CATEGORIES } from "@/lib/constants";

const ExpenseSchema = new Schema(
  {
    category: { type: String, required: true, enum: EXPENSE_CATEGORIES },
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    behavior: { type: String, required: true, enum: EXPENSE_BEHAVIORS },
    paidTo: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    recurring: {
      type: Schema.Types.ObjectId,
      ref: "RecurringExpense",
      default: null,
    },
    partner: {
      type: Schema.Types.ObjectId,
      ref: "Partner",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ recurring: 1, date: 1 });

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema>;

export const Expense: Model<ExpenseDoc> =
  (mongoose.models.Expense as Model<ExpenseDoc>) ??
  mongoose.model<ExpenseDoc>("Expense", ExpenseSchema);
