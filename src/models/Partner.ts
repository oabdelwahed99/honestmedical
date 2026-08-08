import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PartnerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    equityPercent: { type: Number, required: true, min: 0, max: 100 },
    /** Monthly salary; 0 means this partner does not take a salary. */
    salary: { type: Number, default: 0, min: 0 },
    phone: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PartnerSchema.index({ name: 1 }, { unique: true });

export type PartnerDoc = InferSchemaType<typeof PartnerSchema>;

export const Partner: Model<PartnerDoc> =
  (mongoose.models.Partner as Model<PartnerDoc>) ??
  mongoose.model<PartnerDoc>("Partner", PartnerSchema);
