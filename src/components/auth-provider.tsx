"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth-types";

const AuthContext = createContext<SessionUser | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthContext);
  if (!user) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return user;
}

export function useAuthOptional() {
  return useContext(AuthContext);
}
