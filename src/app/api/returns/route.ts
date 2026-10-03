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
import {
  ensureLedgerMigrated,
  nextReturnNumber,
  refreshInvoices,
  roundMoney,
} from "@/lib/accounts";
import { PARTY_KINDS, type ReturnSettlement } from "@/lib/constants";
import { resolvePeriod } from "@/lib/period";
import {
  ReturnError,
  loadReturnableInvoice,
  receiveReplacements,
} from "@/lib/returns";
import { getSessionUser } from "@/lib/session";
import { StockError, recordMovement, undoMovement } from "@/lib/stock";
import { ReturnNote } from "@/models/ReturnNote";
import type { ReturnNote as ReturnNoteType } from "@/lib/types";

const replacementInput = z.object({
  productId: z.string().refine(isValidObjectId, "اختر صنف البدل"),
  quantity: z.coerce.number().gt(0, "كمية البدل يجب أن تكون أكبر من صفر"),
  purchasePrice: z.coerce.number().min(0, "سعر البدل غير صالح").optional(),
  expiryDate: z.string().nullable().optional(),
});

const returnInput = z.object({
  direction: z.enum(PARTY_KINDS),
  invoiceNumber: z.string().trim().min(1, "أدخل رقم الفاتورة"),
  statementNumber: z.string().trim().default(""),
  settlement: z.enum(["refund", "exchange"]).optional(),
  date: z.string().optional(),
  note: z.string().trim().default(""),
  items: z
    .array(
      z.object({
        line: z.coerce.number().int().min(0),
        quantity: z.coerce.number().min(0, "الكمية غير صالحة"),
      }),
    )
    .min(1, "اختر صنفاً واحداً على الأقل"),
  replacements: z.array(replacementInput).default([]),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const andClauses: Record<string, unknown>[] = [];

    const direction = params.get("direction");
    if (direction === "customer" || direction === "supplier") {
      andClauses.push({ direction });
    }

    const invoiceId = params.get("invoiceId");
    if (invoiceId && isValidObjectId(invoiceId)) {
      andClauses.push({ invoice: invoiceId });
    }

    const search = params.get("search")?.trim();
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: "i" };
      andClauses.push({
        $or: [
          { number: pattern },
          { invoiceNumber: pattern },
          { statementNumber: pattern },
          { partyName: pattern },
        ],
      });
    } else if (params.get("month")) {
      try {
        const period = resolvePeriod({ month: params.get("month") });
        andClauses.push({ date: { $gte: period.start, $lte: period.end } });
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "فترة غير صالحة",
          422,
        );
      }
    }

    const notes = await ReturnNote.find(
      andClauses.length ? { $and: andClauses } : {},
    )
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ returns: toPlain<ReturnNoteType[]>(notes) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const movementIds: Types.ObjectId[] = [];

  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const data = returnInput.parse(await request.json());
    const direction = data.direction;
    const loaded = await loadReturnableInvoice(
      direction,
      data.invoiceNumber,
      data.statementNumber,
    );
    const { invoice, lines, moneyRatio, revenueRatio, existingMoney } = loaded;

    if (!invoice.party) {
      return errorResponse("الفاتورة غير مربوطة بحساب", 409);
    }

    const settlement: ReturnSettlement =
      direction === "customer" ? "credit" : (data.settlement ?? "refund");
    if (direction === "customer" && data.settlement) {
      return errorResponse("مرتجع العميل يُخصم من حسابه فقط", 422);
    }

    const requested = new Map<number, number>();
    for (const row of data.items) {
      if (row.quantity <= 0) continue;
      requested.set(row.line, (requested.get(row.line) ?? 0) + row.quantity);
    }
    if (requested.size === 0) {
      return errorResponse("أدخل كمية مرتجعة لصنف واحد على الأقل", 422);
    }

    const items = [];
    let goodsValue = 0;
    for (const [lineIndex, quantity] of requested) {
      const line = lines[lineIndex];
      if (!line) return errorResponse("أحد بنود الارتجاع غير موجود في الفاتورة", 422);
      if (quantity > line.remaining + 1e-9) {
        return errorResponse(
          `الكمية المرتجعة من "${line.productName}" (${quantity}) أكبر من المتاح للارتجاع (${line.remaining})`,
          422,
        );
      }
      const total = roundMoney(quantity * line.unitPrice);
      goodsValue += total;
      items.push({
        line: lineIndex,
        product: new Types.ObjectId(line.product),
        productName: line.productName,
        unit: line.unit,
        quantity,
        unitPrice: line.unitPrice,
        purchasePrice: line.purchasePrice,
        total,
      });
    }
    goodsValue = roundMoney(goodsValue);

    if (settlement !== "exchange" && data.replacements.length > 0) {
      return errorResponse("البضاعة البديلة تُسجَّل في حالة التبديل فقط", 422);
    }

    const date = data.date ? new Date(data.date) : new Date();
    const noteId = new Types.ObjectId();
    const number = await nextReturnNumber(direction, date);
    const revenueValue =
      direction === "customer" ? roundMoney(goodsValue * revenueRatio) : 0;
    const maxCredit = Math.max(0, roundMoney(invoice.total - existingMoney));

    for (const item of items) {
      const movement = await recordMovement({
        productId: item.product,
        type: direction === "customer" ? "return_in" : "return_out",
        quantity: item.quantity,
        date,
        purchasePrice: item.purchasePrice,
        salePrice:
          direction === "customer" ? item.unitPrice * revenueRatio : undefined,
        partyName: invoice.customerName,
        note: `اذن ارتجاع ${number} على ${invoice.number}`,
        updateProductPrices: false,
        invoiceNumber: invoice.number,
        returnNoteId: noteId,
      });
      movementIds.push(movement._id);
    }

    let replacements: Awaited<ReturnType<typeof receiveReplacements>>["rows"] = [];
    if (settlement === "exchange" && data.replacements.length > 0) {
      const received = await receiveReplacements({
        noteId,
        noteNumber: number,
        invoiceNumber: invoice.number,
        partyName: invoice.customerName,
        date,
        replacements: data.replacements,
      });
      replacements = received.rows;
      movementIds.push(...received.movementIds);
    }
    const replacementValue = roundMoney(
      replacements.reduce((sum, row) => sum + row.total, 0),
    );

    const moneyEffect =
      settlement === "exchange"
        ? replacements.length > 0
          ? roundMoney(goodsValue - replacementValue)
          : 0
        : Math.min(roundMoney(goodsValue * moneyRatio), maxCredit);

    const note = await ReturnNote.create({
      _id: noteId,
      number,
      direction,
      settlement,
      date,
      party: invoice.party,
      partyName: invoice.customerName,
      invoice: invoice._id,
      invoiceNumber: invoice.number,
      statementNumber: invoice.statementNumber ?? "",
      rep: direction === "customer" ? (invoice.rep ?? null) : null,
      repName: direction === "customer" ? (invoice.repName ?? "") : "",
      items,
      goodsValue,
      revenueValue,
      moneyEffect,
      replacements,
      replacementValue,
      movements: movementIds,
      note: data.note,
      createdBy: user.displayName,
    });

    await refreshInvoices([invoice._id], user);

    return NextResponse.json(
      { returnNote: toPlain<ReturnNoteType>(note.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    for (const id of movementIds) {
      try {
        await undoMovement(id);
      } catch {
        // Best-effort rollback.
      }
    }
    if (error instanceof ReturnError || error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
