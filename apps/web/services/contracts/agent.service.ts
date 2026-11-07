import { apiData } from "./api-client";
import type { AgentRun, AiPurpose } from "./types";
export const agentService = {
  start: (
    purpose: Exclude<AiPurpose, "SHARED_ASSESSMENT">,
    caseId: string | null,
    prompt: string,
  ) =>
    apiData<AgentRun>("/agent/runs", {
      method: "POST",
      body: { purpose, caseId, prompt },
    }),
  get: (runId: string) =>
    apiData<AgentRun>(`/agent/runs/${encodeURIComponent(runId)}`),
  // SHARED_ASSESSMENT is triggered through disputesService.assess, NOT POST /agent/runs.
};
