import crypto from "crypto";

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function canonicalHash(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    canonical[k] = obj[k];
  }
  return `sha256_${sha256(JSON.stringify(canonical))}`;
}

export function signManifestHmac(payload: Record<string, unknown>): string {
  const secret = process.env.MANIFEST_HMAC_SECRET || "velapal-manifest-hmac-secret-v61";
  const sortedKeys = Object.keys(payload).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    canonical[k] = payload[k];
  }
  const digest = crypto.createHmac("sha256", secret).update(JSON.stringify(canonical)).digest("hex");
  return `hmac_sha256_${digest}`;
}

export function minorToDecimal(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export function generateTraceId(prefix = "tr"): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}
