import { describe, expect, it } from "vitest";
import { TenantDomainKind, TenantDomainStatus } from "@sblyvwx/cloud-contracts";

import {
  buildRuntimeAssetUrl,
  getRuntimeStoreDisplayName,
  isActiveStoreTenantDomain,
  normalizeRuntimeBaseUrl,
  normalizeRuntimeHostname,
  readRuntimeString,
  resolveCanonicalStorefrontRedirect,
  resolveStoreRuntimeConfig,
  resolveStaticStoreRuntimeConfig,
} from "./runtime-config";

describe("store runtime config", () => {
  it("resolves dedicated deployments from env values", () => {
    const runtimeConfig = resolveStoreRuntimeConfig({
      env: {
        ADMIN_URL: "admin.example.com/",
        GOOGLE_PLACE_ID: "place-1",
        NEXT_PUBLIC_CDN_URL: "cdn.example.com",
        NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID: "GTM-ABC123",
        NEXT_PUBLIC_INPOST_GEOWIDGET_TOKEN: "inpost-token",
        NEXT_PUBLIC_STORE_CHANNEL_ID: "channel-1",
        STORE_URL: "store.example.com/",
      },
      hostname: "fallback.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        requireTenantId: false,
        tenantId: "default",
      },
    });

    expect(runtimeConfig).toMatchObject({
      adminBaseUrl: "https://admin.example.com",
      cdnUrl: "https://cdn.example.com",
      channelId: "channel-1",
      features: {
        aiImageGeneration: true,
      },
      google: {
        placeId: "place-1",
        reviewsEnabled: true,
        tagManagerEnabled: true,
        tagManagerId: "GTM-ABC123",
      },
      inpost: {
        geowidgetToken: "inpost-token",
      },
      storeBaseUrl: "https://store.example.com",
      tenantContext: {
        deploymentMode: "dedicated",
        tenantId: "default",
      },
      maintenance: {
        enabled: false,
      },
    });
  });

  it("supports dedicated maintenance mode from env", () => {
    expect(
      resolveStoreRuntimeConfig({
        env: {
          NEXT_PUBLIC_STORE_CHANNEL_ID: "channel-1",
          NEXT_PUBLIC_STORE_MAINTENANCE_MODE: "true",
          STORE_URL: "store.example.com/",
        },
        tenantContext: {
          deploymentMode: "dedicated",
          requireTenantId: false,
          tenantId: "default",
        },
      }),
    ).toMatchObject({
      maintenance: {
        enabled: true,
      },
    });
  });

  it("resolves static dedicated deployments without a request hostname", () => {
    expect(
      resolveStaticStoreRuntimeConfig({
        env: {
          NEXT_PUBLIC_STORE_CHANNEL_ID: "channel-1",
          NEXT_PUBLIC_STORE_URL: "store.example.com",
        },
        tenantContext: {
          deploymentMode: "dedicated",
          requireTenantId: false,
        },
      }),
    ).toMatchObject({
      channelId: "channel-1",
      storeBaseUrl: "https://store.example.com",
    });

    expect(
      resolveStaticStoreRuntimeConfig({
        env: {
          NEXT_PUBLIC_STORE_CHANNEL_ID: "channel-1",
        },
        tenantContext: {
          deploymentMode: "dedicated",
          requireTenantId: false,
        },
      }),
    ).toBeNull();
  });

  it("does not statically resolve SaaS deployments", () => {
    expect(
      resolveStaticStoreRuntimeConfig({
        env: {
          NEXT_PUBLIC_STORE_CHANNEL_ID: "shared-channel",
          NEXT_PUBLIC_STORE_URL: "shared.example.com",
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toBeNull();
  });

  it("resolves SaaS deployments from an active storefront domain", () => {
    const runtimeConfig = resolveStoreRuntimeConfig({
      domain: {
        channelId: "channel-2",
        hostname: "tenant.example.com",
        kind: TenantDomainKind.STOREFRONT,
        status: TenantDomainStatus.ACTIVE,
        tenantId: "tenant-1",
      },
      env: {
        GOOGLE_PLACE_ID: "dedicated-place",
        NEXT_PUBLIC_CDN_URL: "shared-cdn.example.com",
        NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID: "GTM-DEDICATED",
      },
      hostname: "tenant.example.com",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
      },
    });

    expect(runtimeConfig).toMatchObject({
      cdnUrl: "https://shared-cdn.example.com",
      channelId: "channel-2",
      features: {
        aiImageGeneration: true,
      },
      google: undefined,
      hostname: "tenant.example.com",
      storeBaseUrl: "https://tenant.example.com",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-1",
      },
      maintenance: {
        enabled: false,
      },
    });
  });

  it("defaults Pro and Enterprise SaaS storefronts to maintenance mode", () => {
    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "pro.example.com",
          kind: TenantDomainKind.STOREFRONT,
          status: TenantDomainStatus.ACTIVE,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "pro.example.com",
        tenant: {
          planId: "pro",
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toMatchObject({
      maintenance: {
        enabled: true,
      },
    });

    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "enterprise.example.com",
          kind: TenantDomainKind.STOREFRONT,
          status: TenantDomainStatus.ACTIVE,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "enterprise.example.com",
        tenant: {
          planId: "enterprise",
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toMatchObject({
      maintenance: {
        enabled: true,
      },
    });
  });

  it("hides SaaS storefront image generation when the plan cannot use it", () => {
    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "free.example.com",
          kind: TenantDomainKind.STOREFRONT,
          status: TenantDomainStatus.ACTIVE,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "free.example.com",
        tenant: {
          planId: "free",
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toMatchObject({
      features: {
        aiImageGeneration: false,
      },
    });

    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "starter.example.com",
          kind: TenantDomainKind.STOREFRONT,
          status: TenantDomainStatus.ACTIVE,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "starter.example.com",
        tenant: {
          moduleFlags: {
            aiImage: false,
          },
          planId: "starter",
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toMatchObject({
      features: {
        aiImageGeneration: false,
      },
    });
  });

  it("lets explicit tenant and domain maintenance settings override plan defaults", () => {
    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "tenant.example.com",
          kind: TenantDomainKind.STOREFRONT,
          maintenance: {
            enabled: false,
            message: "Launch day is coming.",
            title: "Preview only",
          },
          status: TenantDomainStatus.ACTIVE,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "tenant.example.com",
        tenant: {
          planId: "pro",
          storefrontMaintenance: {
            enabled: true,
            title: "Tenant title",
          },
        },
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toMatchObject({
      maintenance: {
        enabled: false,
        message: "Launch day is coming.",
        title: "Preview only",
      },
    });
  });

  it("fails closed for inactive or incomplete SaaS domains", () => {
    expect(
      resolveStoreRuntimeConfig({
        domain: {
          channelId: "channel-2",
          hostname: "tenant.example.com",
          kind: TenantDomainKind.STOREFRONT,
          status: TenantDomainStatus.DISABLED,
          tenantId: "tenant-1",
        },
        env: {},
        hostname: "tenant.example.com",
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toBeNull();

    expect(
      resolveStoreRuntimeConfig({
        env: {},
        hostname: "unknown.example.com",
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
        },
      }),
    ).toBeNull();
  });

  it("normalizes hostnames and base URLs", () => {
    expect(
      normalizeRuntimeHostname("HTTPS://Tenant.Example.com:443/path"),
    ).toBe("tenant.example.com");
    expect(normalizeRuntimeHostname("tenant.example.com, proxy.local")).toBe(
      "tenant.example.com",
    );
    expect(normalizeRuntimeBaseUrl("store.example.com/path/")).toBe(
      "https://store.example.com",
    );
    expect(normalizeRuntimeBaseUrl("https://store.example.com/path/")).toBe(
      "https://store.example.com",
    );
    expect(normalizeRuntimeBaseUrl("acme.store.localhost:3000/pl")).toBe(
      "http://acme.store.localhost:3000",
    );
    expect(normalizeRuntimeBaseUrl("acme.store.lvh.me:3000/pl")).toBe(
      "http://acme.store.lvh.me:3000",
    );
  });

  it("keeps local SaaS storefront URLs on the store dev server origin", () => {
    const runtimeConfig = resolveStoreRuntimeConfig({
      domain: {
        channelId: "channel-2",
        hostname: "acme.store.localhost",
        kind: TenantDomainKind.STOREFRONT,
        status: TenantDomainStatus.ACTIVE,
        tenantId: "tenant-1",
      },
      env: {},
      hostname: "acme.store.localhost:3000",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
      },
    });

    expect(runtimeConfig).toMatchObject({
      storeBaseUrl: "http://acme.store.localhost:3000",
    });
  });

  it("builds canonical SaaS storefront redirects to custom domain store URLs", () => {
    const runtimeConfig = resolveStoreRuntimeConfig({
      domain: {
        channelId: "channel-2",
        hostname: "tenant.store.getkonfi.com",
        kind: TenantDomainKind.STOREFRONT,
        status: TenantDomainStatus.ACTIVE,
        storeUrl: "https://drukdo.pl",
        tenantId: "tenant-1",
      },
      env: {},
      hostname: "tenant.store.getkonfi.com",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
      },
    });

    expect(runtimeConfig).not.toBeNull();
    if (!runtimeConfig) {
      throw new Error("Expected runtime config.");
    }

    expect(
      resolveCanonicalStorefrontRedirect({
        requestTarget: "/pl/products?sort=popular",
        runtimeConfig,
      }),
    ).toBe("https://drukdo.pl/pl/products?sort=popular");
  });

  it("does not redirect when the SaaS storefront request is already canonical", () => {
    const runtimeConfig = resolveStoreRuntimeConfig({
      domain: {
        channelId: "channel-2",
        hostname: "drukdo.pl",
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        tenantId: "tenant-1",
      },
      env: {},
      hostname: "drukdo.pl",
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
      },
    });

    expect(runtimeConfig).not.toBeNull();
    if (!runtimeConfig) {
      throw new Error("Expected runtime config.");
    }

    expect(
      resolveCanonicalStorefrontRedirect({
        requestTarget: "/pl/products?sort=popular",
        runtimeConfig,
      }),
    ).toBeUndefined();
  });

  it("identifies active storefront-compatible domains", () => {
    expect(
      isActiveStoreTenantDomain({
        channelId: "channel-1",
        hostname: "tenant.example.com",
        kind: TenantDomainKind.CUSTOM,
        status: TenantDomainStatus.ACTIVE,
        tenantId: "tenant-1",
      }),
    ).toBe(true);
    expect(
      isActiveStoreTenantDomain({
        channelId: "channel-1",
        hostname: "admin.example.com",
        kind: TenantDomainKind.ADMIN,
        status: TenantDomainStatus.ACTIVE,
        tenantId: "tenant-1",
      }),
    ).toBe(false);
  });

  it("reads runtime records and builds CDN asset URLs", () => {
    expect(
      readRuntimeString(
        {
          email: "  contact@example.com  ",
        },
        "mail",
        "email",
      ),
    ).toBe("contact@example.com");
    expect(
      buildRuntimeAssetUrl(
        "https://cdn.example.com/",
        "/channels/channel-1/product.png",
      ),
    ).toBe("https://cdn.example.com/channels/channel-1/product.png");
    expect(
      buildRuntimeAssetUrl(
        "https://cdn.example.com",
        "https://assets.example.com/product.png",
      ),
    ).toBe("https://assets.example.com/product.png");
  });

  it("resolves tenant storefront display names without local logo defaults", () => {
    expect(
      getRuntimeStoreDisplayName({
        branding: { displayName: "  Tenant Brand  " },
        hostname: "fallback.example.com",
        metadata: { title: "Metadata Title" },
        storeBaseUrl: "https://store.example.com",
      }),
    ).toBe("Tenant Brand");

    expect(
      getRuntimeStoreDisplayName({
        hostname: undefined,
        metadata: { title: "Metadata Title" },
        storeBaseUrl: "https://store.example.com",
      }),
    ).toBe("Metadata Title");

    expect(
      getRuntimeStoreDisplayName({
        hostname: undefined,
        metadata: undefined,
        storeBaseUrl: "https://tenant.example.com",
      }),
    ).toBe("tenant.example.com");

    expect(
      getRuntimeStoreDisplayName(
        {
          hostname: undefined,
          metadata: undefined,
          storeBaseUrl: "https://store.example.com",
        },
        "Dedicated Store",
      ),
    ).toBe("Dedicated Store");
  });
});
