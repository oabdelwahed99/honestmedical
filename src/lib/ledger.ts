import type { Types } from "mongoose";
import { isAdjustment, isInbound, type MovementType } from "@/lib/constants";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";

/**
 * Replays every movement of a product in chronological order to rebuild the
 * "balance before / balance after" columns and the product's current quantity.
 * Used after a movement is edited or deleted so the ledger stays consistent.
 */
export async function recalculateProductLedger(
  productId: Types.ObjectId | string,
) {
  const movements = await Transaction.find({ product: productId }).sort({
    date: 1,
    createdAt: 1,
  });

  let running = 0;

  for (const movement of movements) {
    const before = running;
    let quantity = movement.quantity;
    const type = movement.type as MovementType;

    if (isAdjustment(type)) {
      // An adjustment records a counted quantity, so its result is absolute
      // and its "quantity" column is the size of the correction it applied.
      running = movement.balanceAfter;
      quantity = Math.abs(running - before);
    } else if (isInbound(type)) {
      running = before + quantity;
    } else {
      running = Math.max(0, before - quantity);
    }

    if (
      movement.balanceBefore !== before ||
      movement.balanceAfter !== running ||
      movement.quantity !== quantity
    ) {
      movement.balanceBefore = before;
      movement.balanceAfter = running;
      movement.quantity = quantity;
      await movement.save();
    }
  }

  await Product.updateOne({ _id: productId }, { $set: { quantity: running } });

  return running;
}
