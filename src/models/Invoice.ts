import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  DISCOUNT_TYPES,
  INVOICE_KINDS,
  INVOICE_STATUSES,
  UNITS,
} from "@/lib/constants";

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
    expiryDate: { type: Date, default: null },
  },
  { _id: false },
);

const InvoiceSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    kind: {
      type: String,
      required: true,
      enum: INVOICE_KINDS,
      default: "sale",
      index: true,
    },
    date: { type: Date, required: true, default: Date.now },
    customerName: { type: String, required: true, trim: true },
    party: {
      type: Schema.Types.ObjectId,
      ref: "Party",
      default: null,
      index: true,
    },
    statementNumber: { type: String, default: "", trim: true },
    rep: {
      type: Schema.Types.ObjectId,
      ref: "SalesRep",
      default: null,
      index: true,
    },
    repName: { type: String, default: "", trim: true },
    items: { type: [InvoiceItemSchema], required: true, default: [] },
    subtotal: { type: Number, required: true, default: 0, min: 0 },
    discountType: {
      type: String,
      required: true,
      enum: DISCOUNT_TYPES,
      default: "amount",
    },
    discountValue: { type: Number, required: true, default: 0, min: 0 },
    discount: { type: Number, required: true, default: 0, min: 0 },
    taxType: {
      type: String,
      required: true,
      enum: DISCOUNT_TYPES,
      default: "amount",
    },
    taxValue: { type: Number, required: true, default: 0, min: 0 },
    tax: { type: Number, required: true, default: 0, min: 0 },
    total: { type: Number, required: true, default: 0, min: 0 },
    cogs: { type: Number, required: true, default: 0, min: 0 },
    // Sum of payment allocations; payments are the source of truth.
    amountPaid: { type: Number, required: true, default: 0, min: 0 },
    // Sum of return-note money effects; negative only via costlier exchanges.
    returnedTotal: { type: Number, required: true, default: 0 },
    // False until linked to a party and existing amountPaid moved to a payment.
    ledgerReady: { type: Boolean, default: false, index: true },
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
InvoiceSchema.index({ number: 1 });
// Partial so legacy sale invoices without a statement number don't collide.
InvoiceSchema.index(
  { statementNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "sale", statementNumber: { $gt: "" } },
  },
);

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema>;

// Mongoose keeps models across dev hot reloads; re-register so schema edits apply.
if (process.env.NODE_ENV !== "production" && mongoose.models.Invoice) {
  mongoose.deleteModel("Invoice");
}

export const Invoice: Model<InvoiceDoc> =
  (mongoose.models.Invoice as Model<InvoiceDoc>) ??
  mongoose.model<InvoiceDoc>("Invoice", InvoiceSchema);
