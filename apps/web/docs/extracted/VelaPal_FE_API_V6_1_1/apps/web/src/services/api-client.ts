import type { ApiEnvelope, ApiErrorBody, ApiMeta } from './types';

/** Prefer same-origin /api/v1 using Next.js rewrites. Never put secrets here. */
const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1').replace(/\/$/, '');
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) { csrfToken = token; }
export function clearCsrfToken() { csrfToken = null; }
export function currentCsrfToken() { return csrfToken; }

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly traceId: string,
    public readonly retryable: boolean,
    public readonly fieldErrors: Record<string, unknown> = {},
    public readonly currentVersion?: number,
  ) { super(message); this.name = 'ApiError'; }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Exact frozen contract: If-Match is a quoted integer version, NOT a body field. */
  ifMatch?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Returns data and meta so caller can audit traceId and optimistic versions. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && !(path === '/auth/login' || (path === '/auth/mfa/verify' && !csrfToken))) {
    if (!csrfToken) throw new ApiError(0, 'CSRF_NOT_INITIALIZED', 'Restore session before mutating data.', '', false);
    headers.set('X-CSRF-Token', csrfToken);
  }
  if (options.ifMatch !== undefined) headers.set('If-Match', `"${options.ifMatch}"`);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'include', cache: 'no-store', signal: options.signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed. Check operation status before retrying a financial action.', '', true);
  }
  if (response.status === 204) return { data: undefined as T, meta: { traceId: response.headers.get('x-trace-id') || '', version: 0, timestamp: new Date().toISOString() } };
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload && typeof payload === 'object' && 'error' in payload ? (payload as ApiErrorBody).error : null);
    throw new ApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${response.status}`, error?.traceId ?? '', error?.retryable ?? false, error?.fieldErrors ?? {}, error?.currentVersion);
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !('meta' in payload)) throw new ApiError(response.status, 'INVALID_ENVELOPE', 'Response does not match frozen API envelope.', '', false);
  return payload as ApiEnvelope<T>;
}
export async function apiData<T>(path: string, opts?: RequestOptions): Promise<T> { return (await apiRequest<T>(path, opts)).data; }
export type { ApiMeta };
