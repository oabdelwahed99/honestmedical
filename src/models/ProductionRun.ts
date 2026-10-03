import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { UNITS } from "@/lib/constants";

const ConsumedSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    unit: { type: String, required: true, enum: UNITS },
    quantityPerUnit: { type: Number, required: true },
    quantity: { type: Number, required: true },
    purchasePrice: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const ProductionRunSchema = new Schema(
  {
    recipe: {
      type: Schema.Types.ObjectId,
      ref: "PackageRecipe",
      required: true,
      index: true,
    },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    quantity: { type: Number, required: true, min: 0 },
    // Component cost of one package at the time of this run.
    unitCost: { type: Number, required: true, default: 0 },
    consumed: { type: [ConsumedSchema], default: [] },
    movements: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],
    note: { type: String, default: "", trim: true },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ProductionRunSchema.index({ recipe: 1, date: -1, createdAt: -1 });

export type ProductionRunDoc = InferSchemaType<typeof ProductionRunSchema>;

export const ProductionRun: Model<ProductionRunDoc> =
  (mongoose.models.ProductionRun as Model<ProductionRunDoc>) ??
  mongoose.model<ProductionRunDoc>("ProductionRun", ProductionRunSchema);
