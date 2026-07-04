import { authorizationServerMetadata } from "@/lib/ai/mcp/oauth";

export function GET(request: Request): Response {
  return Response.json(authorizationServerMetadata(request));
}
