import { Response } from "express";
import { generateTraceId } from "./crypto";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public retryable: boolean = false,
    public currentVersion?: number,
    public fieldErrors: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function sendSuccess(
  res: Response,
  data: unknown,
  version: number = 1,
  statusCode: number = 200,
  traceId?: string
) {
  return res.status(statusCode).json({
    data,
    meta: {
      traceId: traceId || generateTraceId(),
      version,
      timestamp: new Date().toISOString(),
    },
  });
}

export function sendError(res: Response, err: unknown, traceId?: string) {
  const tId = traceId || generateTraceId();
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        fieldErrors: err.fieldErrors || {},
        traceId: tId,
        retryable: err.retryable,
        ...(err.currentVersion !== undefined ? { currentVersion: err.currentVersion } : {}),
      },
    });
  }
  console.error(`[ERROR ${tId}]`, err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err instanceof Error ? err.message : "Unexpected internal server error",
      fieldErrors: {},
      traceId: tId,
      retryable: false,
    },
  });
}

export function requireIfMatch(reqHeader: string | undefined, currentVersion: number): void {
  if (!reqHeader) {
    throw new AppError(409, "VERSION_CONFLICT", "Missing required If-Match version header", false, currentVersion);
  }
  const cleaned = reqHeader.replace(/"/g, "").trim();
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || parsed !== currentVersion) {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      `Expected If-Match version ${currentVersion}, but received ${cleaned}`,
      false,
      currentVersion
    );
  }
}
