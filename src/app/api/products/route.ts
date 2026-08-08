import { NextResponse, type NextRequest } from "next/server";
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

const productInput = z.object({
  name: z.string().trim().min(1, "اسم الصنف مطلوب"),
  unit: z.enum(UNITS, { message: "اختر وحدة صحيحة" }),
  quantity: z.coerce.number().min(0, "الكمية لا يمكن أن تكون سالبة").default(0),
  purchasePrice: z.coerce.number().min(0, "سعر الشراء غير صالح").default(0),
  salePrice: z.coerce.number().min(0, "سعر البيع غير صالح").default(0),
  expiryDate: z.string().optional().nullable(),
  lowStockThreshold: z.coerce.number().min(0).default(0),
  note: z.string().trim().default(""),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const search = request.nextUrl.searchParams.get("search")?.trim();
    const filter = search
      ? { name: { $regex: escapeRegex(search), $options: "i" } }
      : {};

    const products = await Product.find(filter).sort({ name: 1 }).lean();

    return NextResponse.json({ products: toPlain<ProductType[]>(products) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = productInput.parse(await request.json());
    const expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;

    const duplicate = await Product.findOne({
      name: { $regex: `^${escapeRegex(data.name)}$`, $options: "i" },
      unit: data.unit,
    }).lean();
    if (duplicate) {
      return errorResponse("يوجد صنف بنفس الاسم والوحدة بالفعل", 409);
    }

    const product = await Product.create({
      name: data.name,
      unit: data.unit,
      quantity: data.quantity,
      purchasePrice: data.purchasePrice,
      salePrice: data.salePrice,
      expiryDate,
      lowStockThreshold: data.lowStockThreshold,
      note: data.note,
    });

    // An opening balance is recorded as a movement so the ledger explains
    // where the starting quantity came from.
    if (data.quantity > 0) {
      await Transaction.create({
        product: product._id,
        productName: product.name,
        unit: product.unit,
        type: "purchase",
        date: new Date(),
        quantity: data.quantity,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        total: data.quantity * data.purchasePrice,
        balanceBefore: 0,
        balanceAfter: data.quantity,
        expiryDate,
        partyName: "رصيد افتتاحي",
        note: "رصيد افتتاحي",
      });
    }

    return NextResponse.json(
      { product: toPlain<ProductType>(product.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
