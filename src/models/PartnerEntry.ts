import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PARTNER_ENTRY_TYPES } from "@/lib/constants";

const PartnerEntrySchema = new Schema(
  {
    partner: {
      type: Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true,
    },
    partnerName: { type: String, required: true },
    type: { type: String, required: true, enum: PARTNER_ENTRY_TYPES },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    /** YYYY-MM for distribution entries; empty otherwise. */
    period: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

PartnerEntrySchema.index({ date: -1 });
PartnerEntrySchema.index({ type: 1, period: 1 });

export type PartnerEntryDoc = InferSchemaType<typeof PartnerEntrySchema>;

export const PartnerEntry: Model<PartnerEntryDoc> =
  (mongoose.models.PartnerEntry as Model<PartnerEntryDoc>) ??
  mongoose.model<PartnerEntryDoc>("PartnerEntry", PartnerEntrySchema);
