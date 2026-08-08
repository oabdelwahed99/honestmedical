import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "الرئيسية",
};

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="landing-shell relative min-h-screen overflow-hidden">
      <div className="landing-glow" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 md:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-lg font-black text-white shadow-lg shadow-brand-600/25">
            +
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-slate-900">
              Honest Medical
            </p>
            <p className="text-xs font-medium text-slate-500">
              أنظمة المخزون والمحاسبة الطبية
            </p>
          </div>
        </div>
        <Link href="/login" className="btn-primary">
          تسجيل الدخول
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-6xl flex-col justify-center px-5 pb-16 pt-8 md:px-8 md:pb-24">
        <div className="landing-hero-panel max-w-3xl">
          <p className="mb-4 text-sm font-semibold text-brand-700">
            منصة تشغيل داخلية موثوقة
          </p>

          <h1 className="landing-brand-title text-5xl font-black leading-[1.1] tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
            Honest Medical
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 md:text-xl">
            نظام عربي لإدارة أصناف المستودع، الحركات، الفواتير، والتقارير
            المالية — بدرجة صلاحيات تناسب المدير والمحاسب.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn-primary px-6 py-3 text-base">
              ادخل إلى النظام
              <span aria-hidden>←</span>
            </Link>
            <p className="text-sm text-slate-500">
              للمديرين والمحاسبين المعتمدين فقط
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
