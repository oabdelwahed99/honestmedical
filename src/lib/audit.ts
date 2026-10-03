import "server-only";

import type { Types } from "mongoose";
import type { SessionUser } from "@/lib/auth-types";
import type { InvoiceKind } from "@/lib/constants";
import type { AuditAction, AuditChange } from "@/lib/types";
import { InvoiceAuditLog } from "@/models/InvoiceAuditLog";

type AuditValue = string | number | null;

/** Normalises a field value so before/after comparisons ignore noise. */
function normalizeAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return String(value);
}

export function snapshotFields<K extends string>(
  source: Record<K, unknown>,
  fields: readonly K[],
): Record<K, AuditValue> {
  return Object.fromEntries(
    fields.map((field) => [field, normalizeAuditValue(source[field])]),
  ) as Record<K, AuditValue>;
}

export function diffFields<K extends string>(
  before: Record<K, AuditValue>,
  after: Record<K, AuditValue>,
): AuditChange[] {
  return (Object.keys(before) as K[])
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export async function logInvoiceAction({
  action,
  user,
  invoice,
  changes = [],
  snapshot = null,
}: {
  action: AuditAction;
  user: SessionUser;
  invoice: {
    _id: Types.ObjectId;
    number: string;
    kind?: InvoiceKind | null;
    customerName?: string | null;
  };
  changes?: AuditChange[];
  snapshot?: unknown;
}) {
  await InvoiceAuditLog.create({
    action,
    invoice: invoice._id,
    invoiceNumber: invoice.number,
    invoiceKind: invoice.kind ?? "sale",
    customerName: invoice.customerName ?? "",
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    changes,
    snapshot,
  });
}
