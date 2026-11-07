import { Readable } from "node:stream";
import { createMockHandler } from "./server.mjs";

type MockHandler = ReturnType<typeof createMockHandler>;
const runtime = globalThis as typeof globalThis & {
  __velapalEmbeddedMock?: MockHandler;
};
async function* bodyChunks(request: Request) {
  if (!request.body) return;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield Buffer.from(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/** Adapt the existing Node handler in memory: no second server, port or proxy. */
export async function handleEmbeddedMock(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (process.env.NEXT_PUBLIC_API_MODE === "api")
    return Response.json(
      {
        error: {
          code: "MOCK_DISABLED",
          message: "Embedded mock API is disabled in API mode.",
          fieldErrors: {},
          traceId: "embedded-disabled",
          retryable: false,
        },
      },
      { status: 503 },
    );
  const headers = Object.fromEntries(request.headers.entries());
  // Next forwards the original Host; upload intents therefore stay on this origin.
  headers.host = url.host;
  const incoming = Object.assign(Readable.from(bodyChunks(request)), {
    url: url.pathname + url.search,
    method: request.method,
    headers,
  });
  const handler = (runtime.__velapalEmbeddedMock ??= createMockHandler());
  return new Promise<Response>((resolve, reject) => {
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    let status = 200;
    const putHeader = (name: string, value: string | string[] | number) => {
      responseHeaders.delete(name);
      for (const v of Array.isArray(value) ? value : [value])
        responseHeaders.append(name, String(v));
    };
    const outgoing = {
      setHeader: putHeader,
      writeHead(
        code: number,
        values: Record<string, string | string[] | number> = {},
      ) {
        status = code;
        for (const [name, value] of Object.entries(values))
          putHeader(name, value);
        return outgoing;
      },
      end(payload?: string | Uint8Array) {
        try {
          resolve(
            new Response(
              status === 204 || status === 304
                ? null
                : (payload as BodyInit | undefined),
              { status, headers: responseHeaders },
            ),
          );
        } catch (error) {
          reject(error);
        }
      },
    };
    Promise.resolve(handler(incoming, outgoing)).catch(reject);
  });
}
