import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ComponentSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    // Units consumed to make one package.
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const PackageRecipeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
    },
    components: { type: [ComponentSchema], default: [] },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

export type PackageRecipeDoc = InferSchemaType<typeof PackageRecipeSchema>;

export const PackageRecipe: Model<PackageRecipeDoc> =
  (mongoose.models.PackageRecipe as Model<PackageRecipeDoc>) ??
  mongoose.model<PackageRecipeDoc>("PackageRecipe", PackageRecipeSchema);
