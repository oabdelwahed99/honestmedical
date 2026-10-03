import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { packagePatch, resolveComponents } from "@/lib/package-input";
import { buildPackageViews } from "@/lib/production";
import { StockError } from "@/lib/stock";
import type { ProductionRun as ProductionRunType } from "@/lib/types";
import { PackageRecipe } from "@/models/PackageRecipe";
import { Product } from "@/models/Product";
import { ProductionRun } from "@/models/ProductionRun";
import { Transaction } from "@/models/Transaction";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/packages/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصنّع غير صالح", 400);

    await connectToDatabase();
    const recipe = await PackageRecipe.findById(id).lean();
    if (!recipe) return errorResponse("المصنّع غير موجود", 404);

    const [[view], runs] = await Promise.all([
      buildPackageViews([recipe]),
      ProductionRun.find({ recipe: id })
        .sort({ date: -1, createdAt: -1 })
        .limit(100)
        .lean(),
    ]);
    if (!view) return errorResponse("صنف المصنّع غير موجود", 404);

    return NextResponse.json({
      package: view,
      runs: toPlain<ProductionRunType[]>(runs),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/packages/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصنّع غير صالح", 400);

    await connectToDatabase();
    const data = packagePatch.parse(await request.json());

    const recipe = await PackageRecipe.findById(id);
    if (!recipe) return errorResponse("المصنّع غير موجود", 404);
    const product = await Product.findById(recipe.product);
    if (!product) return errorResponse("صنف المصنّع غير موجود", 404);

    const name = data.name ?? product.name;
    const unit = data.unit ?? product.unit;
    const renamed = name !== product.name || unit !== product.unit;

    if (renamed) {
      const duplicate = await Product.findOne({
        _id: { $ne: product._id },
        name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
        unit,
      }).lean();
      if (duplicate) {
        return errorResponse("يوجد صنف بنفس الاسم والوحدة بالفعل", 409);
      }
    }

    if (data.components) {
      recipe.set(
        "components",
        await resolveComponents(data.components, product._id),
      );
    }
    recipe.name = name;
    if (data.note !== undefined) recipe.note = data.note;
    await recipe.save();

    const productUpdate: Record<string, unknown> = { name, unit };
    if (data.salePrice !== undefined) productUpdate.salePrice = data.salePrice;
    if (data.lowStockThreshold !== undefined) {
      productUpdate.lowStockThreshold = data.lowStockThreshold;
    }
    if (data.note !== undefined) productUpdate.note = data.note;
    await Product.updateOne(
      { _id: product._id },
      { $set: productUpdate },
      { runValidators: true },
    );

    if (renamed) {
      await Promise.all([
        Transaction.updateMany(
          { product: product._id },
          { $set: { productName: name, unit } },
        ),
        ProductionRun.updateMany(
          { product: product._id },
          { $set: { productName: name } },
        ),
      ]);
    }

    const [view] = await buildPackageViews([recipe.toObject()]);
    return NextResponse.json({ package: view });
  } catch (error) {
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/packages/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المصنّع غير صالح", 400);

    await connectToDatabase();
    const recipe = await PackageRecipe.findById(id);
    if (!recipe) return errorResponse("المصنّع غير موجود", 404);

    const product = await Product.findById(recipe.product);
    const [activeRun, hasMovements] = await Promise.all([
      ProductionRun.exists({ recipe: recipe._id, reversedAt: null }),
      product ? Transaction.exists({ product: product._id }) : null,
    ]);

    if ((product && product.quantity > 0) || activeRun || hasMovements) {
      return errorResponse(
        "لا يمكن حذف مصنّع تم تصنيعه أو له رصيد أو حركات — يمكنك تعديل تركيبته فقط",
        409,
      );
    }

    await Promise.all([
      ProductionRun.deleteMany({ recipe: recipe._id }),
      product ? Product.deleteOne({ _id: product._id }) : null,
      PackageRecipe.deleteOne({ _id: recipe._id }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
