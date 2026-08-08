"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <div className="landing-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="landing-glow" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-slate-900"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-base font-black text-white">
              +
            </span>
            <span className="text-xl font-extrabold">Honest Medical</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            تسجيل الدخول
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            مدير النظام أو المحاسب — حسب الحساب المخصص لك
          </p>
        </div>

        <form action={action} className="card space-y-4 p-6 shadow-lg">
          <div>
            <label className="field-label" htmlFor="username">
              اسم المستخدم
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className="field-input"
              placeholder="Mohsen / Ahmed / accountant"
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="field-input"
              required
            />
          </div>

          {state?.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full py-3"
          >
            {pending ? "جاري الدخول..." : "دخول"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href="/" className="font-semibold text-brand-600 hover:underline">
            العودة للصفحة الرئيسية
          </Link>
        </p>
      </div>
    </div>
  );
}
