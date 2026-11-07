import { apiData } from "./api-client";
import type {
  Items,
  Transaction,
  TransactionDetail,
  CatalogProduct,
} from "./types";
import {
  transactionDto,
  transactionDetailDto,
  catalogDto,
  quoteDto,
} from "./schemas";
import { z } from "zod";
export const transactionsService = {
  list: async (): Promise<Items<Transaction>> =>
    z
      .object({
        items: z.array(transactionDto),
        nextCursor: z.string().nullable().optional(),
      })
      .parse(await apiData<unknown>("/transactions")),
  get: async (id: string): Promise<TransactionDetail> =>
    transactionDetailDto.parse(
      await apiData<unknown>(`/transactions/${encodeURIComponent(id)}`),
    ),
  catalog: async (): Promise<{ items: CatalogProduct[] }> =>
    catalogDto.parse(await apiData<unknown>("/catalog")),
  quote: async (request: {
    productId: string;
    variantId: string;
    quantity: number;
    spendingLimitMinor: number;
  }) =>
    quoteDto.parse(
      await apiData<unknown>("/quotes", { method: "POST", body: request }),
    ),
  createCheckoutOrder: (request: unknown, key: string) =>
    apiData<unknown>("/checkout/orders", {
      method: "POST",
      body: request,
      idempotencyKey: key,
    }),
  captureCheckoutOrder: (orderId: string, key: string) =>
    apiData<unknown>(
      `/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: {}, idempotencyKey: key },
    ),
};
