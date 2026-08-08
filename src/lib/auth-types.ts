export type UserRole = "manager" | "accountant";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

export type SessionPayload = SessionUser & {
  expiresAt: string;
};

export const SESSION_COOKIE = "hm_session";

export function canAccessPartners(role: UserRole) {
  return role === "manager";
}

export function roleLabel(role: UserRole) {
  return role === "manager" ? "مدير" : "محاسب";
}
