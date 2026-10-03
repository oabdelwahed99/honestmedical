import "server-only";

import type { Types } from "mongoose";
import { escapeRegex, toPlain } from "@/lib/api-helpers";
import { diffFields, logInvoiceAction, snapshotFields } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth-types";
import {
  INVOICE_KIND_LABELS,
  PAYMENT_DIRECTION_LABELS,
  RETURN_DIRECTION_LABELS,
  RETURN_SETTLEMENT_LABELS,
  partyKindForInvoice,
  settlingDirection,
  type InvoiceKind,
  type InvoiceStatus,
  type PartyKind,
  type PaymentDirection,
  type ReturnSettlement,
} from "@/lib/constants";
import { Invoice } from "@/models/Invoice";
import { Party } from "@/models/Party";
import { Payment } from "@/models/Payment";
import { ReturnNote } from "@/models/ReturnNote";
import type {
  AccountDetails,
  AccountRow,
  AccountTotals,
  OpenInvoice,
  Party as PartyType,
  StatementEntry,
} from "@/lib/types";

export const MONEY_EPSILON = 0.005;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function invoiceStatus(
  total: number,
  returnedTotal: number,
  amountPaid: number,
): InvoiceStatus {
  const due = total - returnedTotal;
  if (due <= MONEY_EPSILON) return "paid";
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + MONEY_EPSILON >= due) return "paid";
  return "partial";
}

export function invoiceRemaining(invoice: {
  total: number;
  returnedTotal?: number | null;
  amountPaid: number;
}): number {
  return Math.max(
    0,
    roundMoney(invoice.total - (invoice.returnedTotal ?? 0) - invoice.amountPaid),
  );
}

async function nextNumber(
  prefix: string,
  date: Date,
  latest: (pattern: string) => Promise<{ number?: string } | null>,
): Promise<string> {
  const full = `${prefix}-${date.getFullYear()}-`;
  const found = await latest(`^${full}`);
  let seq = 1;
  const match = found?.number ? /-(\d+)$/.exec(found.number) : null;
  if (match) seq = Number(match[1]) + 1;
  return `${full}${String(seq).padStart(4, "0")}`;
}

export function nextPaymentNumber(direction: PaymentDirection, date: Date) {
  return nextNumber(direction === "in" ? "RCV" : "PAY", date, (pattern) =>
    Payment.findOne({ number: { $regex: pattern } })
      .sort({ number: -1 })
      .select("number")
      .lean(),
  );
}

export function nextReturnNumber(direction: PartyKind, date: Date) {
  return nextNumber(direction === "customer" ? "RET" : "PRET", date, (pattern) =>
    ReturnNote.findOne({ number: { $regex: pattern } })
      .sort({ number: -1 })
      .select("number")
      .lean(),
  );
}

export async function findOrCreateParty(kind: PartyKind, rawName: string) {
  const name = rawName.trim();
  const existing = await Party.findOne({ kind, name });
  if (existing) return existing;
  try {
    return await Party.create({ kind, name });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const created = await Party.findOne({ kind, name });
      if (created) return created;
    }
    throw error;
  }
}

async function migrateLedger() {
  const pending = await Invoice.find({ ledgerReady: { $ne: true } }).sort({
    date: 1,
    createdAt: 1,
  });

  for (const invoice of pending) {
    const kind = partyKindForInvoice((invoice.kind ?? "sale") as InvoiceKind);
    const partyId =
      invoice.party ??
      (await findOrCreateParty(kind, invoice.customerName))._id;

    const paid = invoice.amountPaid ?? 0;
    if (
      paid > 0 &&
      !(await Payment.exists({ "allocations.invoice": invoice._id }))
    ) {
      const direction = settlingDirection(kind);
      await Payment.create({
        number: await nextPaymentNumber(direction, invoice.date),
        party: partyId,
        partyName: invoice.customerName,
        partyKind: kind,
        direction,
        date: invoice.date,
        amount: paid,
        allocations: [
          { invoice: invoice._id, invoiceNumber: invoice.number, amount: paid },
        ],
        source: "migrated",
        note: "سداد مرحّل",
      });
    }

    await Invoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          party: partyId,
          returnedTotal: invoice.returnedTotal ?? 0,
          ledgerReady: true,
        },
      },
    );
  }
}

let migration: Promise<void> | null = null;

/** Links legacy invoices to parties and turns their amountPaid into payments. */
export function ensureLedgerMigrated(): Promise<void> {
  migration ??= migrateLedger().finally(() => {
    migration = null;
  });
  return migration;
}

const REFRESH_AUDITED = ["amountPaid", "returnedTotal", "status"] as const;

