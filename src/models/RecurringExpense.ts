import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPENSE_BEHAVIORS, EXPENSE_CATEGORIES } from "@/lib/constants";

const RecurringExpenseSchema = new Schema(
  {
    category: { type: String, required: true, enum: EXPENSE_CATEGORIES },
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    behavior: { type: String, required: true, enum: EXPENSE_BEHAVIORS },
    paidTo: { type: String, default: "", trim: true },
    dayOfMonth: { type: Number, required: true, min: 1, max: 28, default: 1 },
    active: { type: Boolean, default: true },
    note: { type: String, default: "", trim: true },
    /** Set when this template is a partner's salary. */
    partner: {
      type: Schema.Types.ObjectId,
      ref: "Partner",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

export type RecurringExpenseDoc = InferSchemaType<typeof RecurringExpenseSchema>;

export const RecurringExpense: Model<RecurringExpenseDoc> =
  (mongoose.models.RecurringExpense as Model<RecurringExpenseDoc>) ??
  mongoose.model<RecurringExpenseDoc>("RecurringExpense", RecurringExpenseSchema);
