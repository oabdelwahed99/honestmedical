"use server";

import { redirect } from "next/navigation";
import { findUserByCredentials } from "@/lib/auth-users";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!username.trim() || !password) {
    return { error: "أدخل اسم المستخدم وكلمة المرور" };
  }

  let user;
  try {
    user = findUserByCredentials(username, password);
  } catch {
    return { error: "إعدادات تسجيل الدخول غير مكتملة على الخادم" };
  }

  if (!user) {
    return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  }

  if (!process.env.AUTH_SECRET) {
    return { error: "إعدادات تسجيل الدخول غير مكتملة على الخادم" };
  }

  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
