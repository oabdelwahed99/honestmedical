import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { INVOICE_KINDS } from "@/lib/constants";

export const AUDIT_ACTIONS = ["update", "delete"] as const;

const AuditChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const AuditUserSchema = new Schema(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
    displayName: { type: String, default: "" },
    role: { type: String, required: true, enum: ["manager", "accountant"] },
  },
  { _id: false },
);

const InvoiceAuditLogSchema = new Schema(
  {
    action: { type: String, required: true, enum: AUDIT_ACTIONS, index: true },
    // Not a ref: the invoice may no longer exist after a delete.
    invoice: { type: Schema.Types.ObjectId, required: true, index: true },
    invoiceNumber: { type: String, required: true },
    invoiceKind: { type: String, enum: INVOICE_KINDS, default: "sale" },
    customerName: { type: String, default: "" },
    user: { type: AuditUserSchema, required: true },
    changes: { type: [AuditChangeSchema], default: [] },
    snapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

InvoiceAuditLogSchema.index({ createdAt: -1 });
InvoiceAuditLogSchema.index({ "user.id": 1, createdAt: -1 });

export type InvoiceAuditLogDoc = InferSchemaType<typeof InvoiceAuditLogSchema>;

export const InvoiceAuditLog: Model<InvoiceAuditLogDoc> =
  (mongoose.models.InvoiceAuditLog as Model<InvoiceAuditLogDoc>) ??
  mongoose.model<InvoiceAuditLogDoc>("InvoiceAuditLog", InvoiceAuditLogSchema);
