import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError, sendError, sendSuccess } from "../utils/envelope";
import { sha256 } from "../utils/crypto";
import { requireSession } from "../middleware/auth";

export const authRouter = Router();

function setSessionCookie(res: any, rawToken: string) {
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd ? "__Host-velapal" : "velapal_session";
  res.cookie(cookieName, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600 * 1000,
  });
}

// POST /api/v1/auth/login
authRouter.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new AppError(422, "VALIDATION_ERROR", "Email and password are required");
    }
    const emailCanonical = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { emailCanonical },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { workspace: true },
        },
      },
    });

    if (!user || user.passwordHash !== sha256(String(password))) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid email or password");
    }

    if (user.status !== "ACTIVE" || user.memberships.length === 0) {
      throw new AppError(403, "FORBIDDEN", "Account is not active or has no workspace membership");
    }

    // Check if user has ADMIN membership or MFA enabled
    const hasAdmin = user.memberships.some((m) => m.workspace.type === "ADMIN");
    if (user.mfaEnabled || hasAdmin) {
      const challenge = await prisma.mfaChallenge.create({
        data: {
          userId: user.id,
          purpose: "SESSION_LOGIN",
          codeHash: sha256("123456"), // Demo default TOTP code: 123456
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return sendSuccess(res, {
        status: "MFA_REQUIRED",
        challengeId: challenge.id,
        purpose: "SESSION_LOGIN",
        targetId: null,
        expiresAt: challenge.expiresAt.toISOString(),
      });
    }

    const primaryMembership = user.memberships[0];
    const rawToken = `vp_sess_${crypto.randomBytes(24).toString("hex")}`;
    const csrfToken = `csrf_${crypto.randomBytes(16).toString("hex")}`;

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        csrfToken,
        activeWorkspaceId: primaryMembership.workspaceId,
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      },
    });

    setSessionCookie(res, rawToken);

    return sendSuccess(res, {
      status: "AUTHENTICATED",
      csrfToken,
      user: {
        id: user.id,
        email: user.emailCanonical,
        name: user.name,
      },
      activeWorkspace: {
        workspaceId: primaryMembership.workspace.id,
        type: primaryMembership.workspace.type,
        name: primaryMembership.workspace.name,
        merchantId: primaryMembership.workspace.merchantId,
        role: primaryMembership.role,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/auth/session (Restores CSRF & active workspace on reload)
authRouter.get("/auth/session", requireSession, async (req, res) => {
  const a = req.auth!;
  return sendSuccess(res, {
    status: "AUTHENTICATED",
    csrfToken: a.csrfToken,
    user: {
      id: a.userId,
      email: a.email,
      name: a.name,
    },
    activeWorkspace: {
      workspaceId: a.workspaceId,
      type: a.workspaceType,
      name: a.workspaceName,
      merchantId: a.merchantId,
      role: a.role,
    },
  });
});

// POST /api/v1/auth/mfa/challenges (Create purpose-bound step-up challenge)
authRouter.post("/auth/mfa/challenges", requireSession, async (req, res) => {
  try {
    const { purpose, targetId } = req.body || {};
    const allowedPurposes = [
      "ADMIN_INTERVENTION",
      "ADMIN_APPROVAL",
      "WORKSPACE_SWITCH",
      "MERCHANT_EXECUTION",
    ];
    if (!purpose || !allowedPurposes.includes(purpose)) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid step-up MFA purpose");
    }

    const challenge = await prisma.mfaChallenge.create({
      data: {
        userId: req.auth!.userId,
        purpose,
        targetId: targetId ? String(targetId) : null,
        codeHash: sha256("123456"), // Demo TOTP code: 123456
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return sendSuccess(
      res,
      {
        challengeId: challenge.id,
        purpose: challenge.purpose,
        targetId: challenge.targetId,
        expiresAt: challenge.expiresAt.toISOString(),
      },
      1,
      201
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/auth/mfa/verify (Handles both SESSION_LOGIN and Step-Up challenges)
authRouter.post("/auth/mfa/verify", async (req, res) => {
  try {
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) {
      throw new AppError(422, "VALIDATION_ERROR", "challengeId and code are required");
    }

    const ch = await prisma.mfaChallenge.findUnique({ where: { id: String(challengeId) } });
    if (!ch || ch.usedAt || ch.expiresAt < new Date()) {
      throw new AppError(401, "SESSION_EXPIRED", "MFA challenge is invalid, expired, or already used");
    }

    if (ch.codeHash !== sha256(String(code))) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid verification code");
    }

    if (ch.purpose === "SESSION_LOGIN") {
      await prisma.mfaChallenge.update({
        where: { id: ch.id },
        data: { usedAt: new Date() },
      });

      const user = await prisma.user.findUnique({
        where: { id: ch.userId },
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: { workspace: true },
          },
        },
      });
      if (!user || user.memberships.length === 0) {
        throw new AppError(403, "FORBIDDEN", "User has no active workspace");
      }

      const adminMembership =
        user.memberships.find((m) => m.workspace.type === "ADMIN") || user.memberships[0];
      const rawToken = `vp_sess_${crypto.randomBytes(24).toString("hex")}`;
      const csrfToken = `csrf_${crypto.randomBytes(16).toString("hex")}`;

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256(rawToken),
          csrfToken,
          activeWorkspaceId: adminMembership.workspaceId,
          expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
        },
      });

      setSessionCookie(res, rawToken);

      return sendSuccess(res, {
        status: "AUTHENTICATED",
        purpose: "SESSION_LOGIN",
        csrfToken,
        user: {
          id: user.id,
          email: user.emailCanonical,
          name: user.name,
        },
        activeWorkspace: {
          workspaceId: adminMembership.workspace.id,
          type: adminMembership.workspace.type,
          name: adminMembership.workspace.name,
          merchantId: adminMembership.workspace.merchantId,
          role: adminMembership.role,
        },
      });
    }

    // Step-Up Challenge Verification
    const stepUpId = `stepup_${crypto.randomBytes(8).toString("hex")}`;
    const stepUpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.mfaChallenge.update({
      where: { id: ch.id },
      data: {
        usedAt: new Date(),
        stepUpId,
        expiresAt: stepUpExpiry,
      },
    });

    return sendSuccess(res, {
      status: "STEP_UP_VERIFIED",
      stepUpId,
      purpose: ch.purpose,
      targetId: ch.targetId,
      expiresAt: stepUpExpiry.toISOString(),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/auth/logout
authRouter.post("/auth/logout", requireSession, async (req, res) => {
  try {
    await prisma.session.update({
      where: { id: req.auth!.sessionId },
      data: { revokedAt: new Date() },
    });
    res.clearCookie("__Host-velapal");
    res.clearCookie("velapal_session");
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/me/workspaces
authRouter.get("/me/workspaces", requireSession, async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.auth!.userId, status: "ACTIVE" },
      include: { workspace: true },
    });

    return sendSuccess(res, {
      activeWorkspaceId: req.auth!.workspaceId,
      workspaces: memberships.map((m) => ({
        workspaceId: m.workspace.id,
        type: m.workspace.type,
        name: m.workspace.name,
        merchantId: m.workspace.merchantId,
        role: m.role,
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/session/workspace
authRouter.post("/session/workspace", requireSession, async (req, res) => {
  try {
    const { workspaceId } = req.body || {};
    if (!workspaceId) {
      throw new AppError(422, "VALIDATION_ERROR", "workspaceId is required");
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.auth!.userId,
        workspaceId: String(workspaceId),
        status: "ACTIVE",
      },
      include: { workspace: true },
    });

    if (!membership) {
      throw new AppError(403, "WORKSPACE_MISMATCH", "User does not hold an active grant for the requested workspace");
    }

    const rotatedCsrf = `csrf_${crypto.randomBytes(16).toString("hex")}`;
    await prisma.session.update({
      where: { id: req.auth!.sessionId },
      data: {
        activeWorkspaceId: membership.workspace.id,
        csrfToken: rotatedCsrf,
      },
    });

    return sendSuccess(
      res,
      {
        activeWorkspace: {
          workspaceId: membership.workspace.id,
          type: membership.workspace.type,
          name: membership.workspace.name,
          merchantId: membership.workspace.merchantId,
          role: membership.role,
        },
        csrfToken: rotatedCsrf,
      },
      2
    );
  } catch (err) {
    return sendError(res, err);
  }
});
