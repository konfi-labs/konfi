import "server-only";

import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
export let analyticsDataClient: BetaAnalyticsDataClient | undefined;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const credential = JSON.parse(
      Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        "base64",
      ).toString(),
    );

    analyticsDataClient = new BetaAnalyticsDataClient({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      credentials: {
        client_email: credential.client_email,
        private_key: credential.private_key,
      },
    });
  } catch (error) {
    console.error("Failed to initialize Google Analytics client:", error);
  }
}
