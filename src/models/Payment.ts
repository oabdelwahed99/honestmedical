import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  PARTY_KINDS,
  PAYMENT_DIRECTIONS,
  PAYMENT_SOURCES,
} from "@/lib/constants";

const AllocationSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    invoiceNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const PaymentSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    party: {
      type: Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },
    partyName: { type: String, required: true, trim: true },
    partyKind: { type: String, required: true, enum: PARTY_KINDS },
    direction: { type: String, required: true, enum: PAYMENT_DIRECTIONS },
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    // Unallocated remainder stays on the account as an advance.
    allocations: { type: [AllocationSchema], default: [] },
    source: {
      type: String,
      required: true,
      enum: PAYMENT_SOURCES,
      default: "manual",
    },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

PaymentSchema.index({ "allocations.invoice": 1 });
PaymentSchema.index({ date: -1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof PaymentSchema>;

export const Payment: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) ??
  mongoose.model<PaymentDoc>("Payment", PaymentSchema);
