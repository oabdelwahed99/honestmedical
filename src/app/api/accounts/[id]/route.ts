import { NextResponse, type NextRequest } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import {
  errorResponse,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { buildAccountDetails, ensureLedgerMigrated } from "@/lib/accounts";
import { Party } from "@/models/Party";
import type { Party as PartyType } from "@/lib/types";

const partyPatch = z.object({
  phone: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/accounts/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الحساب غير صالح", 400);

    await connectToDatabase();
    await ensureLedgerMigrated();

    const details = await buildAccountDetails(id);
    if (!details) return errorResponse("الحساب غير موجود", 404);

    return NextResponse.json(details);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/accounts/[id]">,
) {
  try {
    const { id } = await context.params;
    if (!isValidObjectId(id)) return errorResponse("معرّف الحساب غير صالح", 400);

    await connectToDatabase();

    const data = partyPatch.parse(await request.json());
    const party = await Party.findByIdAndUpdate(id, { $set: data }, { new: true });
    if (!party) return errorResponse("الحساب غير موجود", 404);

    return NextResponse.json({ party: toPlain<PartyType>(party.toObject()) });
  } catch (error) {
    return handleRouteError(error);
  }
}
