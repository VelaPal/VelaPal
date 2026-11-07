import { apiData, clearCsrfToken, setCsrfToken } from './api-client';
import type { AuthenticatedSession, LoginResponse, MfaChallenge, StepUpVerified, Workspace } from './types';
const isAuthenticated = (r: LoginResponse): r is AuthenticatedSession => r.status === 'AUTHENTICATED';
export const authService = {
  async login(email: string, password: string) {
    const r = await apiData<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
    if (isAuthenticated(r)) setCsrfToken(r.csrfToken);
    return r;
  },
  async restoreSession() {
    const s = await apiData<AuthenticatedSession>('/auth/session');
    setCsrfToken(s.csrfToken);
    return s;
  },
  async logout() {
    try { await apiData<void>('/auth/logout', { method: 'POST' }); }
    finally { clearCsrfToken(); }
  },
  createMfaChallenge(purpose: 'ADMIN_INTERVENTION' | 'ADMIN_APPROVAL' | 'WORKSPACE_SWITCH' | 'MERCHANT_EXECUTION', targetId: string) {
    return apiData<Omit<MfaChallenge, 'status'>>('/auth/mfa/challenges', { method: 'POST', body: { purpose, targetId } });
  },
  async verifyMfa(challengeId: string, code: string) {
    const data = await apiData<AuthenticatedSession | StepUpVerified>('/auth/mfa/verify', { method: 'POST', body: { challengeId, code } });
    if (data.status === 'AUTHENTICATED') setCsrfToken(data.csrfToken);
    return data;
  },
  listWorkspaces() { return apiData<{ items: Workspace[] }>('/me/workspaces'); },
  async switchWorkspace(workspaceId: string, stepUpId: string | null = null) {
    const r = await apiData<{ activeWorkspace: Workspace; csrfToken: string }>('/session/workspace', { method: 'POST', body: { workspaceId, stepUpId } });
    setCsrfToken(r.csrfToken);
    // UI MUST cancel old workspace requests and invalidate all scoped query caches.
    return r;
  },
};
