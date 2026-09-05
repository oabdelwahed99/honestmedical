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
import { SalesRep } from "@/models/SalesRep";
import type {
  DiscountType,
  InvoiceKind,
  InvoiceStatus,
} from "@/lib/constants";
import type { Invoice as InvoiceType } from "@/lib/types";

function invoiceStatus(total: number, amountPaid: number): InvoiceStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + 0.001 >= total) return "paid";
  return "partial";
}

function normalizeInvoice(invoice: InvoiceType): InvoiceType {
  return {
    ...invoice,
    kind: (invoice.kind as InvoiceKind | undefined) ?? "sale",
    rep: invoice.rep ?? null,
    repName: invoice.repName ?? "",
    discountType: (invoice.discountType as DiscountType | undefined) ?? "amount",
    discountValue: invoice.discountValue ?? invoice.discount ?? 0,
    items: (invoice.items ?? []).map((item) => ({
      ...item,
      expiryDate: item.expiryDate ?? null,
    })),
  };
}

function resolveDiscount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountValue <= 0 || subtotal <= 0) return 0;
  if (discountType === "percent") {
    return Math.min(subtotal, (subtotal * discountValue) / 100);
  }
  return Math.min(subtotal, discountValue);
}

async function nextInvoiceNumber(
  date: Date,
  kind: InvoiceKind,
): Promise<string> {
  const year = date.getFullYear();
  const prefix = kind === "purchase" ? `PINV-${year}-` : `INV-${year}-`;
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
  purchasePrice: z.coerce.number().min(0, "سعر الشراء غير صالح").optional(),
  expiryDate: z.string().nullable().optional(),
});

const invoiceInput = z.object({
  kind: z.enum(["sale", "purchase"]).default("sale"),
  customerName: z.string().trim().min(1, "أدخل اسم العميل أو المورد"),
  date: z.string().optional(),
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.coerce.number().min(0, "الخصم غير صالح").default(0),
  /** Legacy alias — treated as amount when discountValue is omitted. */
  discount: z.coerce.number().min(0, "الخصم غير صالح").optional(),
  amountPaid: z.coerce.number().min(0, "المبلغ المدفوع غير صالح").default(0),
  note: z.string().trim().default(""),
  repId: z
    .string()
    .refine((value) => !value || isValidObjectId(value), "مندوب غير صالح")
    .optional()
    .nullable(),
  items: z.array(invoiceItemInput).min(1, "أضف صنفاً واحداً على الأقل"),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const andClauses: Record<string, unknown>[] = [];

    const kind = params.get("kind");
    if (kind === "sale") {
      andClauses.push({ $or: [{ kind: "sale" }, { kind: { $exists: false } }] });
    } else if (kind === "purchase") {
      andClauses.push({ kind: "purchase" });
    }

    const status = params.get("status");
    if (status === "paid" || status === "partial" || status === "unpaid") {
      andClauses.push({ status });
    }

    const repId = params.get("repId");
    if (repId && isValidObjectId(repId)) {
      andClauses.push({ rep: repId });
    }

    const search = params.get("search")?.trim();
    if (search) {
      andClauses.push({
        $or: [
          { number: { $regex: escapeRegex(search), $options: "i" } },
          { customerName: { $regex: escapeRegex(search), $options: "i" } },
          { repName: { $regex: escapeRegex(search), $options: "i" } },
        ],
      });
    }

    // Searching by number should ignore the month filter so older invoices appear.
    if (
      !search &&
      (params.get("month") || params.get("from") || params.get("to"))
    ) {
      try {
        const period = resolvePeriod({
          month: params.get("month"),
          from: params.get("from"),
          to: params.get("to"),
        });
        andClauses.push({ date: { $gte: period.start, $lte: period.end } });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "فترة غير صالحة",
          422,
        );
      }
    }

    const filter =
      andClauses.length === 0
        ? {}
        : andClauses.length === 1
          ? andClauses[0]
          : { $and: andClauses };

    const limit = Math.min(Number(params.get("limit")) || 200, 500);

    const invoices = await Invoice.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      invoices: toPlain<InvoiceType[]>(invoices).map(normalizeInvoice),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const createdMovementIds: Types.ObjectId[] = [];

  try {
    await connectToDatabase();

    const raw = await request.json();
    const data = invoiceInput.parse(raw);
    const kind = data.kind;
    const invoiceDate = data.date ? new Date(data.date) : new Date();
    const discountType = data.discountType;
    const discountValue =
      data.discountValue > 0
        ? data.discountValue
        : (data.discount ?? 0);

    let repId: Types.ObjectId | null = null;
    let repName = "";
    if (data.repId) {
      const rep = await SalesRep.findById(data.repId);
      if (!rep || !rep.active) {
        return errorResponse("المندوب غير موجود أو غير نشط", 404);
      }
      repId = rep._id as Types.ObjectId;
      repName = rep.name;
    }

    // Aggregate quantities per product so we can validate stock once (sales only).
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
      if (kind === "sale" && product.quantity < qty) {
        return errorResponse(
          `الرصيد المتاح من "${product.name}" هو ${product.quantity} ولا يكفي للكمية ${qty}`,
          409,
        );
      }
    }

    const number = await nextInvoiceNumber(invoiceDate, kind);
    const invoiceId = new Types.ObjectId();

    const items = [];
    let subtotal = 0;
    let cogs = 0;

    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      const salePrice = item.salePrice ?? product.salePrice;
      const purchasePrice = item.purchasePrice ?? product.purchasePrice;
      const unitPrice = kind === "purchase" ? purchasePrice : salePrice;
      const lineTotal = item.quantity * unitPrice;
      const expiryDate =
        item.expiryDate === undefined || item.expiryDate === null
          ? null
          : item.expiryDate
            ? new Date(item.expiryDate)
            : null;

      items.push({
        product: product._id,
        productName: product.name,
        unit: product.unit,
        quantity: item.quantity,
        salePrice,
        purchasePrice,
        total: lineTotal,
        expiryDate,
      });

      subtotal += lineTotal;
      if (kind === "sale") {
        cogs += item.quantity * purchasePrice;
      }

      const movement = await recordMovement({
        productId: product._id,
        type: kind === "purchase" ? "purchase" : "sale",
        quantity: item.quantity,
        date: invoiceDate,
        purchasePrice,
        salePrice,
        expiryDate: kind === "purchase" ? expiryDate : undefined,
        partyName: data.customerName,
        note: `فاتورة ${number}`,
        updateProductPrices: true,
        invoiceId,
        invoiceNumber: number,
      });

      createdMovementIds.push(movement._id as Types.ObjectId);
    }

    const discount = resolveDiscount(subtotal, discountType, discountValue);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = Math.min(data.amountPaid, total);

    try {
      const invoice = await Invoice.create({
        _id: invoiceId,
        number,
        kind,
        date: invoiceDate,
        customerName: data.customerName,
        rep: repId,
        repName,
        items,
        subtotal,
        discountType,
        discountValue,
        discount,
        total,
        cogs,
        amountPaid,
        status: invoiceStatus(total, amountPaid),
        note: data.note,
        movements: createdMovementIds,
      });

      return NextResponse.json(
        {
          invoice: normalizeInvoice(
            toPlain<InvoiceType>(invoice.toObject()),
          ),
        },
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
