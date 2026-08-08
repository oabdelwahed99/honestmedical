import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { MOVEMENT_TYPES, UNITS } from "@/lib/constants";

const TransactionSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Name and unit are copied in so the ledger keeps reading correctly even if
    // the product is later renamed or deleted.
    productName: { type: String, required: true },
    unit: { type: String, required: true, enum: UNITS },
    type: { type: String, required: true, enum: MOVEMENT_TYPES },
    date: { type: Date, required: true, default: Date.now },
    quantity: { type: Number, required: true },
    purchasePrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0 },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    expiryDate: { type: Date, default: null },
    // Customer or supplier name — required so movements can be filtered by party.
    partyName: { type: String, required: true, trim: true, default: "" },
    note: { type: String, default: "", trim: true },
    // Optional link back to an invoice that created this sale movement.
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
      index: true,
    },
    invoiceNumber: { type: String, default: "" },
  },
  { timestamps: true },
);

TransactionSchema.index({ date: -1, createdAt: -1 });
TransactionSchema.index({ partyName: 1 });

export type TransactionDoc = InferSchemaType<typeof TransactionSchema>;

export const Transaction: Model<TransactionDoc> =
  (mongoose.models.Transaction as Model<TransactionDoc>) ??
  mongoose.model<TransactionDoc>("Transaction", TransactionSchema);
