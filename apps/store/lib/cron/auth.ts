import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
  const expectedBuffer = Buffer.from(expectedHeader);
  const actualBuffer = Buffer.from(authHeader || "");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
