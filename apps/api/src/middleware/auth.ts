import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AppError, sendError } from "../utils/envelope";
import { sha256 } from "../utils/crypto";

export interface AuthenticatedContext {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  csrfToken: string;
  workspaceId: string;
  workspaceType: "CUSTOMER" | "SELLER" | "ADMIN";
  workspaceName: string;
  merchantId: string | null;
  role: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
      rawBody?: string;
    }
  }
}

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    const rawToken =
      req.cookies?.["__Host-velapal"] ||
      req.cookies?.["velapal_session"] ||
      (req.headers["x-session-token"] as string | undefined);

    if (!rawToken) {
      throw new AppError(401, "UNAUTHENTICATED", "No active session cookie found");
    }

    const tokenHash = sha256(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppError(401, "SESSION_EXPIRED", "Session has expired or been revoked");
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.userId,
        workspaceId: session.activeWorkspaceId,
        status: "ACTIVE",
      },
      include: { workspace: true },
    });

    if (!membership) {
      throw new AppError(403, "WORKSPACE_MISMATCH", "No active membership found for current workspace");
    }

    // State-changing browser requests must pass CSRF & Origin validation
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
    if (isMutation) {
      const csrfHeader = req.headers["x-csrf-token"] as string | undefined;
      if (!csrfHeader || csrfHeader !== session.csrfToken) {
        throw new AppError(403, "FORBIDDEN", "Invalid or missing X-CSRF-Token header");
      }
      const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
      const reqOrigin = req.headers.origin;
      if (reqOrigin && reqOrigin !== allowedOrigin) {
        throw new AppError(403, "FORBIDDEN", "Origin header mismatch");
      }
    }

    req.auth = {
      userId: session.user.id,
      email: session.user.emailCanonical,
      name: session.user.name,
      sessionId: session.id,
      csrfToken: session.csrfToken,
      workspaceId: membership.workspace.id,
      workspaceType: membership.workspace.type,
      workspaceName: membership.workspace.name,
      merchantId: membership.workspace.merchantId,
      role: membership.role,
      permissions: Array.isArray(membership.permissions) ? (membership.permissions as string[]) : [],
    };

    next();
  } catch (err) {
    return sendError(res, err);
  }
}

export async function verifyStepUpToken(
  userId: string,
  stepUpId: string | undefined | null,
  expectedPurpose: string,
  expectedTargetId?: string
) {
  if (!stepUpId) {
    throw new AppError(403, "STEP_UP_REQUIRED", `Fresh MFA stepUpId required for ${expectedPurpose}`);
  }
  const ch = await prisma.mfaChallenge.findUnique({ where: { stepUpId } });
  if (
    !ch ||
    ch.userId !== userId ||
    ch.purpose !== expectedPurpose ||
    (expectedTargetId && ch.targetId && ch.targetId !== expectedTargetId) ||
    ch.expiresAt < new Date()
  ) {
    throw new AppError(403, "STEP_UP_REQUIRED", "Step-up verification is invalid, expired, or bound to a different target");
  }
}

export function requireAiCallbackAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-ai-callback-token"];
  const expected = process.env.AI_TO_EXPRESS_SECRET || "velapal-ai-to-express-secret-v61";
  if (!token || token !== expected) {
    return sendError(res, new AppError(401, "UNAUTHENTICATED", "Invalid X-AI-Callback-Token header"));
  }
  next();
}