/** Recomputes amountPaid / returnedTotal / status from payments and returns. */
export async function refreshInvoices(
  invoiceIds: (Types.ObjectId | string)[],
  user?: SessionUser | null,
) {
  const unique = [...new Set(invoiceIds.map(String))];

  for (const id of unique) {
    const invoice = await Invoice.findById(id);
    if (!invoice) continue;

    const before = snapshotFields(invoice.toObject(), REFRESH_AUDITED);

    const [paidRow] = await Payment.aggregate<{ total: number }>([
      { $match: { "allocations.invoice": invoice._id } },
      { $unwind: "$allocations" },
      { $match: { "allocations.invoice": invoice._id } },
      { $group: { _id: null, total: { $sum: "$allocations.amount" } } },
    ]);
    const [returnRow] = await ReturnNote.aggregate<{ total: number }>([
      { $match: { invoice: invoice._id } },
      { $group: { _id: null, total: { $sum: "$moneyEffect" } } },
    ]);

    invoice.amountPaid = roundMoney(paidRow?.total ?? 0);
    invoice.returnedTotal = roundMoney(returnRow?.total ?? 0);
    invoice.status = invoiceStatus(
      invoice.total,
      invoice.returnedTotal,
      invoice.amountPaid,
    );
    await invoice.save();

    if (user) {
      const changes = diffFields(
        before,
        snapshotFields(invoice.toObject(), REFRESH_AUDITED),
      );
      if (changes.length > 0) {
        await logInvoiceAction({ action: "update", user, invoice, changes });
      }
    }
  }
}

export async function openInvoicesFor(
  partyId: Types.ObjectId | string,
): Promise<OpenInvoice[]> {
  const invoices = await Invoice.find({ party: partyId })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  return invoices
    .map((invoice) => ({
      _id: String(invoice._id),
      number: invoice.number,
      statementNumber: invoice.statementNumber ?? "",
      date: invoice.date.toISOString(),
      total: invoice.total,
      returnedTotal: invoice.returnedTotal ?? 0,
      amountPaid: invoice.amountPaid,
      remaining: invoiceRemaining(invoice),
    }))
    .filter((invoice) => invoice.remaining > MONEY_EPSILON);
}

/** Oldest-first allocation of an amount over open invoices. */
export function autoAllocate(
  openInvoices: OpenInvoice[],
  amount: number,
): { invoiceId: string; amount: number }[] {
  let left = amount;
  const allocations: { invoiceId: string; amount: number }[] = [];
  for (const invoice of openInvoices) {
    if (left <= MONEY_EPSILON) break;
    const share = roundMoney(Math.min(left, invoice.remaining));
    if (share > 0) {
      allocations.push({ invoiceId: invoice._id, amount: share });
      left = roundMoney(left - share);
    }
  }
  return allocations;
}

function emptyTotals(): AccountTotals {
  return { invoiceCount: 0, invoiced: 0, paid: 0, returned: 0, balance: 0 };
}

function finishTotals(totals: AccountTotals): AccountTotals {
  const invoiced = roundMoney(totals.invoiced);
  const paid = roundMoney(totals.paid);
  const returned = roundMoney(totals.returned);
  return {
    invoiceCount: totals.invoiceCount,
    invoiced,
    paid,
    returned,
    balance: roundMoney(invoiced - paid - returned),
  };
}

export async function buildAccountRows(
  kind: PartyKind,
  search?: string,
): Promise<AccountRow[]> {
  const filter: Record<string, unknown> = { kind };
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

  const parties = await Party.find(filter).sort({ name: 1 }).lean();
  const ids = parties.map((party) => party._id);
  const settling = settlingDirection(kind);

  const [invoiceRows, paymentRows, returnRows] = await Promise.all([
    Invoice.aggregate<{ _id: Types.ObjectId; count: number; total: number; last: Date }>([
      { $match: { party: { $in: ids } } },
      {
        $group: {
          _id: "$party",
          count: { $sum: 1 },
          total: { $sum: "$total" },
          last: { $max: "$date" },
        },
      },
    ]),
    Payment.aggregate<{
      _id: { party: Types.ObjectId; direction: PaymentDirection };
      total: number;
      last: Date;
    }>([
      { $match: { party: { $in: ids } } },
      {
        $group: {
          _id: { party: "$party", direction: "$direction" },
          total: { $sum: "$amount" },
          last: { $max: "$date" },
        },
      },
    ]),
    ReturnNote.aggregate<{ _id: Types.ObjectId; total: number; last: Date }>([
      { $match: { party: { $in: ids } } },
      {
        $group: {
          _id: "$party",
          total: { $sum: "$moneyEffect" },
          last: { $max: "$date" },
        },
      },
    ]),
  ]);

  const totals = new Map<string, AccountTotals>();
  const last = new Map<string, number>();
  const bump = (id: string, date: Date) => {
    last.set(id, Math.max(last.get(id) ?? 0, new Date(date).getTime()));
  };
  const get = (id: string) => {
    let row = totals.get(id);
    if (!row) {
      row = emptyTotals();
      totals.set(id, row);
    }
    return row;
  };

  for (const row of invoiceRows) {
    const id = String(row._id);
    get(id).invoiceCount = row.count;
    get(id).invoiced = row.total;
    bump(id, row.last);
  }
  for (const row of paymentRows) {
    const id = String(row._id.party);
    get(id).paid += row._id.direction === settling ? row.total : -row.total;
    bump(id, row.last);
  }
  for (const row of returnRows) {
    const id = String(row._id);
    get(id).returned = row.total;
    bump(id, row.last);
  }

  return toPlain<PartyType[]>(parties).map((party) => {
    const lastTime = last.get(party._id);
    return {
      party,
      ...finishTotals(totals.get(party._id) ?? emptyTotals()),
      lastActivity: lastTime ? new Date(lastTime).toISOString() : null,
    };
  });
}

