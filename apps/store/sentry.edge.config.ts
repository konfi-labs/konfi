// This file configures the initialization of Sentry for edge features (proxy, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_STORE,

  tracesSampler: (samplingContext) => {
    const { name, attributes, inheritOrSampleWith } = samplingContext;

    // Sample all transactions in development
    if (process.env.NODE_ENV === "development") {
      return 1.0;
    }

    // Skip health checks entirely
    if (name.includes("health")) {
      return 0;
    }
    const pathAttr = typeof attributes?.path === "string" ? attributes.path : "";
    if (pathAttr.includes("/health")) {
      return 0;
    }

    // Sample all auth-related transactions
    if (name.includes("auth") || attributes?.flow === "auth") {
      return 1.0;
    }

    // Sample all checkout-related transactions
    if (name.includes("checkout") || attributes?.flow === "checkout") {
      return 1.0;
    }

    // For everything else in production, use 5% sampling
    return inheritOrSampleWith(0.05);
  },

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  enabled: process.env.NODE_ENV === "production",
});
