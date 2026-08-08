"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import {
  MOVEMENT_LABELS,
  MOVEMENT_TYPES,
  isAdjustment,
  isInbound,
  isOutbound,
  movementTotal,
  partyLabel,
  partyPlaceholder,
  type MovementType,
} from "@/lib/constants";
import { formatMoney, formatNumber, toDateInputValue } from "@/lib/format";
import { Alert } from "@/components/ui";
import type { Product } from "@/lib/types";

const TYPE_ACTIVE: Record<MovementType, string> = {
  purchase: "bg-emerald-600 text-white",
  sale: "bg-brand-600 text-white",
  return_in: "bg-teal-600 text-white",
  return_out: "bg-orange-600 text-white",
  damaged: "bg-rose-600 text-white",
  expired: "bg-fuchsia-700 text-white",
  sample: "bg-sky-600 text-white",
  adjustment: "bg-amber-500 text-white",
};

function usesSalePrice(type: MovementType): boolean {
  return type === "sale" || type === "return_in";
}

function showsPrice(type: MovementType): boolean {
  return !isAdjustment(type) && type !== "sample";
}

export function MovementForm({
  products,
  defaultType = "sale",
  defaultProductId = "",
  onSaved,
  onCancel,
}: {
  products: Product[];
  defaultType?: MovementType;
  defaultProductId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<MovementType>(defaultType);
  const [productId, setProductId] = useState(
    defaultProductId || products[0]?._id || "",
  );
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [price, setPrice] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [partyName, setPartyName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: partiesData, mutate: reloadParties } = useSWR<{
    parties: string[];
  }>("/api/parties", apiFetch);
  const parties = partiesData?.parties ?? [];

  const product = useMemo(
    () => products.find((item) => item._id === productId),
    [products, productId],
  );

  const defaultPrice = usesSalePrice(type)
    ? product?.salePrice
    : product?.purchasePrice;
  const effectivePrice =
    type === "sample"
      ? 0
      : price === ""
        ? (defaultPrice ?? 0)
        : Number(price);
  const quantityValue = Number(quantity || 0);
  const balanceBefore = product?.quantity ?? 0;

  const balanceAfter = isAdjustment(type)
    ? quantityValue
    : isOutbound(type)
      ? balanceBefore - quantityValue
      : balanceBefore + quantityValue;

  const purchasePrice = usesSalePrice(type)
    ? (product?.purchasePrice ?? 0)
    : effectivePrice;
  const salePrice = usesSalePrice(type)
    ? effectivePrice
    : (product?.salePrice ?? 0);

  const total = movementTotal(
    type,
    quantityValue,
    purchasePrice,
    salePrice,
  );

  const notEnoughStock = isOutbound(type) && quantityValue > balanceBefore;

  function selectType(next: MovementType) {
    setType(next);
    setPrice("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!productId) {
      setError("اختر الصنف أولاً");
      return;
    }
    if (!isAdjustment(type) && quantityValue <= 0) {
      setError("أدخل كمية أكبر من صفر");
      return;
    }
    if (!partyName.trim()) {
      setError(`أدخل ${partyLabel(type)}`);
      return;
    }
    if (notEnoughStock) {
      setError(
        `الرصيد المتاح ${formatNumber(balanceBefore)} لا يكفي لتسجيل "${MOVEMENT_LABELS[type]}" بكمية ${formatNumber(quantityValue)}`,
      );
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/movements", {
        method: "POST",
        body: JSON.stringify({
          productId,
          type,
          quantity: quantityValue,
          date: date || undefined,
          ...(type === "purchase" ||
          type === "return_out" ||
          type === "damaged" ||
          type === "expired"
            ? { purchasePrice: effectivePrice }
            : {}),
          ...(type === "sale" || type === "return_in"
            ? { salePrice: effectivePrice }
            : {}),
          ...(expiryDate ? { expiryDate } : {}),
          partyName: partyName.trim(),
          note,
        }),
      });
      await reloadParties();
      onSaved();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="text-center">
        <p className="text-sm text-slate-600">
          لا توجد أصناف بعد. أضف صنفاً أولاً من صفحة الأصناف ثم سجّل الحركات.
        </p>
        <button type="button" className="btn-ghost mt-4" onClick={onCancel}>
          إغلاق
        </button>
      </div>
    );
  }

  const priceLabel = usesSalePrice(type)
    ? type === "return_in"
      ? "قيمة المرتجع للوحدة"
      : "سعر البيع للوحدة"
    : type === "damaged" || type === "expired"
      ? "تكلفة الوحدة (سعر الشراء)"
      : type === "return_out"
        ? "سعر الشراء للوحدة"
        : "سعر الشراء للوحدة";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error ? <Alert message={error} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
        {MOVEMENT_TYPES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => selectType(value)}
            className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
              type === value
                ? TYPE_ACTIVE[value]
                : "text-slate-600 hover:bg-white"
            }`}
          >
            {MOVEMENT_LABELS[value]}
          </button>
        ))}
      </div>

      {type === "sample" ? (
        <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          العينات مجانية دائماً — لا يُحسب عليها مبلغ.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="movement-product">
            الصنف
          </label>
          <select
            id="movement-product"
            className="field-input"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setPrice("");
            }}
          >
            {products.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} — {item.unit} (الرصيد: {item.quantity})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="movement-quantity">
            {isAdjustment(type) ? "الكمية الفعلية بعد الجرد" : "الكمية"}
          </label>
          <input
            id="movement-quantity"
            type="number"
            min="0"
            step="any"
            className="field-input"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="movement-date">
            التاريخ
          </label>
          <input
            id="movement-date"
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        {showsPrice(type) ? (
          <div>
            <label className="field-label" htmlFor="movement-price">
              {priceLabel}
            </label>
            <input
              id="movement-price"
              type="number"
              min="0"
              step="any"
              className="field-input"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={String(defaultPrice ?? 0)}
            />
            <p className="mt-1 text-xs text-slate-400">
              اتركه فارغاً لاستخدام سعر الصنف المحفوظ.
            </p>
          </div>
        ) : null}

        {type === "purchase" ? (
          <div>
            <label className="field-label" htmlFor="movement-expiry">
              تاريخ الصلاحية
            </label>
            <input
              id="movement-expiry"
              type="date"
              className="field-input"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="movement-party">
            {partyLabel(type)} <span className="text-rose-500">*</span>
          </label>
          <input
            id="movement-party"
            className="field-input"
            list="party-suggestions"
            value={partyName}
            onChange={(event) => setPartyName(event.target.value)}
            placeholder={partyPlaceholder(type)}
            required
            autoComplete="off"
          />
          <datalist id="party-suggestions">
            {parties.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="movement-note">
            ملاحظات
          </label>
          <input
            id="movement-note"
            className="field-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="أي تفاصيل إضافية (اختياري)"
          />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center">
        <div>
          <dt className="text-xs text-slate-500">الرصيد قبل</dt>
          <dd className="mt-1 font-bold text-slate-900">
            {formatNumber(balanceBefore)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">الرصيد بعد</dt>
          <dd
            className={`mt-1 font-bold ${
              notEnoughStock ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {formatNumber(balanceAfter)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">الإجمالي</dt>
          <dd className="mt-1 font-bold text-slate-900">
            {formatMoney(total)}
          </dd>
        </div>
      </dl>

      {isInbound(type) && type !== "purchase" ? (
        <p className="mt-2 text-center text-xs text-teal-700">
          هذه الحركة تزيد رصيد المخزون
        </p>
      ) : null}
      {isOutbound(type) ? (
        <p className="mt-2 text-center text-xs text-slate-500">
          هذه الحركة تنقص رصيد المخزون
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={saving || notEnoughStock}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          تسجيل الحركة
        </button>
      </div>
    </form>
  );
}
