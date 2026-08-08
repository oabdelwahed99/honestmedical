import { NextResponse, type NextRequest } from "next/server";
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

const partnerInput = z.object({
  name: z.string().trim().min(1, "أدخل اسم الشريك"),
  equityPercent: z.coerce
    .number()
    .min(0, "نسبة الملكية غير صالحة")
    .max(100, "نسبة الملكية لا تتجاوز 100%"),
  salary: z.coerce.number().min(0, "الراتب غير صالح").default(0),
  phone: z.string().trim().default(""),
  note: z.string().trim().default(""),
  active: z.boolean().default(true),
});

export async function GET() {
  try {
    await connectToDatabase();

    const partners = await Partner.find()
      .sort({ active: -1, name: 1 })
      .lean();

    return NextResponse.json({ partners: toPlain<PartnerType[]>(partners) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = partnerInput.parse(await request.json());

    const [{ total = 0 } = {}] = await Partner.aggregate<{ total: number }>([
      { $match: { active: true } },
      { $group: { _id: null, total: { $sum: "$equityPercent" } } },
    ]);

    if (data.active && total + data.equityPercent > 100.001) {
      return errorResponse(
        `مجموع نسب الملكية الحالية ${total}% ولا يمكن إضافة ${data.equityPercent}% (الحد الأقصى 100%).`,
        422,
      );
    }

    const partner = await Partner.create(data);
    await syncPartnerSalary({
      _id: partner._id,
      name: partner.name,
      salary: partner.salary,
      active: partner.active,
    });

    return NextResponse.json(
      { partner: toPlain<PartnerType>(partner.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
