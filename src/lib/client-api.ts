"use client";

import { toast } from "sonner";

/** fetch wrapper for client components: JSON in/out, readable error toasts */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown; form?: FormData; silent?: boolean }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    headers: init?.form ? undefined : { "Content-Type": "application/json" },
    body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data?.details) ? data.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join("\n") : "";
    const msg = data?.error ? `${data.error}${details ? `\n${details}` : ""}` : `Request failed (${res.status})`;
    if (!init?.silent) toast.error(msg);
    throw new Error(msg);
  }
  return data as T;
}