export async function buildAccountDetails(
  partyId: string,
): Promise<AccountDetails | null> {
  const partyDoc = await Party.findById(partyId).lean();
  if (!partyDoc) return null;
  const party = toPlain<PartyType>(partyDoc);
  const kind = party.kind;
  const settling = settlingDirection(kind);

  const [invoices, payments, returns] = await Promise.all([
    Invoice.find({ party: partyDoc._id }).lean(),
    Payment.find({ party: partyDoc._id }).lean(),
    ReturnNote.find({ party: partyDoc._id }).lean(),
  ]);

  type Raw = Omit<StatementEntry, "debit" | "credit" | "balance"> & {
    createdAt: number;
    increase: number;
    decrease: number;
  };
  const raw: Raw[] = [];
  const totals = emptyTotals();

  for (const invoice of invoices) {
    totals.invoiceCount += 1;
    totals.invoiced += invoice.total;
    const kindLabel = INVOICE_KIND_LABELS[(invoice.kind ?? "sale") as InvoiceKind];
    raw.push({
      kind: "invoice",
      id: String(invoice._id),
      number: invoice.number,
      date: invoice.date.toISOString(),
      description: invoice.statementNumber
        ? `${kindLabel} · بيان ${invoice.statementNumber}`
        : kindLabel,
      createdAt: new Date(invoice.createdAt).getTime(),
      increase: invoice.total,
      decrease: 0,
    });
  }

  for (const payment of payments) {
    const settles = payment.direction === settling;
    totals.paid += settles ? payment.amount : -payment.amount;
    const allocated = payment.allocations
      .map((allocation) => allocation.invoiceNumber)
      .join("، ");
    raw.push({
      kind: "payment",
      id: String(payment._id),
      number: payment.number,
      date: payment.date.toISOString(),
      description: [
        PAYMENT_DIRECTION_LABELS[payment.direction as PaymentDirection],
        allocated ? `على ${allocated}` : "",
        payment.note,
      ]
        .filter(Boolean)
        .join(" · "),
      createdAt: new Date(payment.createdAt).getTime(),
      increase: settles ? 0 : payment.amount,
      decrease: settles ? payment.amount : 0,
    });
  }

  for (const note of returns) {
    totals.returned += note.moneyEffect;
    raw.push({
      kind: "return",
      id: String(note._id),
      number: note.number,
      date: note.date.toISOString(),
      description: `${RETURN_DIRECTION_LABELS[note.direction as PartyKind]} · ${
        RETURN_SETTLEMENT_LABELS[note.settlement as ReturnSettlement]
      } · ${note.invoiceNumber}`,
      createdAt: new Date(note.createdAt).getTime(),
      increase: note.moneyEffect < 0 ? -note.moneyEffect : 0,
      decrease: note.moneyEffect > 0 ? note.moneyEffect : 0,
    });
  }

  // Same-day documents keep the order they were entered (dates are day-only).
  const dayOf = (value: Date | string) =>
    Math.floor(new Date(value).getTime() / (24 * 60 * 60 * 1000));
  raw.sort(
    (a, b) => dayOf(a.date) - dayOf(b.date) || a.createdAt - b.createdAt,
  );

  let running = 0;
  const statement: StatementEntry[] = raw.map((row) => {
    running = roundMoney(running + row.increase - row.decrease);
    // Customers: invoices are debits. Suppliers: invoices are credits.
    return {
      kind: row.kind,
      id: row.id,
      number: row.number,
      date: row.date,
      description: row.description,
      debit: kind === "customer" ? row.increase : row.decrease,
      credit: kind === "customer" ? row.decrease : row.increase,
      balance: running,
    };
  });

  return {
    party,
    totals: finishTotals(totals),
    statement,
    openInvoices: await openInvoicesFor(partyDoc._id),
  };
}
