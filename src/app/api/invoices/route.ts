import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { resolvePeriod } from "@/lib/period";
import {
  recordMovement,
  undoMovement,
  StockError,
} from "@/lib/stock";
import { Invoice } from "@/models/Invoice";
import { Product } from "@/models/Product";
import type { InvoiceStatus } from "@/lib/constants";
import type { Invoice as InvoiceType } from "@/lib/types";

function invoiceStatus(total: number, amountPaid: number): InvoiceStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + 0.001 >= total) return "paid";
  return "partial";
}

async function nextInvoiceNumber(date: Date): Promise<string> {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await Invoice.findOne({ number: { $regex: `^${prefix}` } })
    .sort({ number: -1 })
    .select("number")
    .lean();

  let seq = 1;
  if (latest?.number) {
    const match = /-(\d+)$/.exec(latest.number);
    if (match) seq = Number(match[1]) + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

const invoiceItemInput = z.object({
  productId: z.string().refine(isValidObjectId, "اختر صنفاً صحيحاً"),
  quantity: z.coerce.number().gt(0, "الكمية يجب أن تكون أكبر من صفر"),
  salePrice: z.coerce.number().min(0, "سعر البيع غير صالح").optional(),
});

const invoiceInput = z.object({
  customerName: z.string().trim().min(1, "أدخل اسم العميل"),
  date: z.string().optional(),
  discount: z.coerce.number().min(0, "الخصم غير صالح").default(0),
  amountPaid: z.coerce.number().min(0, "المبلغ المدفوع غير صالح").default(0),
  note: z.string().trim().default(""),
  items: z.array(invoiceItemInput).min(1, "أضف صنفاً واحداً على الأقل"),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};

    const status = params.get("status");
    if (status === "paid" || status === "partial" || status === "unpaid") {
      filter.status = status;
    }

    const search = params.get("search")?.trim();
    if (search) {
      filter.$or = [
        { number: { $regex: escapeRegex(search), $options: "i" } },
        { customerName: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    if (params.get("month") || params.get("from") || params.get("to")) {
      try {
        const period = resolvePeriod({
          month: params.get("month"),
          from: params.get("from"),
          to: params.get("to"),
        });
        filter.date = { $gte: period.start, $lte: period.end };
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "فترة غير صالحة",
          422,
        );
      }
    }

    const limit = Math.min(Number(params.get("limit")) || 200, 500);

    const invoices = await Invoice.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ invoices: toPlain<InvoiceType[]>(invoices) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const createdMovementIds: Types.ObjectId[] = [];

  try {
    await connectToDatabase();

    const data = invoiceInput.parse(await request.json());
    const invoiceDate = data.date ? new Date(data.date) : new Date();

    // Aggregate quantities per product so we can validate stock once.
    const needed = new Map<string, number>();
    for (const item of data.items) {
      needed.set(
        item.productId,
        (needed.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const products = await Product.find({
      _id: { $in: [...needed.keys()] },
    });
    const productMap = new Map(
      products.map((product) => [String(product._id), product]),
    );

    for (const [productId, qty] of needed) {
      const product = productMap.get(productId);
      if (!product) {
        return errorResponse("أحد الأصناف غير موجود", 404);
      }
      if (product.quantity < qty) {
        return errorResponse(
          `الرصيد المتاح من "${product.name}" هو ${product.quantity} ولا يكفي للكمية ${qty}`,
          409,
        );
      }
    }

    const number = await nextInvoiceNumber(invoiceDate);
    const invoiceId = new Types.ObjectId();

    const items = [];
    let subtotal = 0;
    let cogs = 0;

    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      const salePrice = item.salePrice ?? product.salePrice;
      const purchasePrice = product.purchasePrice;
      const lineTotal = item.quantity * salePrice;

      items.push({
        product: product._id,
        productName: product.name,
        unit: product.unit,
        quantity: item.quantity,
        salePrice,
        purchasePrice,
        total: lineTotal,
      });

      subtotal += lineTotal;
      cogs += item.quantity * purchasePrice;

      const movement = await recordMovement({
        productId: product._id,
        type: "sale",
        quantity: item.quantity,
        date: invoiceDate,
        purchasePrice,
        salePrice,
        partyName: data.customerName,
        note: `فاتورة ${number}`,
        updateProductPrices: true,
        invoiceId,
        invoiceNumber: number,
      });

      createdMovementIds.push(movement._id as Types.ObjectId);
    }

    const discount = Math.min(data.discount, subtotal);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = Math.min(data.amountPaid, total);

    try {
      const invoice = await Invoice.create({
        _id: invoiceId,
        number,
        date: invoiceDate,
        customerName: data.customerName,
        items,
        subtotal,
        discount,
        total,
        cogs,
        amountPaid,
        status: invoiceStatus(total, amountPaid),
        note: data.note,
        movements: createdMovementIds,
      });

      return NextResponse.json(
        { invoice: toPlain<InvoiceType>(invoice.toObject()) },
        { status: 201 },
      );
    } catch (error) {
      for (const movementId of createdMovementIds) {
        await undoMovement(movementId);
      }
      throw error;
    }
  } catch (error) {
    if (createdMovementIds.length > 0) {
      for (const movementId of createdMovementIds) {
        try {
          await undoMovement(movementId);
        } catch {
          // Best-effort rollback.
        }
      }
    }
    if (error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
