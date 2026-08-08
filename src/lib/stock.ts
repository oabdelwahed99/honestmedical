import type { Types } from "mongoose";
import {
  MOVEMENT_LABELS,
  isAdjustment,
  isInbound,
  isOutbound,
  movementTotal,
  type MovementType,
} from "@/lib/constants";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";

export class StockError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "StockError";
    this.status = status;
  }
}

export type RecordMovementInput = {
  productId: string | Types.ObjectId;
  type: MovementType;
  /** For an adjustment this is the counted quantity, not a delta. */
  quantity: number;
  date?: Date;
  purchasePrice?: number;
  salePrice?: number;
  expiryDate?: Date | null;
  partyName: string;
  note?: string;
  updateProductPrices?: boolean;
  invoiceId?: Types.ObjectId | string | null;
  invoiceNumber?: string;
};

export type RecordedMovement = {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  productName: string;
  unit: string;
  type: MovementType;
  date: Date;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  total: number;
  balanceBefore: number;
  balanceAfter: number;
  expiryDate: Date | null;
  partyName: string;
  note: string;
  invoice: Types.ObjectId | null;
  invoiceNumber: string;
  toObject: () => Record<string, unknown>;
};

/**
 * Atomically updates product stock and writes a ledger row.
 * On ledger failure the stock change is rolled back.
 * Throws StockError for business-rule failures (not found, insufficient stock).
 */
export async function recordMovement(
  input: RecordMovementInput,
): Promise<RecordedMovement> {
  const product = await Product.findById(input.productId);
  if (!product) throw new StockError("الصنف غير موجود", 404);

  if (!isAdjustment(input.type) && input.quantity <= 0) {
    throw new StockError("الكمية يجب أن تكون أكبر من صفر", 422);
  }

  // Samples are always free — ignore any price the client sent.
  const purchasePrice =
    input.type === "sample"
      ? product.purchasePrice
      : (input.purchasePrice ?? product.purchasePrice);
  const salePrice =
    input.type === "sample" ? 0 : (input.salePrice ?? product.salePrice);
  const expiryDate =
    input.expiryDate !== undefined
      ? input.expiryDate
      : (product.expiryDate ?? null);

  // Outbound decreases use a conditional atomic update so concurrent
  // records can never push the balance below zero.
  let updatedProduct;
  if (isOutbound(input.type)) {
    updatedProduct = await Product.findOneAndUpdate(
      { _id: product._id, quantity: { $gte: input.quantity } },
      { $inc: { quantity: -input.quantity } },
      { new: true },
    );
    if (!updatedProduct) {
      throw new StockError(
        `الرصيد المتاح (${product.quantity}) لا يكفي لتسجيل "${MOVEMENT_LABELS[input.type]}" بكمية ${input.quantity}`,
        409,
      );
    }
  } else if (isInbound(input.type)) {
    updatedProduct = await Product.findByIdAndUpdate(
      product._id,
      { $inc: { quantity: input.quantity } },
      { new: true },
    );
  } else {
    updatedProduct = await Product.findByIdAndUpdate(
      product._id,
      { $set: { quantity: input.quantity } },
      { new: true },
    );
  }

  if (!updatedProduct) throw new StockError("الصنف غير موجود", 404);

  const balanceAfter = updatedProduct.quantity;
  const balanceBefore = isAdjustment(input.type)
    ? product.quantity
    : isOutbound(input.type)
      ? balanceAfter + input.quantity
      : balanceAfter - input.quantity;

  const quantityMoved = isAdjustment(input.type)
    ? Math.abs(balanceAfter - balanceBefore)
    : input.quantity;

  const total = movementTotal(
    input.type,
    quantityMoved,
    purchasePrice,
    salePrice,
  );

  try {
    const movement = await Transaction.create({
      product: updatedProduct._id,
      productName: updatedProduct.name,
      unit: updatedProduct.unit,
      type: input.type,
      date: input.date ?? new Date(),
      quantity: quantityMoved,
      purchasePrice,
      salePrice,
      total,
      balanceBefore,
      balanceAfter,
      expiryDate,
      partyName: input.partyName,
      note: input.note ?? "",
      invoice: input.invoiceId ?? null,
      invoiceNumber: input.invoiceNumber ?? "",
    });

    if (input.updateProductPrices !== false && input.type !== "sample") {
      const priceUpdate: Record<string, unknown> = {};
      if (input.type === "purchase" && input.purchasePrice !== undefined) {
        priceUpdate.purchasePrice = input.purchasePrice;
      }
      if (input.type === "sale" && input.salePrice !== undefined) {
        priceUpdate.salePrice = input.salePrice;
      }
      if (input.type === "purchase" && input.expiryDate) {
        priceUpdate.expiryDate = expiryDate;
      }
      if (Object.keys(priceUpdate).length > 0) {
        await Product.updateOne(
          { _id: updatedProduct._id },
          { $set: priceUpdate },
        );
      }
    }

    return movement as unknown as RecordedMovement;
  } catch (error) {
    // Undo the stock change so the balance never drifts from the ledger.
    await Product.updateOne(
      { _id: updatedProduct._id },
      { $set: { quantity: product.quantity } },
    );
    throw error;
  }
}

/**
 * Deletes a movement document and restores the product quantity it applied.
 * Used when rolling back a partially-created invoice.
 */
export async function undoMovement(movementId: Types.ObjectId | string) {
  const movement = await Transaction.findById(movementId);
  if (!movement) return;

  const type = movement.type as MovementType;
  const qty = movement.quantity;

  if (isOutbound(type)) {
    await Product.updateOne(
      { _id: movement.product },
      { $inc: { quantity: qty } },
    );
  } else if (isInbound(type)) {
    await Product.updateOne(
      { _id: movement.product },
      { $inc: { quantity: -qty } },
    );
  } else {
    await Product.updateOne(
      { _id: movement.product },
      { $set: { quantity: movement.balanceBefore } },
    );
  }

  await Transaction.deleteOne({ _id: movement._id });
}
