import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { diffFields, logInvoiceAction, snapshotFields } from "@/lib/audit";
import { ensureLedgerMigrated, findOrCreateParty } from "@/lib/accounts";
import { partyKindForInvoice, type InvoiceKind } from "@/lib/constants";
import { normalizeInvoice } from "@/lib/invoice-normalize";
import { recalculateProductLedger } from "@/lib/ledger";
import { getSessionUser } from "@/lib/session";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";
import { ReturnNote } from "@/models/ReturnNote";
import { Transaction } from "@/models/Transaction";
import type {
  Invoice as InvoiceType,
  Payment as PaymentType,
  ReturnNote as ReturnNoteType,
} from "@/lib/types";

const invoicePatch = z.object({
  note: z.string().trim().optional(),
  customerName: z.string().trim().min(1, "أدخل اسم العميل").optional(),
  statementNumber: z.string().trim().optional(),
  date: z.string().optional(),
});

const AUDITED_FIELDS = [
  "customerName",
  "statementNumber",
  "date",
  "note",
  "amountPaid",
  "status",
] as const;

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/invoices/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الفاتورة غير صالح", 400);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const invoice = await Invoice.findById(id).lean();
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    const [payments, returns] = await Promise.all([
      Payment.find({ "allocations.invoice": invoice._id })
        .sort({ date: 1, createdAt: 1 })
        .lean(),
      ReturnNote.find({ invoice: invoice._id })
        .sort({ date: 1, createdAt: 1 })
        .lean(),
    ]);

    return NextResponse.json({
      invoice: normalizeInvoice(toPlain<InvoiceType>(invoice)),
      payments: toPlain<PaymentType[]>(payments),
      returns: toPlain<ReturnNoteType[]>(returns),
    });
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

    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const invoice = await Invoice.findById(id);
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    const data = invoicePatch.parse(await request.json());
    const before = snapshotFields(invoice.toObject(), AUDITED_FIELDS);
    const hasReturns = Boolean(await ReturnNote.exists({ invoice: invoice._id }));

    if (
      data.customerName !== undefined &&
      data.customerName !== invoice.customerName
    ) {
      const manualPayment = await Payment.exists({
        "allocations.invoice": invoice._id,
        source: "manual",
      });
      if (hasReturns || manualPayment) {
        return errorResponse(
          "لا يمكن تغيير الطرف بعد تسجيل سندات أو اذون ارتجاع على الفاتورة",
          409,
        );
      }
      const kind = partyKindForInvoice((invoice.kind ?? "sale") as InvoiceKind);
      const party = await findOrCreateParty(kind, data.customerName);
      invoice.customerName = party.name;
      invoice.party = party._id;
      await Payment.updateMany(
        { "allocations.invoice": invoice._id },
        { $set: { party: party._id, partyName: party.name } },
      );
    }
    if (
      data.statementNumber !== undefined &&
      data.statementNumber !== invoice.statementNumber &&
      (invoice.kind ?? "sale") === "sale"
    ) {
      if (!data.statementNumber) {
        return errorResponse("أدخل رقم البيان", 422);
      }
      if (hasReturns) {
        return errorResponse(
          "لا يمكن تعديل رقم البيان بعد تسجيل اذن ارتجاع على الفاتورة",
          409,
        );
      }
      const duplicate = await Invoice.exists({
        _id: { $ne: invoice._id },
        kind: "sale",
        statementNumber: data.statementNumber,
      });
      if (duplicate) {
        return errorResponse("رقم البيان مستخدم في فاتورة أخرى", 409);
      }
      invoice.statementNumber = data.statementNumber;
    }
    if (data.note !== undefined) invoice.note = data.note;
    if (data.date) invoice.date = new Date(data.date);

    await invoice.save();

    const changes = diffFields(
      before,
      snapshotFields(invoice.toObject(), AUDITED_FIELDS),
    );
    if (changes.length > 0) {
      await logInvoiceAction({ action: "update", user, invoice, changes });
    }

    return NextResponse.json({
      invoice: normalizeInvoice(toPlain<InvoiceType>(invoice.toObject())),
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

    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const invoice = await Invoice.findById(id);
    if (!invoice) return errorResponse("الفاتورة غير موجودة", 404);

    if (await ReturnNote.exists({ invoice: invoice._id })) {
      return errorResponse(
        "على الفاتورة اذون ارتجاع — احذف اذون الارتجاع أولاً",
        409,
      );
    }

    const payments = await Payment.find({ "allocations.invoice": invoice._id });
    // Payments created with the invoice (or migrated from it) go with it.
    const ownPayments = payments.filter(
      (payment) =>
        payment.source !== "manual" &&
        payment.allocations.every(
          (allocation) => String(allocation.invoice) === String(invoice._id),
        ),
    );
    if (ownPayments.length !== payments.length) {
      return errorResponse(
        "على الفاتورة سندات سداد — احذف السندات من حساب الطرف أولاً",
        409,
      );
    }

    const snapshot = normalizeInvoice(toPlain<InvoiceType>(invoice.toObject()));

    const movements = await Transaction.find({ invoice: invoice._id });
    const productIds = [
      ...new Set(movements.map((movement) => String(movement.product))),
    ];

    await Transaction.deleteMany({ invoice: invoice._id });
    await Payment.deleteMany({
      _id: { $in: ownPayments.map((payment) => payment._id) },
    });
    await Invoice.deleteOne({ _id: invoice._id });

    await logInvoiceAction({ action: "delete", user, invoice, snapshot });

    for (const productId of productIds) {
      await recalculateProductLedger(productId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
