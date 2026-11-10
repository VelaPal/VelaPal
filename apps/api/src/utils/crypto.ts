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

type ManifestSource = {
  id: string;
  sourceVersion: number;
  audience: string;
  ownerParty: string;
  mime: string;
  sha256: string | null;
  locator: string;
  scanState: string;
};

export function sourceManifestDigest(
  caseId: string,
  caseVersion: number,
  accessRevision: number,
  sources: ManifestSource[],
): string {
  const sharedSources = sources
    .filter(
      (source) =>
        source.scanState === "CLEAN" &&
        ["CASE_SHARED", "PROVIDER_SHARED"].includes(source.audience),
    )
    .map((source) => ({
      sourceId: source.id,
      sourceVersion: source.sourceVersion,
      audience: source.audience,
      ownerParty: source.ownerParty,
      mime: source.mime,
      sha256: source.sha256,
      locator: source.locator,
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  return canonicalHash({
    manifestVersion: 1,
    caseId,
    caseVersion,
    accessRevision,
    sources: sharedSources,
  });
}

export function mediationConsentParamsHash(input: {
  caseId: string;
  caseVersion: number;
  accessRevision: number;
  sourceDigest: string;
  assessmentRunId: string;
}): string {
  return canonicalHash({
    bindingVersion: 1,
    intent: "CONTINUE_MEDIATION",
    ...input,
  });
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
