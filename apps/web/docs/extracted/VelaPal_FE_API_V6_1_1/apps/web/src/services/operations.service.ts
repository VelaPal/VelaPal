import { apiData } from './api-client';
import type { Operation } from './types';
export const operationsService = {
  get: (operationId: string) => apiData<Operation>(`/operations/${encodeURIComponent(operationId)}`),
  /** Reconcile existing operation ID only; never create a new financial intent. */
  reconcile: (operationId: string, key: string) => apiData<Operation>(`/operations/${encodeURIComponent(operationId)}/reconcile`, { method: 'POST', idempotencyKey: key, body: {} }),
};
