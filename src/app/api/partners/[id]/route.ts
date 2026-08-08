import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { syncPartnerSalary } from "@/lib/partner-salary";
import { Partner } from "@/models/Partner";
import type { Partner as PartnerType } from "@/lib/types";

const partnerPatch = z.object({
  name: z.string().trim().min(1, "أدخل اسم الشريك").optional(),
  equityPercent: z.coerce
    .number()
    .min(0, "نسبة الملكية غير صالحة")
    .max(100, "نسبة الملكية لا تتجاوز 100%")
    .optional(),
  salary: z.coerce.number().min(0, "الراتب غير صالح").optional(),
  phone: z.string().trim().optional(),
  note: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/partners/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الشريك غير صالح", 400);

    await connectToDatabase();

    const partner = await Partner.findById(id).lean();
    if (!partner) return errorResponse("الشريك غير موجود", 404);

    return NextResponse.json({ partner: toPlain<PartnerType>(partner) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/partners/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الشريك غير صالح", 400);

    await connectToDatabase();

    const partner = await Partner.findById(id);
    if (!partner) return errorResponse("الشريك غير موجود", 404);

    const data = partnerPatch.parse(await request.json());

    const nextActive = data.active ?? partner.active;
    const nextEquity = data.equityPercent ?? partner.equityPercent;

    if (nextActive) {
      const [{ total = 0 } = {}] = await Partner.aggregate<{ total: number }>([
        { $match: { active: true, _id: { $ne: partner._id } } },
        { $group: { _id: null, total: { $sum: "$equityPercent" } } },
      ]);

      if (total + nextEquity > 100.001) {
        return errorResponse(
          `مجموع نسب بقية الشركاء ${total}% ولا يمكن ضبط نسبة هذا الشريك على ${nextEquity}% (الحد الأقصى 100%).`,
          422,
        );
      }
    }

    Object.assign(partner, data);
    await partner.save();
    await syncPartnerSalary({
      _id: partner._id,
      name: partner.name,
      salary: partner.salary,
      active: partner.active,
    });

    return NextResponse.json({
      partner: toPlain<PartnerType>(partner.toObject()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/partners/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الشريك غير صالح", 400);

    await connectToDatabase();

    // Soft-delete by deactivating so historical entries stay readable.
    const partner = await Partner.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true },
    );

    if (!partner) return errorResponse("الشريك غير موجود", 404);

    await syncPartnerSalary({
      _id: partner._id,
      name: partner.name,
      salary: partner.salary,
      active: false,
    });

    return NextResponse.json({
      ok: true,
      partner: toPlain<PartnerType>(partner.toObject()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
