import { apiData, clearCsrfToken, setCsrfToken } from "./api-client";
import type {
  AuthenticatedSession,
  LoginResponse,
  MfaChallenge,
  StepUpVerified,
  Workspace,
} from "./types";
type WorkspacePayload = Omit<Workspace, "id"> & {
  id?: string;
  workspaceId?: string;
};
function normalizeWorkspace(workspace: WorkspacePayload): Workspace {
  const { workspaceId, ...fields } = workspace;
  const id = workspace.id ?? workspaceId;
  if (!id) throw new Error("Workspace response is missing its id.");
  return { ...fields, id };
}
type SessionPayload = Omit<AuthenticatedSession, "activeWorkspace"> & {
  activeWorkspace: WorkspacePayload;
};
function normalizeSession(session: SessionPayload): AuthenticatedSession {
  return {
    ...session,
    activeWorkspace: normalizeWorkspace(session.activeWorkspace),
  };
}
const isAuthenticated = (r: LoginResponse): r is AuthenticatedSession =>
  r.status === "AUTHENTICATED";
export const authService = {
  async login(email: string, password: string) {
    const r = await apiData<
      | LoginResponse
      | (Omit<AuthenticatedSession, "activeWorkspace"> & {
          activeWorkspace: WorkspacePayload;
        })
    >("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    const normalized = r.status === "AUTHENTICATED" ? normalizeSession(r) : r;
    if (isAuthenticated(normalized)) setCsrfToken(normalized.csrfToken);
    return normalized;
  },
  async restoreSession() {
    const s = await apiData<SessionPayload>("/auth/session");
    const normalized = normalizeSession(s);
    setCsrfToken(normalized.csrfToken);
    return normalized;
  },
  async logout() {
    await apiData<void>("/auth/logout", { method: "POST" });
    clearCsrfToken();
  },
  createMfaChallenge(
    purpose:
      | "ADMIN_INTERVENTION"
      | "ADMIN_APPROVAL"
      | "WORKSPACE_SWITCH"
      | "MERCHANT_EXECUTION",
    targetId: string,
  ) {
    return apiData<Omit<MfaChallenge, "status">>("/auth/mfa/challenges", {
      method: "POST",
      body: { purpose, targetId },
    });
  },
  async verifyMfa(challengeId: string, code: string) {
    const data = await apiData<SessionPayload | StepUpVerified>(
      "/auth/mfa/verify",
      { method: "POST", body: { challengeId, code } },
    );
    const normalized =
      data.status === "AUTHENTICATED" ? normalizeSession(data) : data;
    if (normalized.status === "AUTHENTICATED") setCsrfToken(normalized.csrfToken);
    return normalized;
  },
  async listWorkspaces() {
    const response = await apiData<{
      items?: WorkspacePayload[];
      workspaces?: WorkspacePayload[];
    }>("/me/workspaces");
    return {
      items: (response.items ?? response.workspaces ?? []).map(
        normalizeWorkspace,
      ),
    };
  },
  async switchWorkspace(workspaceId: string, stepUpId: string | null = null) {
    const r = await apiData<{
      activeWorkspace: WorkspacePayload;
      csrfToken: string;
    }>(
      "/session/workspace",
      { method: "POST", body: { workspaceId, stepUpId } },
    );
    setCsrfToken(r.csrfToken);
    // UI MUST cancel old workspace requests and invalidate all scoped query caches.
    return { ...r, activeWorkspace: normalizeWorkspace(r.activeWorkspace) };
  },
};
