/* eslint-disable */
import * as Sentry from "@sentry/nextjs";
import { shouldDropNoisySentryServerRequestError } from "./lib/sentry-server-filters";

export const onRequestError: typeof Sentry.captureRequestError = (
  error,
  request,
  context,
) => {
  if (shouldDropNoisySentryServerRequestError(error, context)) {
    return;
  }

  return Sentry.captureRequestError(error, request, context);
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
