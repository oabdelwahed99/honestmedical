import type { Types } from "mongoose";
import { isAdjustment, isInbound, type MovementType } from "@/lib/constants";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Replays every movement of a product in chronological order to rebuild the
 * "balance before / balance after" columns and the product's current quantity.
 * Used after a movement is edited or deleted so the ledger stays consistent.
 */
export async function recalculateProductLedger(
  productId: Types.ObjectId | string,
) {
  // Date inputs are day-only (stored at midnight) while some movements carry a
  // full timestamp, so same-day rows are replayed in the order they were entered.
  const dayOf = (value: Date) => Math.floor(new Date(value).getTime() / DAY_MS);
  const movements = (await Transaction.find({ product: productId })).sort(
    (a, b) =>
      dayOf(a.date) - dayOf(b.date) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

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
