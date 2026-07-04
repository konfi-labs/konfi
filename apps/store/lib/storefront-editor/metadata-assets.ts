import type { StorefrontSharingSettings } from "@konfi/types";
import type { Metadata, MetadataRoute } from "next";

export const fallbackStorefrontAssets = {
  appleIcon: "/assets/apple-icon.png",
  favicon: "/assets/favicon.ico",
  icon16: "/assets/icon1.png",
  icon32: "/assets/icon2.png",
  icon192: "/assets/icon3.png",
  icon512: "/assets/icon4.png",
  openGraphImage: "/assets/bg.jpg",
} as const;

function hasMetadataImages(images: unknown): boolean {
  return Array.isArray(images) ? images.length > 0 : Boolean(images);
}

function getMetadataOpenGraphImages(metadata: Metadata): unknown {
  return typeof metadata.openGraph === "object" && metadata.openGraph
    ? metadata.openGraph.images
    : undefined;
}

function getMetadataTwitterImages(metadata: Metadata): unknown {
  return typeof metadata.twitter === "object" && metadata.twitter
    ? metadata.twitter.images
    : undefined;
}

export function getStorefrontFaviconUrl(
  sharing?: StorefrontSharingSettings,
): string {
  return sharing?.faviconUrl ?? fallbackStorefrontAssets.favicon;
}

export function getStorefrontOpenGraphImageUrl(
  sharing?: StorefrontSharingSettings,
  metadata?: Metadata,
): string | undefined {
  if (
    metadata &&
    (hasMetadataImages(getMetadataOpenGraphImages(metadata)) ||
      hasMetadataImages(getMetadataTwitterImages(metadata)))
  ) {
    return undefined;
  }

  return (
    sharing?.defaultOpenGraphImageUrl ?? fallbackStorefrontAssets.openGraphImage
  );
}

export function applyStorefrontSharingMetadata(params: {
  metadata: Metadata;
  sharing?: StorefrontSharingSettings;
  withIcons?: boolean;
}): Metadata {
  const { metadata, sharing, withIcons } = params;
  const imageUrl = getStorefrontOpenGraphImageUrl(sharing, metadata);
  const iconUrl = getStorefrontFaviconUrl(sharing);

  return {
    ...metadata,
    ...(withIcons
      ? {
          icons: {
            apple: [{ url: iconUrl }],
            icon: [{ url: iconUrl, sizes: "any" }],
            shortcut: [iconUrl],
          },
        }
      : {}),
    openGraph:
      imageUrl || metadata.openGraph
        ? {
            ...(typeof metadata.openGraph === "object"
              ? metadata.openGraph
              : {}),
            ...(imageUrl
              ? {
                  images: [
                    {
                      height: 630,
                      url: imageUrl,
                      width: 1200,
                    },
                  ],
                }
              : {}),
          }
        : undefined,
    twitter:
      imageUrl || metadata.twitter
        ? {
            ...(typeof metadata.twitter === "object" ? metadata.twitter : {}),
            ...(imageUrl
              ? {
                  card: "summary_large_image",
                  images: [imageUrl],
                }
              : {}),
          }
        : undefined,
  };
}

export function getStorefrontManifestIcons(
  sharing?: StorefrontSharingSettings,
): MetadataRoute.Manifest["icons"] {
  if (sharing?.faviconUrl) {
    return [
      {
        src: sharing.faviconUrl,
        sizes: "any",
      },
    ];
  }

  return [
    {
      src: fallbackStorefrontAssets.favicon,
      sizes: "any",
      type: "image/icon-x",
    },
    {
      src: fallbackStorefrontAssets.icon16,
      sizes: "16x16",
      type: "image/png",
    },
    {
      src: fallbackStorefrontAssets.icon32,
      sizes: "32x32",
      type: "image/png",
    },
    {
      src: fallbackStorefrontAssets.icon192,
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: fallbackStorefrontAssets.icon512,
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: fallbackStorefrontAssets.appleIcon,
      sizes: "180x180",
      type: "image/png",
    },
  ];
}
