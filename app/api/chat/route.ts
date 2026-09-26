import { requireUser } from "@/lib/auth";
import { runAgent, type ChatMessage } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.filter((m:any) => ["user","assistant"].includes(m.role) && typeof m.content === "string") as ChatMessage[] : [];
    if (!messages.length) return Response.json({error:"No chat messages supplied"},{status:400});
    const result = await runAgent(user.id, messages, body.aiConfig || undefined);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return Response.json({error:message},{status:message === "UNAUTHORIZED" ? 401 : 500});
  }
}
