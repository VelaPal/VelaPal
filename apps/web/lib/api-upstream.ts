export function resolveApiUpstream({
  upstream,
  frontendPort = "3000",
}: {
  upstream?: string;
  frontendPort?: string;
}): string | null {
  if (!upstream) return null;
  const configured = upstream.replace(/\/$/, "");
  const target = new URL(configured);
  if (!["http:", "https:"].includes(target.protocol))
    throw new Error("API_UPSTREAM must use http or https.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (local && port === frontendPort)
    throw new Error("API_UPSTREAM cannot point back to the frontend.");
  return configured;
}
