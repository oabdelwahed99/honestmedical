import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
} from "@/lib/api-helpers";
import { packageInput, resolveComponents } from "@/lib/package-input";
import { buildPackageViews } from "@/lib/production";
import { StockError } from "@/lib/stock";
import { PackageRecipe } from "@/models/PackageRecipe";
import { Product } from "@/models/Product";

export async function GET() {
  try {
    await connectToDatabase();
    const recipes = await PackageRecipe.find().sort({ name: 1 }).lean();
    const packages = await buildPackageViews(recipes);
    return NextResponse.json({ packages });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    const data = packageInput.parse(await request.json());

    const duplicate = await Product.findOne({
      name: { $regex: `^${escapeRegex(data.name)}$`, $options: "i" },
      unit: data.unit,
    }).lean();
    if (duplicate) {
      return errorResponse("يوجد صنف بنفس الاسم والوحدة بالفعل", 409);
    }

    const components = await resolveComponents(data.components);

    const product = await Product.create({
      name: data.name,
      unit: data.unit,
      quantity: 0,
      purchasePrice: 0,
      salePrice: data.salePrice,
      lowStockThreshold: data.lowStockThreshold,
      note: data.note,
      manufactured: true,
    });

    try {
      const recipe = await PackageRecipe.create({
        name: data.name,
        product: product._id,
        components,
        note: data.note,
      });
      const [view] = await buildPackageViews([recipe.toObject()]);
      return NextResponse.json({ package: view }, { status: 201 });
    } catch (error) {
      await Product.deleteOne({ _id: product._id });
      throw error;
    }
  } catch (error) {
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
