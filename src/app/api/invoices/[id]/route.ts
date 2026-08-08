import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { recalculateProductLedger } from "@/lib/ledger";
import { Invoice } from "@/models/Invoice";
import { Transaction } from "@/models/Transaction";
import type { InvoiceStatus } from "@/lib/constants";
import type { Invoice as InvoiceType } from "@/lib/types";

function invoiceStatus(total: number, amountPaid: number): InvoiceStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + 0.001 >= total) return "paid";
  return "partial";
}

const invoicePatch = z.object({
  amountPaid: z.coerce.number().min(0, "المبلغ المدفوع غير صالح").optional(),
  note: z.string().trim().optional(),
  customerName: z.string().trim().min(1, "أدخل اسم العميل").optional(),
  date: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/invoices/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الفاتورة غير صالح", 400);

    await connectToDatabase();

    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    return NextResponse.json({ invoice: toPlain<InvoiceType>(invoice) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/invoices/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الفاتورة غير صالح", 400);

    await connectToDatabase();

    const invoice = await Invoice.findById(id);
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    const data = invoicePatch.parse(await request.json());

    if (data.customerName !== undefined) invoice.customerName = data.customerName;
    if (data.note !== undefined) invoice.note = data.note;
    if (data.date) invoice.date = new Date(data.date);
    if (data.amountPaid !== undefined) {
      invoice.amountPaid = Math.min(data.amountPaid, invoice.total);
      invoice.status = invoiceStatus(invoice.total, invoice.amountPaid);
    }

    await invoice.save();

    return NextResponse.json({
      invoice: toPlain<InvoiceType>(invoice.toObject()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/invoices/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الفاتورة غير صالح", 400);

    await connectToDatabase();

    const invoice = await Invoice.findById(id);
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    const movements = await Transaction.find({ invoice: invoice._id });
    const productIds = [
      ...new Set(movements.map((movement) => String(movement.product))),
    ];

    await Transaction.deleteMany({ invoice: invoice._id });
    await Invoice.deleteOne({ _id: invoice._id });

    for (const productId of productIds) {
      await recalculateProductLedger(productId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
