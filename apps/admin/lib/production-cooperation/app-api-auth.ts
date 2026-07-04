import "server-only";

import { timingSafeEqual } from "node:crypto";
import { ProductionCooperationError } from "./types";

const bearerPrefix = "Bearer ";

function getConfiguredSecret(): string {
  const secret =
    // oxlint-disable-next-line turbo/no-undeclared-env-vars -- direct Cloud-to-admin cooperation API secret is provided by deployment configuration.
    process.env.PRODUCTION_COOPERATION_APP_API_SECRET?.trim();

  if (!secret) {
    throw new ProductionCooperationError(
      "unavailable",
      "Production cooperation app API secret is not configured.",
      503,
    );
  }

  return secret;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeProductionCooperationAppApiRequest(
  request: Request,
): void {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length).trim()
    : "";

  if (!token || !constantTimeEquals(token, getConfiguredSecret())) {
    throw new ProductionCooperationError(
      "unauthorized",
      "Production cooperation app API request is unauthorized.",
      401,
    );
  }
}
