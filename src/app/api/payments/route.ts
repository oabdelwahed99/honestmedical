import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import {
  MONEY_EPSILON,
  autoAllocate,
  ensureLedgerMigrated,
  nextPaymentNumber,
  openInvoicesFor,
  refreshInvoices,
  roundMoney,
} from "@/lib/accounts";
import {
  PAYMENT_DIRECTIONS,
  settlingDirection,
  type PartyKind,
} from "@/lib/constants";
import { getSessionUser } from "@/lib/session";
import { Party } from "@/models/Party";
import { Payment } from "@/models/Payment";
import type { Payment as PaymentType } from "@/lib/types";

const paymentInput = z.object({
  partyId: z.string().refine(isValidObjectId, "اختر العميل أو المورد"),
  direction: z.enum(PAYMENT_DIRECTIONS).optional(),
  amount: z.coerce.number().gt(0, "المبلغ يجب أن يكون أكبر من صفر"),
  date: z.string().optional(),
  note: z.string().trim().default(""),
  /** Omit to allocate oldest-first automatically. */
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().refine(isValidObjectId, "فاتورة غير صالحة"),
        amount: z.coerce.number().min(0, "مبلغ التوزيع غير صالح"),
      }),
    )
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    await ensureLedgerMigrated();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};
    const partyId = params.get("partyId");
    if (partyId && isValidObjectId(partyId)) filter.party = partyId;
    const invoiceId = params.get("invoiceId");
    if (invoiceId && isValidObjectId(invoiceId)) {
      filter["allocations.invoice"] = invoiceId;
    }

    const payments = await Payment.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ payments: toPlain<PaymentType[]>(payments) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const data = paymentInput.parse(await request.json());
    const party = await Party.findById(data.partyId);
    if (!party) return errorResponse("الطرف غير موجود", 404);

    const kind = party.kind as PartyKind;
    const settling = settlingDirection(kind);
    const direction = data.direction ?? settling;
    const amount = roundMoney(data.amount);
    const date = data.date ? new Date(data.date) : new Date();

    let allocations: { invoice: string; invoiceNumber: string; amount: number }[] = [];

    if (direction === settling) {
      const open = await openInvoicesFor(party._id);
      const openMap = new Map(open.map((invoice) => [invoice._id, invoice]));
      const requested = data.allocations ?? autoAllocate(open, amount);

      const merged = new Map<string, number>();
      for (const row of requested) {
        if (row.amount <= 0) continue;
        merged.set(row.invoiceId, (merged.get(row.invoiceId) ?? 0) + row.amount);
      }

      let allocatedTotal = 0;
      for (const [invoiceId, share] of merged) {
        const invoice = openMap.get(invoiceId);
        if (!invoice) {
          return errorResponse("إحدى الفواتير ليست مفتوحة على هذا الحساب", 422);
        }
        if (share > invoice.remaining + MONEY_EPSILON) {
          return errorResponse(
            `المبلغ الموزع على ${invoice.number} أكبر من المتبقي (${invoice.remaining})`,
            422,
          );
        }
        allocatedTotal += share;
        allocations.push({
          invoice: invoiceId,
          invoiceNumber: invoice.number,
          amount: roundMoney(share),
        });
      }

      if (allocatedTotal > amount + MONEY_EPSILON) {
        return errorResponse("مجموع التوزيع أكبر من مبلغ السند", 422);
      }
    } else {
      allocations = [];
    }

    const payment = await Payment.create({
      number: await nextPaymentNumber(direction, date),
      party: party._id,
      partyName: party.name,
      partyKind: kind,
      direction,
      date,
      amount,
      allocations,
      source: "manual",
      note: data.note,
    });

    await refreshInvoices(
      allocations.map((allocation) => allocation.invoice),
      user,
    );

    return NextResponse.json(
      { payment: toPlain<PaymentType>(payment.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
