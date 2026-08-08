import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { UNITS } from "@/lib/constants";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { Product } from "@/models/Product";
import { Transaction } from "@/models/Transaction";
import type { Product as ProductType } from "@/lib/types";

const productPatch = z.object({
  name: z.string().trim().min(1, "اسم الصنف مطلوب").optional(),
  unit: z.enum(UNITS).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  expiryDate: z.string().nullable().optional(),
  lowStockThreshold: z.coerce.number().min(0).optional(),
  note: z.string().trim().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/products/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الصنف غير صالح", 400);

    await connectToDatabase();
    const product = await Product.findById(id).lean();
    if (!product) return errorResponse("الصنف غير موجود", 404);

    return NextResponse.json({ product: toPlain<ProductType>(product) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/products/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الصنف غير صالح", 400);

    await connectToDatabase();
    const data = productPatch.parse(await request.json());

    if (data.name || data.unit) {
      const current = await Product.findById(id).lean();
      if (!current) return errorResponse("الصنف غير موجود", 404);

      const duplicate = await Product.findOne({
        _id: { $ne: id },
        name: {
          $regex: `^${escapeRegex(data.name ?? current.name)}$`,
          $options: "i",
        },
        unit: data.unit ?? current.unit,
      }).lean();
      if (duplicate) {
        return errorResponse("يوجد صنف بنفس الاسم والوحدة بالفعل", 409);
      }
    }

    const update: Record<string, unknown> = { ...data };
    if ("expiryDate" in data) {
      update.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    }

    const product = await Product.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!product) return errorResponse("الصنف غير موجود", 404);

    // Keep the denormalised ledger labels in sync with the product.
    if (data.name || data.unit) {
      await Transaction.updateMany(
        { product: id },
        {
          $set: {
            ...(data.name ? { productName: data.name } : {}),
            ...(data.unit ? { unit: data.unit } : {}),
          },
        },
      );
    }

    return NextResponse.json({ product: toPlain<ProductType>(product) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/products/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الصنف غير صالح", 400);

    await connectToDatabase();
    const product = await Product.findByIdAndDelete(id);
    if (!product) return errorResponse("الصنف غير موجود", 404);

    await Transaction.deleteMany({ product: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
