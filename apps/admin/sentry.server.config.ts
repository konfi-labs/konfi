// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,

  tracesSampler: (samplingContext) => {
    const { name, attributes, inheritOrSampleWith } = samplingContext;

    // Sample all transactions in development
    if (process.env.NODE_ENV === "development") {
      return 1.0;
    }

    // Skip health checks and internal metrics entirely
    if (name.includes("health") || name.includes("metrics")) {
      return 0;
    }
    const pathAttr = typeof attributes?.path === "string" ? attributes.path : "";
    if (pathAttr.includes("/health")) {
      return 0;
    }

    // Sample all auth-related transactions (login, logout, token refresh, etc.)
    if (name.includes("auth") || attributes?.flow === "auth") {
      return 1.0;
    }

    // Sample all critical business operations (orders, products, etc.)
    if (name.includes("order") || name.includes("product") || attributes?.flow === "checkout") {
      return 1.0;
    }

    // Sample 20% of API requests
    if (pathAttr.includes("/api/")) {
      return 0.2;
    }

    // For everything else in production, use 5% sampling
    return inheritOrSampleWith(0.05);
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',

  enabled: process.env.NODE_ENV === "production",
});
