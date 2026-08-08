"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  TrendingUp,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { useAuth } from "@/components/auth-provider";
import { canAccessPartners, roleLabel } from "@/lib/auth-types";

const LINKS = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/products", label: "الأصناف", icon: Package },
  { href: "/movements", label: "سجل الحركات", icon: ArrowLeftRight },
  { href: "/invoices", label: "الفواتير", icon: FileText },
  { href: "/expenses", label: "المصروفات", icon: Receipt },
  { href: "/accounting", label: "التقارير المالية", icon: TrendingUp },
  { href: "/partners", label: "الشركاء", icon: Users, managersOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuth();
  const [open, setOpen] = useState(false);

  const links = LINKS.filter(
    (link) => !link.managersOnly || canAccessPartners(user.role),
  );

  const nav = (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="mt-auto border-t border-slate-200 pt-4">
      <div className="mb-3 px-2">
        <p className="text-sm font-bold text-slate-900">{user.displayName}</p>
        <p className="text-xs text-slate-500">
          {roleLabel(user.role)} · {user.username}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut size={18} />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Warehouse size={20} className="text-brand-600" />
          Honest Medical
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="القائمة"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 top-14 z-20 flex flex-col bg-white p-4 md:hidden">
          {nav}
          {account}
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-slate-200 bg-white p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 pt-2">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white">
            <Warehouse size={20} />
          </span>
          <div>
            <p className="text-base font-bold text-slate-900">Honest Medical</p>
            <p className="text-xs text-slate-500">إدارة المخزون والمحاسبة</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {nav}
          {account}
        </div>
      </aside>
    </>
  );
}
