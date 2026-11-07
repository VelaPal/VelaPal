import "dotenv/config";
import crypto from "crypto";
import { PayPalAdapter } from "../src/integrations/paypal.adapter";

async function main() {
  console.log("Running VelaPal V6.1 PayPal Sandbox Capability Spike (Task B03)...");
  if (!PayPalAdapter.isConfigured()) {
    console.log("⚠️ PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not configured in .env; running in adapter simulation mode.");
  } else {
    const token = await PayPalAdapter.getAccessToken();
    console.log("✅ OAuth2 Token acquired:", token.slice(0, 12) + "...");
  }

  const order = await PayPalAdapter.createOrder({
    customId: "SMOKE-VP-0421",
    amountMinor: 5900,
    currency: "USD",
    requestId: `smoke-ord-${crypto.randomUUID()}`,
  });
  console.log("✅ Order created:", order.id, "| Status:", order.status);
}

main().catch((err) => {
  console.error("❌ Smoke test error:", err);
  process.exit(1);
});
