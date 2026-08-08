import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api-helpers";
import { Transaction } from "@/models/Transaction";

/** Distinct customer/supplier names for autocomplete and filters. */
export async function GET() {
  try {
    await connectToDatabase();

    const parties = await Transaction.distinct("partyName", {
      partyName: { $nin: [null, ""] },
    });

    const sorted = (parties as string[])
      .map((name) => name.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ar"));

    return NextResponse.json({ parties: sorted });
  } catch (error) {
    return handleRouteError(error);
  }
}
