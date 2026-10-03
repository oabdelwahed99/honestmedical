import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { refreshInvoices, roundMoney } from "@/lib/accounts";
import { ReturnError, receiveReplacements } from "@/lib/returns";
import { getSessionUser } from "@/lib/session";
import { StockError, undoMovement } from "@/lib/stock";
import { ReturnNote } from "@/models/ReturnNote";
import type { ReturnNote as ReturnNoteType } from "@/lib/types";

const replacementsInput = z.object({
  date: z.string().optional(),
  replacements: z
    .array(
      z.object({
        productId: z.string().refine(isValidObjectId, "اختر صنف البدل"),
        quantity: z.coerce.number().gt(0, "كمية البدل يجب أن تكون أكبر من صفر"),
        purchasePrice: z.coerce.number().min(0, "سعر البدل غير صالح").optional(),
        expiryDate: z.string().nullable().optional(),
      }),
    )
    .min(1, "أضف صنفاً بديلاً واحداً على الأقل"),
});

/** Records exchange goods received after the return note was created. */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/returns/[id]/replacements">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الاذن غير صالح", 400);

    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);

    await connectToDatabase();

    const note = await ReturnNote.findById(id);
    if (!note) return errorResponse("اذن الارتجاع غير موجود", 404);
    if (note.settlement !== "exchange") {
      return errorResponse("استلام البدل متاح لاذون التبديل فقط", 422);
    }

    const data = replacementsInput.parse(await request.json());
    const received = await receiveReplacements({
      noteId: note._id,
      noteNumber: note.number,
      invoiceNumber: note.invoiceNumber,
      partyName: note.partyName,
      date: data.date ? new Date(data.date) : new Date(),
      replacements: data.replacements,
    });

    try {
      note.replacements.push(...received.rows);
      note.movements.push(...received.movementIds);
      note.replacementValue = roundMoney(
        note.replacements.reduce((sum, row) => sum + row.total, 0),
      );
      note.moneyEffect = roundMoney(note.goodsValue - note.replacementValue);
      await note.save();
    } catch (error) {
      for (const movementId of received.movementIds) {
        await undoMovement(movementId);
      }
      throw error;
    }

    await refreshInvoices([note.invoice], user);

    return NextResponse.json({
      returnNote: toPlain<ReturnNoteType>(note.toObject()),
    });
  } catch (error) {
    if (error instanceof ReturnError || error instanceof StockError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
