import { coldharbor } from "@coldharbor/core/server";

export const dynamic = "force-dynamic";

/** Re-runs a tool with the same arguments (used by "refresh" on a tile). */
export async function POST(req: Request) {
  const { toolId, args } = await req.json();
  try {
    return Response.json({ frames: await coldharbor().hub.call(toolId, args ?? {}) });
  } catch (err) {
    return Response.json({ error: (err as Error)?.message ?? String(err) }, { status: 502 });
  }
}
