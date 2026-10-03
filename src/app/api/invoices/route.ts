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
import {
  findOrCreateParty,
  invoiceStatus,
  nextPaymentNumber,
} from "@/lib/accounts";
import { normalizeInvoice } from "@/lib/invoice-normalize";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { Product } from "@/models/Product";
import { SalesRep } from "@/models/SalesRep";
import {
  partyKindForInvoice,
  settlingDirection,
  type DiscountType,
  type InvoiceKind,
} from "@/lib/constants";
import type { Invoice as InvoiceType } from "@/lib/types";

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

function resolveTax(
  base: number,
  taxType: DiscountType,
  taxValue: number,
): number {
  if (taxValue <= 0) return 0;
  if (taxType === "percent") return (base * taxValue) / 100;
  return taxValue;
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
  statementNumber: z.string().trim().default(""),
  date: z.string().optional(),
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.coerce.number().min(0, "الخصم غير صالح").default(0),
  /** Legacy alias — treated as amount when discountValue is omitted. */
  discount: z.coerce.number().min(0, "الخصم غير صالح").optional(),
  taxType: z.enum(["amount", "percent"]).default("amount"),
  taxValue: z.coerce.number().min(0, "الضريبة غير صالحة").default(0),
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

    const partyId = params.get("partyId");
    if (partyId && isValidObjectId(partyId)) {
      andClauses.push({ party: partyId });
    }

    const search = params.get("search")?.trim();
    if (search) {
      andClauses.push({
        $or: [
          { number: { $regex: escapeRegex(search), $options: "i" } },
          { customerName: { $regex: escapeRegex(search), $options: "i" } },
          { statementNumber: { $regex: escapeRegex(search), $options: "i" } },
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
    const statementNumber = kind === "sale" ? data.statementNumber : "";

    if (kind === "sale") {
      if (!statementNumber) {
        return errorResponse("أدخل رقم البيان", 422);
      }
      if (await Invoice.exists({ kind: "sale", statementNumber })) {
        return errorResponse("رقم البيان مستخدم في فاتورة أخرى", 409);
      }
      if (!data.repId) {
        return errorResponse("اختر المندوب", 422);
      }
    }

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

    const partyKind = partyKindForInvoice(kind);
    const party = await findOrCreateParty(partyKind, data.customerName);

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
    const netAfterDiscount = Math.max(0, subtotal - discount);
    const tax = resolveTax(netAfterDiscount, data.taxType, data.taxValue);
    const total = netAfterDiscount + tax;
    const amountPaid = Math.round(Math.min(data.amountPaid, total) * 100) / 100;

    let invoiceCreated = false;
    try {
      const invoice = await Invoice.create({
        _id: invoiceId,
        number,
        kind,
        date: invoiceDate,
        customerName: party.name,
        party: party._id,
        ledgerReady: true,
        returnedTotal: 0,
        statementNumber,
        rep: repId,
        repName,
        items,
        subtotal,
        discountType,
        discountValue,
        discount,
        taxType: data.taxType,
        taxValue: data.taxValue,
        tax,
        total,
        cogs,
        amountPaid,
        status: invoiceStatus(total, 0, amountPaid),
        note: data.note,
        movements: createdMovementIds,
      });
      invoiceCreated = true;

      if (amountPaid > 0) {
        const direction = settlingDirection(partyKind);
        await Payment.create({
          number: await nextPaymentNumber(direction, invoiceDate),
          party: party._id,
          partyName: party.name,
          partyKind,
          direction,
          date: invoiceDate,
          amount: amountPaid,
          allocations: [{ invoice: invoiceId, invoiceNumber: number, amount: amountPaid }],
          source: "invoice",
          note: `مدفوع عند إنشاء ${number}`,
        });
      }

      return NextResponse.json(
        {
          invoice: normalizeInvoice(
            toPlain<InvoiceType>(invoice.toObject()),
          ),
        },
        { status: 201 },
      );
    } catch (error) {
      if (invoiceCreated) await Invoice.deleteOne({ _id: invoiceId });
      for (const movementId of createdMovementIds) {
        await undoMovement(movementId);
      }
      createdMovementIds.length = 0;
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
