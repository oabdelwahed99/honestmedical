import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PARTY_KINDS } from "@/lib/constants";

const PartySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, required: true, enum: PARTY_KINDS },
    phone: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

PartySchema.index({ kind: 1, name: 1 }, { unique: true });

export type PartyDoc = InferSchemaType<typeof PartySchema>;

export const Party: Model<PartyDoc> =
  (mongoose.models.Party as Model<PartyDoc>) ??
  mongoose.model<PartyDoc>("Party", PartySchema);
