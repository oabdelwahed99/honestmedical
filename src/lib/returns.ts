import "server-only";

import type { Types } from "mongoose";
import { toPlain } from "@/lib/api-helpers";
import { roundMoney } from "@/lib/accounts";
import type { PartyKind } from "@/lib/constants";
import { normalizeInvoice } from "@/lib/invoice-normalize";
import { recordMovement, undoMovement } from "@/lib/stock";
import { Invoice } from "@/models/Invoice";
import { Product } from "@/models/Product";
import { ReturnNote } from "@/models/ReturnNote";
import type {
  Invoice as InvoiceType,
  ReturnLookup,
  ReturnLookupLine,
} from "@/lib/types";

export class ReturnError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "ReturnError";
    this.status = status;
  }
}

export function normalizeDocNumber(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Finds the invoice a return is raised against. Customer returns must quote
 * both the invoice number and its statement number (رقم البيان).
 */
export async function loadReturnableInvoice(
  direction: PartyKind,
  rawInvoiceNumber: string,
  rawStatementNumber: string,
) {
  const invoiceNumber = normalizeDocNumber(rawInvoiceNumber);
  const statementNumber = rawStatementNumber.trim();

  if (!invoiceNumber) throw new ReturnError("أدخل رقم الفاتورة");
  if (direction === "customer" && !statementNumber) {
    throw new ReturnError("أدخل رقم البيان");
  }

  const invoice = await Invoice.findOne(
    direction === "customer"
      ? {
          number: invoiceNumber,
          $or: [{ kind: "sale" }, { kind: { $exists: false } }],
        }
      : { number: invoiceNumber, kind: "purchase" },
  );
  if (!invoice) {
    throw new ReturnError(
      direction === "customer"
        ? "لا توجد فاتورة بيع بهذا الرقم"
        : "لا توجد فاتورة شراء بهذا الرقم",
      404,
    );
  }

  if (direction === "customer") {
    if (!invoice.statementNumber) {
      throw new ReturnError(
        "الفاتورة ليس عليها رقم بيان — سجّل رقم البيان على الفاتورة أولاً",
      );
    }
    if (normalizeDocNumber(invoice.statementNumber) !== normalizeDocNumber(statementNumber)) {
      throw new ReturnError("رقم البيان لا يطابق رقم الفاتورة");
    }
  }

  const notes = await ReturnNote.find({ invoice: invoice._id }).lean();
  const returnedByLine = new Map<number, number>();
  let existingMoney = 0;
  for (const note of notes) {
    existingMoney += note.moneyEffect;
    for (const item of note.items) {
      returnedByLine.set(
        item.line,
        (returnedByLine.get(item.line) ?? 0) + item.quantity,
      );
    }
  }

  const lines: ReturnLookupLine[] = invoice.items.map((item, line) => {
    const returned = returnedByLine.get(line) ?? 0;
    return {
      line,
      product: String(item.product),
      productName: item.productName,
      unit: item.unit as ReturnLookupLine["unit"],
      sold: item.quantity,
      returned,
      remaining: Math.max(0, item.quantity - returned),
      unitPrice: direction === "customer" ? item.salePrice : item.purchasePrice,
      purchasePrice: item.purchasePrice,
    };
  });

  const subtotal = invoice.subtotal ?? 0;
  const moneyRatio = subtotal > 0 ? invoice.total / subtotal : 0;
  const revenueRatio =
    subtotal > 0 ? Math.max(0, subtotal - (invoice.discount ?? 0)) / subtotal : 0;

  return { invoice, lines, moneyRatio, revenueRatio, existingMoney };
}

export function toLookupResponse(
  loaded: Awaited<ReturnType<typeof loadReturnableInvoice>>,
): ReturnLookup {
  return {
    invoice: normalizeInvoice(toPlain<InvoiceType>(loaded.invoice.toObject())),
    lines: loaded.lines,
    moneyRatio: loaded.moneyRatio,
  };
}

export type ReplacementInput = {
  productId: string;
  quantity: number;
  purchasePrice?: number;
  expiryDate?: string | null;
};

/** Receives exchange goods into stock and returns the replacement rows. */
export async function receiveReplacements(input: {
  noteId: Types.ObjectId;
  noteNumber: string;
  invoiceNumber: string;
  partyName: string;
  date: Date;
  replacements: ReplacementInput[];
}) {
  const products = await Product.find({
    _id: { $in: input.replacements.map((row) => row.productId) },
  });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const rows = [];
  const movementIds: Types.ObjectId[] = [];
  try {
    for (const row of input.replacements) {
      const product = productMap.get(row.productId);
      if (!product) throw new ReturnError("أحد أصناف البدل غير موجود", 404);
      if (row.quantity <= 0) {
        throw new ReturnError("كمية البدل يجب أن تكون أكبر من صفر");
      }
      const purchasePrice = row.purchasePrice ?? product.purchasePrice;
      const expiryDate = row.expiryDate ? new Date(row.expiryDate) : null;

      const movement = await recordMovement({
        productId: product._id,
        type: "purchase",
        quantity: row.quantity,
        date: input.date,
        purchasePrice,
        expiryDate: expiryDate ?? undefined,
        partyName: input.partyName,
        note: `بدل مرتجع ${input.noteNumber} على ${input.invoiceNumber}`,
        updateProductPrices: false,
        invoiceNumber: input.invoiceNumber,
        returnNoteId: input.noteId,
      });
      movementIds.push(movement._id);

      rows.push({
        product: product._id,
        productName: product.name,
        unit: product.unit,
        quantity: row.quantity,
        purchasePrice,
        total: roundMoney(row.quantity * purchasePrice),
        expiryDate,
      });
    }
  } catch (error) {
    for (const id of movementIds) await undoMovement(id);
    throw error;
  }

  return { rows, movementIds };
}
