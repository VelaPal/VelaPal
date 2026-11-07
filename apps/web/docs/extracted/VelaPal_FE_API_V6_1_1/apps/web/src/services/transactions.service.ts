import { apiData } from './api-client';
import type { Items, Transaction, TransactionDetail } from './types';
export const transactionsService = {
  list: () => apiData<Items<Transaction>>('/transactions'),
  get: (id: string) => apiData<TransactionDetail>(`/transactions/${encodeURIComponent(id)}`),
  catalog: () => apiData<{ items: unknown[] }>('/catalog'),
  quote: (request: { productId: string; variantId: string; quantity: number; spendingLimitMinor: number }) => apiData<{ quoteId: string; amountMinor: number; currency: 'USD'; quoteVersion: number; expiresAt: string; ruleResult: string }>('/quotes', { method: 'POST', body: request }),
  createCheckoutOrder: (request: unknown, key: string) => apiData<unknown>('/checkout/orders', { method: 'POST', body: request, idempotencyKey: key }),
  captureCheckoutOrder: (orderId: string, key: string) => apiData<unknown>(`/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: {}, idempotencyKey: key }),
};
