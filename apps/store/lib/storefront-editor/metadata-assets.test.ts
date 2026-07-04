import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import {
  applyStorefrontSharingMetadata,
  fallbackStorefrontAssets,
  getStorefrontManifestIcons,
  getStorefrontOpenGraphImageUrl,
} from "./metadata-assets";

describe("storefront metadata assets", () => {
  it("applies tenant favicon and default social image metadata", () => {
    const metadata = applyStorefrontSharingMetadata({
      metadata: {
        openGraph: {
          title: "Store",
        },
        title: "Store",
        twitter: {
          title: "Store",
        },
      },
      sharing: {
        defaultOpenGraphImageUrl: "/default-share.png",
        faviconUrl: "/favicon.svg",
        id: "sharing",
      },
      withIcons: true,
    });

    expect(metadata.icons).toEqual({
      apple: [{ url: "/favicon.svg" }],
      icon: [{ url: "/favicon.svg", sizes: "any" }],
      shortcut: ["/favicon.svg"],
    });
    expect(metadata.openGraph).toMatchObject({
      images: [{ height: 630, url: "/default-share.png", width: 1200 }],
      title: "Store",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["/default-share.png"],
      title: "Store",
    });
  });

  it("keeps existing metadata images when no tenant sharing image overrides them", () => {
    const metadata: Metadata = {
      openGraph: {
        images: [{ url: "/legacy-share.png" }],
      },
    };

    expect(
      getStorefrontOpenGraphImageUrl(
        {
          defaultOpenGraphImageUrl: "/default-share.png",
          id: "sharing",
        },
        metadata,
      ),
    ).toBeUndefined();
    expect(
      applyStorefrontSharingMetadata({
        metadata,
        sharing: {
          defaultOpenGraphImageUrl: "/default-share.png",
          id: "sharing",
        },
      }).openGraph,
    ).toEqual(metadata.openGraph);
  });

  it("uses static manifest icons until a tenant favicon is set", () => {
    expect(getStorefrontManifestIcons({ id: "sharing" })).toEqual([
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
    ]);
    expect(
      getStorefrontManifestIcons({
        faviconUrl: "https://cdn.example.com/favicon.ico",
        id: "sharing",
      }),
    ).toEqual([
      {
        src: "https://cdn.example.com/favicon.ico",
        sizes: "any",
      },
    ]);
  });
});
