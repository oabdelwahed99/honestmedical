import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { errorResponse, handleRouteError } from "@/lib/api-helpers";
import { ensureLedgerMigrated } from "@/lib/accounts";
import {
  ReturnError,
  loadReturnableInvoice,
  toLookupResponse,
} from "@/lib/returns";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    await ensureLedgerMigrated();

    const params = request.nextUrl.searchParams;
    const direction = params.get("direction") === "supplier" ? "supplier" : "customer";
    const loaded = await loadReturnableInvoice(
      direction,
      params.get("invoiceNumber") ?? "",
      params.get("statementNumber") ?? "",
    );

    return NextResponse.json(toLookupResponse(loaded));
  } catch (error) {
    if (error instanceof ReturnError) {
      return errorResponse(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
