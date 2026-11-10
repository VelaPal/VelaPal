import { minorToDecimal } from "../utils/crypto";

const BASE_URL = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";

let tokenCache: { token: string; expiresAt: number; scopes: string[] } | null = null;

export const PayPalAdapter = {
  isConfigured(): boolean {
    return Boolean(CLIENT_ID && CLIENT_SECRET && !CLIENT_ID.startsWith("YOUR_"));
  },

  async getAccessToken(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.expiresAt - 30000) {
      return tokenCache.token;
    }
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`PayPal token error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scopes: typeof data.scope === "string" ? data.scope.split(/\s+/) : [],
    };
    return tokenCache.token;
  },

  async hasSubscriptionsAccess() {
    if (!this.isConfigured()) return false;
    await this.getAccessToken();
    return Boolean(tokenCache?.scopes.some((scope) => scope.includes("/services/subscriptions")));
  },

  async subscriptionsRequest(path: string, init: RequestInit = {}) {
    if (!this.isConfigured()) throw new Error("PayPal API credentials are not configured");
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers && "PayPal-Auth-Assertion" in (init.headers as Record<string, string>) && process.env.PAYPAL_PARTNER_ATTRIBUTION_ID ? { "PayPal-Partner-Attribution-Id": process.env.PAYPAL_PARTNER_ATTRIBUTION_ID } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PayPal ${path} failed (${res.status}): ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  async partnerRequest(path: string, init: RequestInit = {}) {
    if (!this.isConfigured() || !process.env.PAYPAL_PARTNER_ATTRIBUTION_ID) {
      throw new Error("PayPal partner credentials and attribution ID are required for seller authorization");
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Partner-Attribution-Id": process.env.PAYPAL_PARTNER_ATTRIBUTION_ID,
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PayPal partner API ${path} failed (${res.status}): ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  authAssertion(payerId: string) {
    const clientId = process.env.PAYPAL_CLIENT_ID || "";
    const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${enc({ alg: "none" })}.${enc({ iss: clientId, payer_id: payerId })}.`;
  },

  async createSellerReferral(input: { trackingId: string; returnUrl: string; name: string; email: string }) {
    return this.partnerRequest("/v2/customer/partner-referrals", {
      method: "POST",
      headers: { "PayPal-Auth-Assertion": this.authAssertion(process.env.PAYPAL_PARTNER_MERCHANT_ID || "") },
      body: JSON.stringify({
        tracking_id: input.trackingId,
        email: input.email,
        preferred_language_code: "en-US",
        partner_config_override: { return_url: input.returnUrl, return_url_description: "Return to VelaPal after PayPal account authorization" },
        operations: [{
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: { features: ["PAYMENT", "REFUND", "BILLING_AGREEMENT"] },
            },
          },
        }],
        products: ["PPCP"],
        legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      }),
    });
  },

  async getSellerIntegration(sellerMerchantId: string) {
    const partnerMerchantId = process.env.PAYPAL_PARTNER_MERCHANT_ID;
    if (!partnerMerchantId) throw new Error("PAYPAL_PARTNER_MERCHANT_ID is not configured");
    return this.partnerRequest(`/v1/customer/partners/${encodeURIComponent(partnerMerchantId)}/merchant-integrations/${encodeURIComponent(sellerMerchantId)}`, {
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId) },
    });
  },

  async createSubscriptionProduct(name: string, description: string, sellerMerchantId: string, requestId: string) {
    return this.subscriptionsRequest("/v1/catalogs/products", {
      method: "POST",
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId), "PayPal-Request-Id": requestId },
      body: JSON.stringify({ name, description, type: "SERVICE", category: "SOFTWARE" }),
    });
  },

  async createMonthlyPlan(input: { productId: string; name: string; amountMinor: number; currency: string; sellerMerchantId: string; requestId: string }) {
    const plan = await this.subscriptionsRequest("/v1/billing/plans", {
      method: "POST",
      headers: { "PayPal-Auth-Assertion": this.authAssertion(input.sellerMerchantId), "PayPal-Request-Id": input.requestId },
      body: JSON.stringify({
        product_id: input.productId,
        name: input.name.slice(0, 127),
        description: `Recurring plan for ${input.name}`.slice(0, 127),
        billing_cycles: [{
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: (input.amountMinor / 100).toFixed(2), currency_code: input.currency } },
        }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
      }),
    });
    await this.subscriptionsRequest(`/v1/billing/plans/${encodeURIComponent(plan.id)}/activate`, { method: "POST", headers: { "PayPal-Auth-Assertion": this.authAssertion(input.sellerMerchantId) }, body: "{}" });
    return plan;
  },

  async createSubscription(planId: string, returnUrl: string, cancelUrl: string, sellerMerchantId: string, requestId: string) {
    return this.subscriptionsRequest("/v1/billing/subscriptions", {
      method: "POST",
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId), "PayPal-Request-Id": requestId },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          brand_name: "VelaPal",
          user_action: "SUBSCRIBE_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });
  },

  async getSubscription(id: string, sellerMerchantId: string) {
    return this.subscriptionsRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}?fields=last_failed_payment`, {
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId) },
    });
  },

  async getSubscriptionTransactions(id: string, sellerMerchantId: string, startTime: string, endTime: string) {
    const query = new URLSearchParams({ start_time: startTime, end_time: endTime, page_size: "100", move_to: "next" });
    return this.subscriptionsRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?${query}`, {
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId) },
    });
  },

  async cancelSubscription(id: string, reason: string, sellerMerchantId: string, requestId: string) {
    return this.subscriptionsRequest(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { "PayPal-Auth-Assertion": this.authAssertion(sellerMerchantId), "PayPal-Request-Id": requestId },
      body: JSON.stringify({ reason: reason.slice(0, 128) }),
    });
  },

  async createOrder(params: { customId: string; amountMinor: number; currency: string; requestId: string }) {
    if (!this.isConfigured()) {
      const mockId = `5O190127TN${Date.now().toString().slice(-7)}`;
      return {
        id: mockId,
        status: "CREATED",
        links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${mockId}` }],
      };
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": params.requestId,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: params.customId,
            custom_id: params.customId,
            amount: {
              currency_code: params.currency,
              value: minorToDecimal(params.amountMinor),
            },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`PayPal createOrder failed: ${res.status}`);
    return res.json();
  },

  async captureOrder(paypalOrderId: string, requestId: string) {
    if (!this.isConfigured()) {
      return {
        id: paypalOrderId,
        status: "COMPLETED",
        purchase_units: [
          {
            payments: {
              captures: [{ id: `2GG903537H${Date.now().toString().slice(-7)}`, status: "COMPLETED" }],
            },
          },
        ],
      };
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
      },
    });
    if (!res.ok) throw new Error(`PayPal captureOrder failed: ${res.status}`);
    return res.json();
  },

  async refundCapture(params: {
    captureId: string;
    amountMinor: number;
    currency: string;
    note: string;
    requestId: string;
  }) {
    if (!this.isConfigured()) {
      return {
        id: `9JU7654321${Date.now().toString().slice(-7)}`,
        status: "COMPLETED",
      };
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/payments/captures/${params.captureId}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": params.requestId,
      },
      body: JSON.stringify({
        amount: {
          currency_code: params.currency,
          value: minorToDecimal(params.amountMinor),
        },
        note_to_payer: params.note.slice(0, 255),
      }),
    });
    if (!res.ok) throw new Error(`PayPal refundCapture failed: ${res.status}`);
    return res.json();
  },

  async getRefund(refundId: string) {
    if (!this.isConfigured()) {
      return { id: refundId, status: "COMPLETED" };
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/payments/refunds/${refundId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`PayPal getRefund failed: ${res.status}`);
    return res.json();
  },

  async getCapture(captureId: string) {
    if (!this.isConfigured()) {
      return { id: captureId, status: "COMPLETED" };
    }
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/payments/captures/${captureId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`PayPal getCapture failed: ${res.status}`);
    return res.json();
  },

  async verifyWebhookSignature(headers: Record<string, string | undefined>, rawEvent: any): Promise<boolean> {
    if (!this.isConfigured() || !process.env.PAYPAL_WEBHOOK_ID) return false;
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: rawEvent,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.verification_status === "SUCCESS";
  },
};
