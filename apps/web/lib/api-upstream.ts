/** Mock mode runs inside Next.js; only live API mode needs an external upstream. */
export function resolveApiUpstream({
  mode,
  upstream,
  frontendPort = "3000",
}: {
  mode?: string;
  upstream?: string;
  frontendPort?: string;
}): string | null {
  if (mode !== "api") return null;
  if (!upstream)
    throw new Error(
      "Set API_UPSTREAM to the external backend when API mode is enabled.",
    );
  const configured = upstream.replace(/\/$/, "");
  const target = new URL(configured);
  if (!["http:", "https:"].includes(target.protocol))
    throw new Error("API_UPSTREAM must use http or https.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (local && port === frontendPort)
    throw new Error(
      "API_UPSTREAM cannot point back to the frontend. Use mock mode for the embedded demo API.",
    );
  return configured;
}
