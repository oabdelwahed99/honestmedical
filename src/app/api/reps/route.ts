import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { SalesRep } from "@/models/SalesRep";
import type { SalesRep as SalesRepType } from "@/lib/types";

const repInput = z.object({
  name: z.string().trim().min(1, "أدخل اسم المندوب"),
  phone: z.string().trim().default(""),
  note: z.string().trim().default(""),
  active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const activeOnly = request.nextUrl.searchParams.get("active") === "1";
    const filter = activeOnly ? { active: true } : {};

    const reps = await SalesRep.find(filter)
      .sort({ active: -1, name: 1 })
      .lean();

    return NextResponse.json({ reps: toPlain<SalesRepType[]>(reps) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const data = repInput.parse(await request.json());
    const rep = await SalesRep.create(data);

    return NextResponse.json(
      { rep: toPlain<SalesRepType>(rep.toObject()) },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
