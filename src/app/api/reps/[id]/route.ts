import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { SalesRep } from "@/models/SalesRep";
import type { SalesRep as SalesRepType } from "@/lib/types";

const repPatch = z.object({
  name: z.string().trim().min(1, "أدخل اسم المندوب").optional(),
  phone: z.string().trim().optional(),
  note: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/reps/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المندوب غير صالح", 400);

    await connectToDatabase();

    const rep = await SalesRep.findById(id).lean();
    if (!rep) return errorResponse("المندوب غير موجود", 404);

    return NextResponse.json({ rep: toPlain<SalesRepType>(rep) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/reps/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المندوب غير صالح", 400);

    await connectToDatabase();

    const rep = await SalesRep.findById(id);
    if (!rep) return errorResponse("المندوب غير موجود", 404);

    const data = repPatch.parse(await request.json());
    Object.assign(rep, data);
    await rep.save();

    return NextResponse.json({
      rep: toPlain<SalesRepType>(rep.toObject()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/reps/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف المندوب غير صالح", 400);

    await connectToDatabase();

    // Soft-delete so historical invoices keep a readable repName.
    const rep = await SalesRep.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true },
    );

    if (!rep) return errorResponse("المندوب غير موجود", 404);

    return NextResponse.json({
      ok: true,
      rep: toPlain<SalesRepType>(rep.toObject()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
