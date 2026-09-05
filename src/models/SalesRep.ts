import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const SalesRepSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SalesRepSchema.index({ name: 1 }, { unique: true });
SalesRepSchema.index({ active: 1 });

export type SalesRepDoc = InferSchemaType<typeof SalesRepSchema>;

export const SalesRep: Model<SalesRepDoc> =
  (mongoose.models.SalesRep as Model<SalesRepDoc>) ??
  mongoose.model<SalesRepDoc>("SalesRep", SalesRepSchema);
