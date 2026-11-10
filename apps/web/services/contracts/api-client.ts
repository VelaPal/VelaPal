import type { ApiEnvelope, ApiErrorBody, ApiMeta } from "./types";

/** Prefer same-origin /api/v1 using Next.js rewrites. Never put secrets here. */
// Frozen browser boundary stays same-origin, irrespective of legacy local env values.
const baseUrl = "/api/v1";
let csrfToken: string | null = null;
let workspaceController = new AbortController();
export function workspaceRequestSignal() {
  return workspaceController.signal;
}
export function cancelWorkspaceRequests() {
  workspaceController.abort();
  workspaceController = new AbortController();
}
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}
export function clearCsrfToken() {
  csrfToken = null;
}
export function currentCsrfToken() {
  return csrfToken;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly traceId: string,
    public readonly retryable: boolean,
    public readonly fieldErrors: Record<string, unknown> = {},
    public readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Exact frozen contract: If-Match is a quoted integer version, NOT a body field. */
  ifMatch?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Returns data and meta so caller can audit traceId and optimistic versions. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/internal/") ||
    path.includes("..")
  )
    throw new ApiError(
      0,
      "INVALID_PUBLIC_PATH",
      "Only public /api/v1 service paths are allowed.",
      "",
      false,
    );
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (
    method !== "GET" &&
    !(path === "/auth/login" || (path === "/auth/mfa/verify" && !csrfToken))
  ) {
    if (!csrfToken)
      throw new ApiError(
        0,
        "CSRF_NOT_INITIALIZED",
        "Restore session before mutating data.",
        "",
        false,
      );
    headers.set("X-CSRF-Token", csrfToken);
  }
  if (options.ifMatch !== undefined)
    headers.set("If-Match", `"${options.ifMatch}"`);
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  let response: Response;
  const signal = AbortSignal.any([
    workspaceController.signal,
    options.signal ?? AbortSignal.timeout(20000),
  ]);
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    const reason = cause instanceof Error && cause.message ? `: ${cause.message}` : ".";
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      `Network request failed${reason} Check that the API backend and API_UPSTREAM are available, then inspect browser network/CORS errors. Check operation status before retrying a financial action.`,
      "",
      true,
    );
  }
  signal.throwIfAborted();
  if (response.status === 204)
    return {
      data: undefined as T,
      meta: {
        traceId: response.headers.get("x-trace-id") || "",
        version: 0,
        timestamp: new Date().toISOString(),
      },
    };
  const responseBody = await response.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    payload = null;
  }
  signal.throwIfAborted();
  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      path !== "/auth/login" &&
      path !== "/auth/session" &&
      path !== "/auth/mfa/verify"
    )
      window.dispatchEvent(new Event("velapal:session-expired"));
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as ApiErrorBody).error
        : null;
    throw new ApiError(
      response.status,
      error?.code ?? "HTTP_ERROR",
      error?.message ??
        (responseBody.trim()
          ? `HTTP ${response.status}: ${responseBody.trim().slice(0, 500)}`
          : `HTTP ${response.status}`),
      error?.traceId ?? "",
      error?.retryable ?? false,
      error?.fieldErrors ?? {},
      error?.currentVersion,
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !("meta" in payload) ||
    !payload.meta ||
    typeof payload.meta !== "object" ||
    !("traceId" in payload.meta) ||
    typeof payload.meta.traceId !== "string" ||
    !("version" in payload.meta) ||
    typeof payload.meta.version !== "number" ||
    !("timestamp" in payload.meta) ||
    typeof payload.meta.timestamp !== "string"
  )
    throw new ApiError(
      response.status,
      "INVALID_ENVELOPE",
      "Response does not match frozen API envelope.",
      "",
      false,
    );
  return payload as ApiEnvelope<T>;
}
export async function apiData<T>(
  path: string,
  opts?: RequestOptions,
): Promise<T> {
  return (await apiRequest<T>(path, opts)).data;
}
export type { ApiMeta };
