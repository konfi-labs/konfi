import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { MetadataRoute } from "next";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig || runtimeConfig.maintenance.enabled) {
    return {
      rules: {
        userAgent: "*",
        disallow: ["/"],
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/og/*"],
    },
    sitemap: `${runtimeConfig.storeBaseUrl}/sitemap.xml`,
  };
}
