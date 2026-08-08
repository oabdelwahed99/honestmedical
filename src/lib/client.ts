/** Thin fetch wrapper that surfaces the API's Arabic error messages. */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (payload as { error?: string } | null)?.error ?? "تعذر تنفيذ الطلب",
    );
  }

  return payload as T;
}
