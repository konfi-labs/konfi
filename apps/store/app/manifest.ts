import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { getCachedStorefrontSharing } from "@/lib/storefront-editor/content";
import { getStorefrontManifestIcons } from "@/lib/storefront-editor/metadata-assets";
import { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const runtimeConfig = await getStoreRuntimeConfigForRequest().catch(
    (error) => {
      unstable_rethrow(error);
      console.error(
        "Error resolving store runtime config for manifest:",
        error,
      );
      return null;
    },
  );
  const sharingSettings = runtimeConfig
    ? await getCachedStorefrontSharing(runtimeConfig.channelId).catch(
        (error) => {
          console.error(
            "Error resolving storefront sharing settings for manifest:",
            error,
          );
          return undefined;
        },
      )
    : undefined;

  return {
    name: process.env.LONG_COMPANY_NAME,
    short_name: process.env.SHORT_COMPANY_NAME,
    description: process.env.COMPANY_DESCRIPTION,
    background_color: process.env.COMPANY_MAIN_COLOR,
    display: "standalone",
    theme_color: process.env.COMPANY_MAIN_COLOR,
    orientation: "portrait",
    icons: getStorefrontManifestIcons(sharingSettings),
    start_url: "/",
  };
}
