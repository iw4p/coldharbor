import { coldharbor, type AskInput, type EngineEvent } from "@coldharbor/core/server";
import { specs } from "@/widgets/specs.ts";

export const dynamic = "force-dynamic";

/** Streams engine events as NDJSON, one JSON object per line, so the UI can animate each step. */
export async function POST(req: Request) {
  const input = (await req.json()) as AskInput;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: EngineEvent) => ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const e of coldharbor().ask(input, specs)) send(e);
      } catch (err) {
        send({ type: "error", message: (err as Error)?.message ?? String(err) });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
