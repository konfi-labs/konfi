import { retryProductionCooperationCallback } from "@/lib/production-cooperation/service";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusForCode(code: string) {
  switch (code) {
    case "accepted":
    case "declined":
      return 200;
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "replayed":
      return 409;
    default:
      return 503;
  }
}

export async function POST(request: Request): Promise<Response> {
  const payload = (await request.json()) as unknown;
  const requestId = isRecord(payload)
    ? readString(payload.requestId)
    : undefined;

  if (!requestId) {
    return Response.json(
      { code: "tampered", message: "requestId is required." },
      { status: 400 },
    );
  }

  const result = await retryProductionCooperationCallback(requestId);

  return Response.json(result, { status: statusForCode(result.code) });
}
