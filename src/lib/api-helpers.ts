import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Converts Mongoose documents/ObjectIds/Dates into plain JSON-safe values. */
export function toPlain<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Escapes user input before embedding it in a MongoDB $regex query. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII 0-9. */
export function toLatinDigits(value: string) {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Maps thrown errors to an Arabic message the UI can show directly. */
export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return errorResponse(first?.message ?? "بيانات غير صالحة", 422);
  }

  if (error && typeof error === "object" && "code" in error) {
    if ((error as { code: number }).code === 11000) {
      return errorResponse("يوجد سجل بنفس البيانات بالفعل", 409);
    }
  }

  if (error instanceof Error) {
    if (error.name === "ValidationError") {
      return errorResponse(error.message, 422);
    }
    if (
      error.name === "MongooseServerSelectionError" ||
      error.name === "MongoNetworkError"
    ) {
      return errorResponse(
        "تعذر الاتصال بقاعدة البيانات. تأكد من تشغيل MongoDB.",
        503,
      );
    }
  }

  console.error(error);
  return errorResponse("حدث خطأ غير متوقع في الخادم", 500);
}
