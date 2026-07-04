// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { shouldDropNoisySentryClientEvent } from "./lib/sentry-client-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  enabled: process.env.NODE_ENV === "production",

  beforeSend(event) {
    // Drop confirmed Firebase/browser-extension noise while keeping first-party
    // application exceptions visible in Sentry.
    return shouldDropNoisySentryClientEvent(event) ? null : event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
