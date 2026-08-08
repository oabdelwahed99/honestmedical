import type { SessionUser } from "@/lib/auth-types";

type ConfiguredUser = SessionUser & { password: string };

function env(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

/** Fixed accounts loaded from environment variables. */
export function getConfiguredUsers(): ConfiguredUser[] {
  const users: ConfiguredUser[] = [
    {
      id: "mohsen",
      username: env("AUTH_MOHSEN_USERNAME", "Mohsen"),
      displayName: env("AUTH_MOHSEN_DISPLAY_NAME", "محسن"),
      password: env("AUTH_MOHSEN_PASSWORD", ""),
      role: "manager",
    },
    {
      id: "ahmed",
      username: env("AUTH_AHMED_USERNAME", "Ahmed"),
      displayName: env("AUTH_AHMED_DISPLAY_NAME", "أحمد"),
      password: env("AUTH_AHMED_PASSWORD", ""),
      role: "manager",
    },
    {
      id: "accountant",
      username: env("AUTH_ACCOUNTANT_USERNAME", "accountant"),
      displayName: env("AUTH_ACCOUNTANT_DISPLAY_NAME", "المحاسب"),
      password: env("AUTH_ACCOUNTANT_PASSWORD", ""),
      role: "accountant",
    },
  ];

  return users.filter((user) => user.password.length > 0);
}

export function findUserByCredentials(
  username: string,
  password: string,
): SessionUser | null {
  const normalized = username.trim().toLowerCase();
  const match = getConfiguredUsers().find(
    (user) =>
      user.username.toLowerCase() === normalized && user.password === password,
  );

  if (!match) return null;

  return {
    id: match.id,
    username: match.username,
    displayName: match.displayName,
    role: match.role,
  };
}
