import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
