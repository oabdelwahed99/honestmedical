import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { UNITS } from "@/lib/constants";
import { roundQty } from "@/lib/production";
import { StockError } from "@/lib/stock";
import { Product } from "@/models/Product";

export const componentInput = z.object({
  productId: z.string().refine(isValidObjectId, "اختر صنفاً صحيحاً للمكوّن"),
  quantity: z.coerce.number().gt(0, "كمية المكوّن يجب أن تكون أكبر من صفر"),
});

export const packageInput = z.object({
  name: z.string().trim().min(1, "اسم المصنّع مطلوب"),
  unit: z.enum(UNITS, { message: "اختر وحدة صحيحة" }),
  salePrice: z.coerce.number().min(0, "سعر البيع غير صالح").default(0),
  lowStockThreshold: z.coerce.number().min(0).default(0),
  note: z.string().trim().default(""),
  components: z.array(componentInput).min(1, "أضف مكوّناً واحداً على الأقل"),
});

export const packagePatch = packageInput.partial();

/**
 * Merges duplicate lines and checks every component is an existing,
 * non-manufactured product.
 */
export async function resolveComponents(
  lines: z.infer<typeof componentInput>[],
  selfProductId?: Types.ObjectId | string,
) {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.productId, roundQty((merged.get(line.productId) ?? 0) + line.quantity));
  }

  if (selfProductId && merged.has(String(selfProductId))) {
    throw new StockError("لا يمكن أن يكون المصنّع مكوّناً في نفسه", 422);
  }

  const products = await Product.find({ _id: { $in: [...merged.keys()] } }).lean();
  if (products.length !== merged.size) {
    throw new StockError("أحد المكوّنات غير موجود", 404);
  }
  const nested = products.find((product) => product.manufactured);
  if (nested) {
    throw new StockError(
      `"${nested.name}" مصنّع بالفعل ولا يمكن استخدامه كمكوّن`,
      422,
    );
  }

  return [...merged].map(([product, quantity]) => ({ product, quantity }));
}
