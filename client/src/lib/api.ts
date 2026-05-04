import { getDeviceKey } from "./device-key.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  signal?: AbortSignal;
}

function buildQuery(query: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(k, v.join(","));
    } else {
      params.set(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${path}${buildQuery(options.query)}`;
  const headers: Record<string, string> = {
    "X-Device-Key": getDeviceKey(),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: "same-origin",
  });

  if (!res.ok) {
    let payload: { error?: string; code?: string; fields?: Record<string, string[]> } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      // Response wasn't JSON — fall through with empty payload.
    }
    throw new ApiError(
      res.status,
      payload.code ?? "UNKNOWN",
      payload.error ?? `Request failed: ${res.status}`,
      payload.fields,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
