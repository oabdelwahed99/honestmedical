import { Types } from "mongoose";
import { recalculateProductLedger } from "@/lib/ledger";
import { recordMovement, StockError, undoMovement } from "@/lib/stock";
import type { PackageComponent, PackageRecipe as PackageView } from "@/lib/types";
import { PackageRecipe } from "@/models/PackageRecipe";
import { Product } from "@/models/Product";
import { ProductionRun } from "@/models/ProductionRun";
import { Transaction } from "@/models/Transaction";

export const PRODUCTION_PARTY = "تصنيع داخلي";

/** Avoids float noise such as 0.1 * 3 = 0.30000000000000004. */
export function roundQty(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type RecipeLean = {
  _id: Types.ObjectId;
  name: string;
  note: string;
  product: Types.ObjectId;
  components: { product: Types.ObjectId; quantity: number }[];
  createdAt: Date;
  updatedAt: Date;
};

/** Joins recipes with live component stock, cost, and production counts. */
export async function buildPackageViews(
  recipes: RecipeLean[],
): Promise<PackageView[]> {
  const productIds = new Set<string>();
  for (const recipe of recipes) {
    productIds.add(String(recipe.product));
    for (const component of recipe.components) {
      productIds.add(String(component.product));
    }
  }

  const [products, runCounts] = await Promise.all([
    Product.find({ _id: { $in: [...productIds] } }).lean(),
    ProductionRun.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          recipe: { $in: recipes.map((recipe) => recipe._id) },
          reversedAt: null,
        },
      },
      { $group: { _id: "$recipe", count: { $sum: 1 } } },
    ]),
  ]);

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const countMap = new Map(runCounts.map((row) => [String(row._id), row.count]));

  const views: PackageView[] = [];
  for (const recipe of recipes) {
    const finished = productMap.get(String(recipe.product));
    if (!finished) continue;

    let unitCost = 0;
    let maxProducible = Number.POSITIVE_INFINITY;
    const components: PackageComponent[] = recipe.components.map((line) => {
      const product = productMap.get(String(line.product));
      if (!product) {
        maxProducible = 0;
        return {
          product: String(line.product),
          quantity: line.quantity,
          productName: "صنف محذوف",
          unit: "",
          available: 0,
          purchasePrice: 0,
          missing: true,
        };
      }
      unitCost += line.quantity * product.purchasePrice;
      maxProducible = Math.min(
        maxProducible,
        Math.floor(roundQty(product.quantity / line.quantity)),
      );
      return {
        product: String(product._id),
        quantity: line.quantity,
        productName: product.name,
        unit: product.unit,
        available: product.quantity,
        purchasePrice: product.purchasePrice,
        missing: false,
      };
    });

    views.push(
      JSON.parse(
        JSON.stringify({
          _id: recipe._id,
          name: recipe.name,
          note: recipe.note,
          product: finished,
          components,
          unitCost: roundMoney(unitCost),
          maxProducible: Number.isFinite(maxProducible) ? maxProducible : 0,
          productionCount: countMap.get(String(recipe._id)) ?? 0,
          createdAt: recipe.createdAt,
          updatedAt: recipe.updatedAt,
        }),
      ),
    );
  }
  return views;
}

export type ProduceInput = {
  recipeId: string;
  quantity: number;
  date?: Date;
  note?: string;
};

/**
 * Consumes component stock and adds the finished package.
 * Any partial movements are undone if a later step fails.
 */
