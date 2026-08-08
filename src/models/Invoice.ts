import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { INVOICE_STATUSES, UNITS } from "@/lib/constants";

const InvoiceItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String, required: true },
    unit: { type: String, required: true, enum: UNITS },
    quantity: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const InvoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    customerName: { type: String, required: true, trim: true },
    items: { type: [InvoiceItemSchema], required: true, default: [] },
    subtotal: { type: Number, required: true, default: 0, min: 0 },
    discount: { type: Number, required: true, default: 0, min: 0 },
    total: { type: Number, required: true, default: 0, min: 0 },
    cogs: { type: Number, required: true, default: 0, min: 0 },
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      required: true,
      enum: INVOICE_STATUSES,
      default: "unpaid",
    },
    note: { type: String, default: "", trim: true },
    movements: [
      {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
  },
  { timestamps: true },
);

InvoiceSchema.index({ date: -1 });
InvoiceSchema.index({ customerName: 1 });
InvoiceSchema.index({ status: 1 });

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema>;

export const Invoice: Model<InvoiceDoc> =
  (mongoose.models.Invoice as Model<InvoiceDoc>) ??
  mongoose.model<InvoiceDoc>("Invoice", InvoiceSchema);
