import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api-helpers";
import { buildAccountRows, ensureLedgerMigrated } from "@/lib/accounts";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    await ensureLedgerMigrated();

    const params = request.nextUrl.searchParams;
    const kind = params.get("kind") === "supplier" ? "supplier" : "customer";
    const search = params.get("search")?.trim() || undefined;

    const accounts = await buildAccountRows(kind, search);
    return NextResponse.json({ accounts });
  } catch (error) {
    return handleRouteError(error);
  }
}
