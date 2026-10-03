import { NextResponse, type NextRequest } from "next/server";
import {
  errorResponse,
  escapeRegex,
  handleRouteError,
  toPlain,
} from "@/lib/api-helpers";
import { canViewAudit } from "@/lib/auth-types";
import { connectToDatabase } from "@/lib/mongodb";
import { resolvePeriod } from "@/lib/period";
import { getSessionUser } from "@/lib/session";
import { InvoiceAuditLog } from "@/models/InvoiceAuditLog";
import type { InvoiceAuditEntry } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return errorResponse("يجب تسجيل الدخول أولاً", 401);
    if (!canViewAudit(user.role)) {
      return errorResponse("ليس لديك صلاحية للوصول لسجل التعديلات", 403);
    }

    await connectToDatabase();

    const params = request.nextUrl.searchParams;
    const filter: Record<string, unknown> = {};

    const action = params.get("action");
    if (action === "update" || action === "delete") filter.action = action;

    const userId = params.get("userId");
    if (userId) filter["user.id"] = userId;

    const search = params.get("search")?.trim();
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: escapeRegex(search), $options: "i" } },
        { customerName: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    if (params.get("from") || params.get("to")) {
      try {
        const period = resolvePeriod({
          from: params.get("from"),
          to: params.get("to"),
        });
        filter.createdAt = { $gte: period.start, $lte: period.end };
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "فترة غير صالحة",
          422,
        );
      }
    }

    const limit = Math.min(Number(params.get("limit")) || 500, 500);

    const [entries, users] = await Promise.all([
      InvoiceAuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      InvoiceAuditLog.aggregate<{
        _id: string;
        displayName: string;
        username: string;
        role: string;
      }>([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$user.id",
            displayName: { $first: "$user.displayName" },
            username: { $first: "$user.username" },
            role: { $first: "$user.role" },
          },
        },
        { $sort: { displayName: 1 } },
      ]),
    ]);

    return NextResponse.json({
      entries: toPlain<InvoiceAuditEntry[]>(entries),
      users: users.map(({ _id, ...rest }) => ({ id: _id, ...rest })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
