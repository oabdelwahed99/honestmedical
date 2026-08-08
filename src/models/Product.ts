import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { UNITS } from "@/lib/constants";

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, enum: UNITS },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    salePrice: { type: Number, required: true, default: 0, min: 0 },
    expiryDate: { type: Date, default: null },
    lowStockThreshold: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

ProductSchema.index({ name: 1, unit: 1 }, { unique: true });

export type ProductDoc = InferSchemaType<typeof ProductSchema>;

export const Product: Model<ProductDoc> =
  (mongoose.models.Product as Model<ProductDoc>) ??
  mongoose.model<ProductDoc>("Product", ProductSchema);
