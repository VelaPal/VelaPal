import "dotenv/config";
import crypto from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { PayPalAdapter } from "../src/integrations/paypal.adapter";

async function main() {
  console.log("Running VelaPal PayPal sandbox capture/refund smoke flow...");

  const paypalBaseUrl = new URL(
    process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com",
  );
  if (!paypalBaseUrl.hostname.endsWith(".sandbox.paypal.com")) {
    throw new Error(
      `Refusing to run capture/refund smoke flow against non-sandbox host: ${paypalBaseUrl.hostname}`,
    );
  }
  if (!PayPalAdapter.isConfigured()) {
    throw new Error(
      "Configure valid PayPal sandbox PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in apps/api/.env; simulation mode is disabled for this flow.",
    );
  }

  const token = await PayPalAdapter.getAccessToken();
  console.log("OAuth2 token acquired:", `${token.slice(0, 12)}...`);

  const order = await PayPalAdapter.createOrder({
    customId: "SMOKE-VP-0421",
    amountMinor: 5900,
    currency: "USD",
    requestId: `smoke-ord-${crypto.randomUUID()}`,
  });
  console.log("Order created:", order.id, "| Status:", order.status);

  const approvalUrl = order.links?.find(
    (link: { rel?: string }) => link.rel === "approve" || link.rel === "payer-action",
  )?.href;
  if (!approvalUrl) {
    throw new Error("PayPal order response did not include an approval URL.");
  }
  console.log("Approve this sandbox order in your browser:");
  console.log(approvalUrl);

  const readline = createInterface({ input, output });
  try {
    await readline.question("After approving the order in PayPal, press Enter to capture it...");
  } finally {
    readline.close();
  }

  const capture = await PayPalAdapter.captureOrder(
    order.id,
    `smoke-cap-${crypto.randomUUID()}`,
  );
  const captures =
    capture.purchase_units?.flatMap(
      (unit: { payments?: { captures?: Array<{ id?: string; status?: string }> } }) =>
        unit.payments?.captures ?? [],
    ) ?? [];
  const captureRecord =
    captures.find((item: { status?: string }) => item.status === "COMPLETED") ?? captures[0];

  console.log("Capture result:", JSON.stringify(capture, null, 2));
  console.log("Capture ID:", captureRecord?.id ?? "not returned");
  console.log("Capture status:", captureRecord?.status ?? "not returned");

  if (!captureRecord?.id || captureRecord.status !== "COMPLETED") {
    throw new Error("PayPal did not return a completed capture; refusing to issue a refund.");
  }

  const refund = await PayPalAdapter.refundCapture({
    captureId: captureRecord.id,
    amountMinor: 5900,
    currency: "USD",
    note: "VelaPal PayPal sandbox smoke refund",
    requestId: `smoke-refund-${crypto.randomUUID()}`,
  });
  console.log("Refund result:", JSON.stringify(refund, null, 2));
  console.log("Refund ID:", refund.id ?? "not returned");
  console.log("Refund status:", refund.status ?? "not returned");
}

main().catch((err) => {
  console.error("PayPal sandbox smoke flow failed:", err);
  process.exit(1);
});
