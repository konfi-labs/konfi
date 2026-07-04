import { protectedResourceMetadata } from "@/lib/ai/mcp/oauth";

export function GET(request: Request): Response {
  return Response.json(protectedResourceMetadata(request));
}
