import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { canonicalHash } from "../utils/crypto";
import { AppError } from "../utils/envelope";

export async function checkIdempotency(req: Request, routeKey: string): Promise<{
  key: string;
  requestHash: string;
  cachedResponse: { statusCode: number; body: any } | null;
}> {
  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key) {
    throw new AppError(422, "VALIDATION_ERROR", "Missing required Idempotency-Key header");
  }
  const actorId = req.auth!.userId;
  const workspaceId = req.auth!.workspaceId;
  const requestHash = canonicalHash(req.body || {});

  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      actorId_workspaceId_route_key: {
        actorId,
        workspaceId,
        route: routeKey,
        key,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key was already used with a different request payload"
      );
    }
    return {
      key,
      requestHash,
      cachedResponse: { statusCode: existing.statusCode, body: existing.response },
    };
  }

  return { key, requestHash, cachedResponse: null };
}

export async function saveIdempotency(
  req: Request,
  routeKey: string,
  key: string,
  requestHash: string,
  statusCode: number,
  responseBody: any
) {
  await prisma.idempotencyRecord.create({
    data: {
      actorId: req.auth!.userId,
      workspaceId: req.auth!.workspaceId,
      route: routeKey,
      key,
      requestHash,
      statusCode,
      response: responseBody,
    },
  });
}