export async function producePackage(input: ProduceInput) {
  if (!(input.quantity > 0)) {
    throw new StockError("عدد الوحدات المصنّعة يجب أن يكون أكبر من صفر", 422);
  }

  const recipe = await PackageRecipe.findById(input.recipeId);
  if (!recipe) throw new StockError("المصنّع غير موجود", 404);

  const finished = await Product.findById(recipe.product);
  if (!finished) throw new StockError("صنف المصنّع غير موجود", 404);

  if (recipe.components.length === 0) {
    throw new StockError("أضف مكوّنات للمصنّع أولاً", 422);
  }

  const components = await Product.find({
    _id: { $in: recipe.components.map((line) => line.product) },
  });
  const componentMap = new Map(components.map((p) => [String(p._id), p]));

  const lines = recipe.components.map((line) => {
    const product = componentMap.get(String(line.product));
    if (!product) {
      throw new StockError("أحد مكوّنات المصنّع لم يعد موجوداً — عدّل التركيبة", 422);
    }
    return {
      product,
      quantityPerUnit: line.quantity,
      quantity: roundQty(line.quantity * input.quantity),
    };
  });

  const shortages = lines.filter((line) => line.product.quantity < line.quantity);
  if (shortages.length > 0) {
    const detail = shortages
      .map(
        (line) =>
          `"${line.product.name}": المطلوب ${line.quantity} والمتاح ${line.product.quantity}`,
      )
      .join("، ");
    throw new StockError(`الرصيد لا يكفي للتصنيع — ${detail}`, 409);
  }

  const unitCost = roundMoney(
    lines.reduce(
      (sum, line) => sum + line.quantityPerUnit * line.product.purchasePrice,
      0,
    ),
  );

  const runId = new Types.ObjectId();
  const date = input.date ?? new Date();
  const note = input.note?.trim() || `تصنيع ${input.quantity} × ${recipe.name}`;
  const movementIds: Types.ObjectId[] = [];
  const previousCost = finished.purchasePrice;
  let costUpdated = false;

  try {
    for (const line of lines) {
      const movement = await recordMovement({
        productId: line.product._id,
        type: "manufacture_out",
        quantity: line.quantity,
        date,
        purchasePrice: line.product.purchasePrice,
        salePrice: line.product.salePrice,
        partyName: PRODUCTION_PARTY,
        note,
        updateProductPrices: false,
        productionId: runId,
      });
      movementIds.push(movement._id);
    }

    const inbound = await recordMovement({
      productId: finished._id,
      type: "manufacture_in",
      quantity: input.quantity,
      date,
      purchasePrice: unitCost,
      salePrice: finished.salePrice,
      partyName: PRODUCTION_PARTY,
      note,
      updateProductPrices: false,
      productionId: runId,
    });
    movementIds.push(inbound._id);

    const oldQty = inbound.balanceBefore;
    const newQty = inbound.balanceAfter;
    const averageCost =
      newQty > 0
        ? roundMoney((oldQty * previousCost + input.quantity * unitCost) / newQty)
        : unitCost;
    await Product.updateOne(
      { _id: finished._id },
      { $set: { purchasePrice: averageCost } },
    );
    costUpdated = true;

    const run = await ProductionRun.create({
      _id: runId,
      recipe: recipe._id,
      product: finished._id,
      productName: finished.name,
      date,
      quantity: input.quantity,
      unitCost,
      consumed: lines.map((line) => ({
        product: line.product._id,
        productName: line.product.name,
        unit: line.product.unit,
        quantityPerUnit: line.quantityPerUnit,
        quantity: line.quantity,
        purchasePrice: line.product.purchasePrice,
      })),
      movements: movementIds,
      note: input.note?.trim() ?? "",
    });

    return run;
  } catch (error) {
    for (const id of [...movementIds].reverse()) {
      await undoMovement(id);
    }
    if (costUpdated) {
      await Product.updateOne(
        { _id: finished._id },
        { $set: { purchasePrice: previousCost } },
      );
    }
    throw error;
  }
}

/**
 * Removes a run's movements, rebuilds the affected ledgers, and backs the
 * run's batch out of the package's average cost.
 */
export async function reverseProduction(recipeId: string, runId: string) {
  const run = await ProductionRun.findOne({ _id: runId, recipe: recipeId });
  if (!run) throw new StockError("عملية التصنيع غير موجودة", 404);
  if (run.reversedAt) throw new StockError("تم إلغاء هذه العملية من قبل", 409);

  const finished = await Product.findById(run.product);
  if (!finished) throw new StockError("صنف المصنّع غير موجود", 404);

  // Claim the units first so a concurrent sale cannot spend them mid-reverse.
  const claimed = await Product.findOneAndUpdate(
    { _id: finished._id, quantity: { $gte: run.quantity } },
    { $inc: { quantity: -run.quantity } },
    { new: true },
  );
  if (!claimed) {
    throw new StockError(
      `لا يمكن الإلغاء: المتاح من "${finished.name}" هو ${finished.quantity} وأقل من الكمية المصنّعة ${run.quantity}`,
      409,
    );
  }

  const movements = await Transaction.find({ production: run._id }).lean();
  await Transaction.deleteMany({ production: run._id });

  const affected = new Set(movements.map((movement) => String(movement.product)));
  affected.add(String(finished._id));
  for (const productId of affected) {
    await recalculateProductLedger(productId);
  }

  const qtyAfter = claimed.quantity;
  const qtyBefore = qtyAfter + run.quantity;
  const restoredCost =
    qtyAfter > 0
      ? Math.max(
          0,
          roundMoney(
            (qtyBefore * finished.purchasePrice - run.quantity * run.unitCost) /
              qtyAfter,
          ),
        )
      : finished.purchasePrice;
  await Product.updateOne(
    { _id: finished._id },
    { $set: { purchasePrice: restoredCost } },
  );

  run.reversedAt = new Date();
  await run.save();
  return run;
}
