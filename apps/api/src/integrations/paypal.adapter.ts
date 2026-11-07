import { minorToDecimal } from "../utils/crypto";

const BASE_URL = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";

let tokenCache: { token: string; expiresAt: number } | null = null;

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
    };
    return tokenCache.token;
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
    if (!this.isConfigured()) return true;
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
