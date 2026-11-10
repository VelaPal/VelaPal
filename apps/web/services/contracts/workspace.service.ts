import { apiData } from "./api-client";

export type WorkspacePreferences = {
  defaultLimitMinor: number;
  remindersEnabled: boolean;
  notificationsReadAt?: string | null;
};
export type WorkspaceNotification = {
  id: string;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  read: boolean;
};
export type WorkspaceProduct = {
  id: string;
  name: string;
  merchantId: string;
  merchantName: string;
  sku: string;
  type: "PHYSICAL" | "DIGITAL" | "SUBSCRIPTION";
  amountMinor: number;
  currency: string;
  variants: { variantId: string; sku: string; label: string; priceMinor: number }[];
  catalogVersion: number;
  status: "PUBLISHED" | "ARCHIVED";
  hasDigitalAsset: boolean;
};
export type LibraryEntry = {
  transactionId: string;
  orderId: string;
  merchantName: string;
  paidAt: string;
  name: string;
  sku: string;
  terms: string;
  amountMinor: number;
  currency: string;
  asset: null | { fileName: string; mime: string; byteCount: number; downloadUrl: string };
};
export type MerchantApplication = {
  id: string;
  name: string;
  website: string;
  category: string;
  country: string;
  status: string;
  reviewNote: string;
  createdAt: string;
};
export type AdminMerchantApplication = MerchantApplication & { userId: string; owner: { id: string; name: string; emailCanonical: string } | null };
export type SellerProfile = {
  displayName: string;
  website: string | null;
  paypalStatus: string;
  paypalSubscriptionEnabled?: boolean;
  paypalMerchantId: string | null;
  paypalCapabilities: unknown;
};
export type SubscriptionRecord = {
  id: string;
  paypalSubscriptionId: string;
  productId: string;
  productName: string;
  amountMinor: number;
  currency: string;
  status: string;
  nextBillingTime: string | null;
  createdAt: string;
};

export const workspaceService = {
  preferences: () => apiData<WorkspacePreferences>("/workspace/preferences"),
  updatePreferences: (body: Partial<Pick<WorkspacePreferences, "defaultLimitMinor" | "remindersEnabled">>) =>
    apiData<WorkspacePreferences>("/workspace/preferences", { method: "PATCH", body }),
  notifications: () => apiData<{ items: WorkspaceNotification[]; remindersEnabled: boolean; readAt: string | null }>("/workspace/notifications"),
  readNotifications: () => apiData<{ readAt: string }>("/workspace/notifications/read-all", { method: "POST", body: {} }),
  library: () => apiData<{ items: LibraryEntry[] }>("/workspace/library"),
  myApplication: () => apiData<{ application: MerchantApplication | null }>("/merchant-applications/mine"),
  submitApplication: (body: Pick<MerchantApplication, "name" | "website" | "category" | "country">) =>
    apiData<{ application: MerchantApplication }>("/merchant-applications", { method: "POST", body }),
  sellerProfile: () => apiData<SellerProfile>("/seller/profile"),
  updateSellerProfile: (body: { displayName: string; website: string | null }) =>
    apiData<SellerProfile>("/seller/profile", { method: "PATCH", body }),
  sellerProducts: () => apiData<{ items: WorkspaceProduct[] }>("/seller/products"),
  createProduct: (body: { name: string; sku: string; type: WorkspaceProduct["type"]; amountMinor: number; variants: { variantId: string; sku: string; label: string; priceMinor: number }[] }) =>
    apiData<{ product: WorkspaceProduct }>("/seller/products", { method: "POST", body }),
  updateProduct: (id: string, body: Partial<Pick<WorkspaceProduct, "name" | "sku" | "amountMinor" | "status">>) =>
    apiData<{ product: WorkspaceProduct }>(`/seller/products/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  startDigitalUpload: (id: string, body: { fileName: string; mime: string; byteCount: number }) =>
    apiData<{ uploadUrl: string; objectKey: string; fileName: string; mime: string; byteCount: number; method: "PUT"; headers: Record<string, string> }>(`/seller/products/${encodeURIComponent(id)}/digital-upload`, { method: "POST", body }),
  confirmDigitalUpload: (id: string, body: { objectKey: string; fileName: string; mime: string; byteCount: number }) =>
    apiData<{ uploaded: boolean; fileName: string; byteCount: number }>(`/seller/products/${encodeURIComponent(id)}/digital-upload/confirm`, { method: "POST", body }),
  subscriptions: () => apiData<{ items: SubscriptionRecord[]; providerConfigured: boolean }>("/subscriptions"),
  subscribe: (productId: string) => apiData<{ paypalSubscriptionId: string; status: string; approveUrl: string }>("/subscriptions", { method: "POST", body: { productId }, idempotencyKey: crypto.randomUUID() }),
  cancelSubscription: (id: string, reason: string) => apiData<{ status: string; providerStatusPending?: boolean }>(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason }, idempotencyKey: crypto.randomUUID() }),
  subscriptionTransactions: (id: string) => apiData<{ items: { id: string; status: string; time: string; amount: { currency_code: string; value: string } }[] }>(`/subscriptions/${encodeURIComponent(id)}/transactions`),
  startPaypalOnboarding: () => apiData<{ status: string; actionUrl?: string; trackingId?: string }>("/seller/paypal/onboarding", { method: "POST", body: {} }),
  confirmPaypalOnboarding: (body: Record<string, string>) => apiData<{ paypalStatus: string; paypalMerchantId: string | null }>("/seller/paypal/confirm", { method: "POST", body }),
  adminApplications: () => apiData<{ items: AdminMerchantApplication[] }>("/admin/merchant-applications"),
  reviewApplication: (id: string, body: { decision: "APPROVED" | "REJECTED"; reason: string; stepUpId: string }) =>
    apiData<{ application: MerchantApplication; workspace: { id: string; name: string; merchantId: string } | null }>(`/admin/merchant-applications/${encodeURIComponent(id)}/review`, { method: "POST", body }),
};
