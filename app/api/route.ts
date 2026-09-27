import { z } from "zod";
import { Intent } from "@/core/canvas.ts";
import { canvas, catalog, handle } from "@/core/server.ts";
import { specs } from "@/widgets/specs.ts";

export const dynamic = "force-dynamic";

/**
 * Only this machine. Other sites can't post JSON here without a CORS preflight, which this route never answers,
 * and a page that rebinds its own domain to 127.0.0.1 still sends its own name as the host.
 */
const local = (req: Request) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.get("host") ?? "");
const denied = () => new Response("Only requests from this machine", { status: 403 });

/** The canvas, or with ?catalog everything connected: MCP servers and their tools, widgets, System One and the LLM. */
export async function GET(req: Request) {
  if (!local(req)) return denied();
  return Response.json(new URL(req.url).searchParams.has("catalog") ? await catalog(specs) : canvas());
}

/** An intent in; the edits it makes stream out as NDJSON, one per line, so the UI can animate each step. */
export async function POST(req: Request) {
  if (!local(req) || !req.headers.get("content-type")?.startsWith("application/json")) return denied();
  const intent = Intent.safeParse(await req.json().catch(() => null));
  if (!intent.success) return new Response(z.prettifyError(intent.error), { status: 400 });
  const enc = new TextEncoder();
  let open = true;
  // The run finishes (and the canvas is saved) even if the browser goes away halfway.
  const body = new ReadableStream({
    async start(ctrl) {
      for await (const e of handle(intent.data, specs)) if (open) ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      if (open) ctrl.close();
    },
    cancel() {
      open = false;
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
