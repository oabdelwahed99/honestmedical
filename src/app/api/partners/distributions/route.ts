import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { buildAccountingSummary } from "@/lib/accounting";
import { resolvePeriod } from "@/lib/period";
import { Partner } from "@/models/Partner";
import { PartnerEntry } from "@/models/PartnerEntry";
import type { PartnerEntry as PartnerEntryType } from "@/lib/types";

const distributeInput = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "صيغة الشهر غير صالحة. استخدم YYYY-MM"),
  amount: z.coerce.number().min(0).optional(),
  note: z.string().trim().default(""),
});

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = distributeInput.parse(await request.json());
    const period = resolvePeriod({ month: data.month });

    const existing = await PartnerEntry.countDocuments({
      type: "distribution",
      period: data.month,
    });
    if (existing > 0) {
      return errorResponse("تم توزيع أرباح هذا الشهر بالفعل", 409);
    }

    const partners = await Partner.find({ active: true }).sort({ name: 1 });
    if (partners.length === 0) {
      return errorResponse("لا يوجد شركاء نشطون للتوزيع", 422);
    }

    const totalEquity = partners.reduce(
      (sum, partner) => sum + partner.equityPercent,
      0,
    );
    if (Math.abs(totalEquity - 100) > 0.01) {
      return errorResponse(
        `مجموع نسب الملكية هو ${totalEquity}% ويجب أن يساوي 100% قبل التوزيع.`,
        422,
      );
    }

    const accounting = await buildAccountingSummary(period);
    const distributable =
      data.amount !== undefined
        ? data.amount
        : Math.max(0, accounting.netProfit);

    if (distributable <= 0) {
      return errorResponse(
        "لا يوجد ربح قابل للتوزيع في هذا الشهر (صافي الربح صفر أو سالب).",
        422,
      );
    }

    const date = period.end;
    const created: PartnerEntryType[] = [];
    let allocated = 0;

    for (let index = 0; index < partners.length; index += 1) {
      const partner = partners[index];
      const isLast = index === partners.length - 1;
      const amount = isLast
        ? Math.round((distributable - allocated) * 100) / 100
        : Math.round(((distributable * partner.equityPercent) / 100) * 100) /
          100;
      allocated += amount;

      const entry = await PartnerEntry.create({
        partner: partner._id,
        partnerName: partner.name,
        type: "distribution",
        amount,
        date,
        period: data.month,
        note:
          data.note ||
          `توزيع أرباح ${period.label} — ${partner.equityPercent}%`,
      });
      created.push(toPlain<PartnerEntryType>(entry.toObject()));
    }

    return NextResponse.json(
      {
        entries: created,
        month: data.month,
        amount: distributable,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();

    const month = request.nextUrl.searchParams.get("month")?.trim();
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return errorResponse("صيغة الشهر غير صالحة. استخدم YYYY-MM", 422);
    }

    const result = await PartnerEntry.deleteMany({
      type: "distribution",
      period: month,
    });

    if (result.deletedCount === 0) {
      return errorResponse("لا يوجد توزيع لهذا الشهر", 404);
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deletedCount,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
