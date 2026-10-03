import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PARTY_KINDS, RETURN_SETTLEMENTS, UNITS } from "@/lib/constants";

const ReturnItemSchema = new Schema(
  {
    // Index into invoice.items; a product can appear on several lines.
    line: { type: Number, required: true, min: 0 },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    unit: { type: String, required: true, enum: UNITS },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const ReplacementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    unit: { type: String, required: true, enum: UNITS },
    quantity: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, default: null },
  },
  { _id: false },
);

const ReturnNoteSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    direction: { type: String, required: true, enum: PARTY_KINDS, index: true },
    settlement: { type: String, required: true, enum: RETURN_SETTLEMENTS },
    date: { type: Date, required: true, default: Date.now },
    party: {
      type: Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },
    partyName: { type: String, required: true, trim: true },
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    invoiceNumber: { type: String, required: true },
    statementNumber: { type: String, default: "" },
    rep: { type: Schema.Types.ObjectId, ref: "SalesRep", default: null },
    repName: { type: String, default: "" },
    items: { type: [ReturnItemSchema], required: true, default: [] },
    /** Returned lines at their raw invoice prices. */
    goodsValue: { type: Number, required: true, default: 0, min: 0 },
    /** Net-of-discount, pre-tax value removed from sales revenue. */
    revenueValue: { type: Number, required: true, default: 0, min: 0 },
    /** Reduces the party balance; negative when a replacement is worth more. */
    moneyEffect: { type: Number, required: true, default: 0 },
    replacements: { type: [ReplacementSchema], default: [] },
    replacementValue: { type: Number, required: true, default: 0, min: 0 },
    movements: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],
    note: { type: String, default: "", trim: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true },
);

ReturnNoteSchema.index({ date: -1, createdAt: -1 });

export type ReturnNoteDoc = InferSchemaType<typeof ReturnNoteSchema>;

export const ReturnNote: Model<ReturnNoteDoc> =
  (mongoose.models.ReturnNote as Model<ReturnNoteDoc>) ??
  mongoose.model<ReturnNoteDoc>("ReturnNote", ReturnNoteSchema);
