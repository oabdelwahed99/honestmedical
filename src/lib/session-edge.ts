import { jwtVerify } from "jose";
import type { SessionPayload, SessionUser } from "@/lib/auth-types";

/** Edge-safe session verify (for proxy). Does not import next/headers. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    const session = payload as unknown as SessionPayload;
    if (!session.id || !session.role || !session.username) return null;

    return {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    };
  } catch {
    return null;
  }
}
