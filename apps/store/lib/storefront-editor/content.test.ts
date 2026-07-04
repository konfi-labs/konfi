import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STOREFRONT_HOME_BLOCK_TYPES,
  STOREFRONT_HOME_BLOCK_VARIANTS,
} from "@konfi/types";

import {
  getStorefrontEditorDraftContent,
  listStorefrontEditorRevisions,
  publishStorefrontEditorDraft,
  rollbackStorefrontEditorRevision,
  sanitizeStorefrontHomePage,
  sanitizeStorefrontSharing,
  sanitizeStorefrontTheme,
  saveStorefrontHomePage,
  saveStorefrontHomePageDraft,
  saveStorefrontSharing,
  saveStorefrontSharingDraft,
  saveStorefrontTheme,
  saveStorefrontThemeDraft,
  storefrontHomeCacheTag,
  storefrontSharingCacheTag,
  storefrontThemeCacheTag,
} from "./content";

const mocks = vi.hoisted(() => {
  const docSnapshots = new Map<string, unknown>();
  const collectionDocs: Array<{ data: () => unknown; id: string }> = [];
  const deleteDoc = vi.fn(() => Promise.resolve());
  const set = vi.fn(() => Promise.resolve());
  const revisionSet = vi.fn(() => Promise.resolve());
  const revisionGet = vi.fn(() =>
    Promise.resolve({
      data: () => undefined,
      exists: false,
      id: "revision_1",
    }),
  );
  const doc = vi.fn((path: string) => ({
    get: vi.fn(() => {
      const data = docSnapshots.get(path);

      return Promise.resolve({
        data: () => data,
        exists: data !== undefined,
        id: path.split("/").at(-1) ?? path,
      });
    }),
    delete: deleteDoc,
    set,
  }));
  const revisionDoc = vi.fn((id?: string) => ({
    get: revisionGet,
    id: id ?? "revision_1",
    set: revisionSet,
  }));
  const collectionGet = vi.fn(() =>
    Promise.resolve({
      docs: collectionDocs,
    }),
  );
  const limit = vi.fn(() => ({
    get: collectionGet,
  }));
  const orderBy = vi.fn(() => ({
    limit,
  }));
  const collection = vi.fn(() => ({
    doc: revisionDoc,
    orderBy,
  }));

  return {
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    collection,
    collectionDocs,
    collectionGet,
    deleteDoc,
    doc,
    docSnapshots,
    getAdminDb: vi.fn(() => ({ doc })),
    limit,
    orderBy,
    revalidateTag: vi.fn(),
    revisionDoc,
    revisionGet,
    revisionSet,
    set,
  };
});

vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
  revalidateTag: mocks.revalidateTag,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
  getAppForServer: vi.fn(),
  shouldSkipStaticDataDuringCiBuild: vi.fn(() => false),
  shouldSilentlyFallbackFromOptionalStaticDataError: vi.fn(() => false),
}));

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const collectUndefinedPaths = (value: unknown, path = "data"): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUndefinedPaths(item, `${path}.${index}`),
    );
  }

  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) =>
    item === undefined
      ? [`${path}.${key}`]
      : collectUndefinedPaths(item, `${path}.${key}`),
  );
};

const expectFirestorePayloadHasNoUndefinedValues = (value: unknown) => {
  expect(collectUndefinedPaths(value)).toEqual([]);
};

describe("storefront editor content", () => {
  beforeEach(() => {
    mocks.cacheLife.mockClear();
    mocks.cacheTag.mockClear();
    mocks.collection.mockClear();
    mocks.collectionDocs.length = 0;
    mocks.collectionGet.mockClear();
    mocks.deleteDoc.mockClear();
    mocks.doc.mockClear();
    mocks.docSnapshots.clear();
    mocks.getAdminDb.mockClear();
    mocks.getAdminDb.mockReturnValue({
      collection: mocks.collection,
      doc: mocks.doc,
    });
    mocks.limit.mockClear();
    mocks.orderBy.mockClear();
    mocks.revalidateTag.mockClear();
    mocks.revisionDoc.mockClear();
    mocks.revisionGet.mockClear();
    mocks.revisionSet.mockClear();
    mocks.set.mockClear();
  });

  it("falls back to the default home block order", () => {
    expect(
      sanitizeStorefrontHomePage(undefined).blocks.map((block) => block.type),
    ).toEqual([
      "hero",
      "assistant",
      "trust-grid",
      "campaigns",
      "featured-products",
      "how-it-works",
      "popular-products",
      "testimonials",
      "newsletter",
    ]);
  });

  it("backfills testimonials into legacy default home block order", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          { enabled: true, id: "hero", type: "hero" },
          { enabled: true, id: "assistant", type: "assistant" },
          { enabled: true, id: "trust-grid", type: "trust-grid" },
          { enabled: true, id: "campaigns", type: "campaigns" },
          {
            enabled: true,
            id: "featured-products",
            type: "featured-products",
          },
          { enabled: true, id: "how-it-works", type: "how-it-works" },
          { enabled: true, id: "popular-products", type: "popular-products" },
          { enabled: true, id: "newsletter", type: "newsletter" },
        ],
      }).blocks.map((block) => block.type),
    ).toEqual([
      "hero",
      "assistant",
      "trust-grid",
      "campaigns",
      "featured-products",
      "how-it-works",
      "popular-products",
      "testimonials",
      "newsletter",
    ]);
  });

  it("does not backfill an explicitly removed default testimonials block", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          { enabled: true, id: "hero", type: "hero" },
          { enabled: true, id: "assistant", type: "assistant" },
          { enabled: true, id: "trust-grid", type: "trust-grid" },
          { enabled: true, id: "campaigns", type: "campaigns" },
          {
            enabled: true,
            id: "featured-products",
            type: "featured-products",
          },
          { enabled: true, id: "how-it-works", type: "how-it-works" },
          { enabled: true, id: "popular-products", type: "popular-products" },
          { enabled: true, id: "newsletter", type: "newsletter" },
        ],
        removedDefaultBlockTypes: ["testimonials"],
      }),
    ).toMatchObject({
      blocks: [
        { type: "hero" },
        { type: "assistant" },
        { type: "trust-grid" },
        { type: "campaigns" },
        { type: "featured-products" },
        { type: "how-it-works" },
        { type: "popular-products" },
        { type: "newsletter" },
      ],
      removedDefaultBlockTypes: ["testimonials"],
    });
  });

  it("defines at least three variants for every storefront block type", () => {
    expect(
      STOREFRONT_HOME_BLOCK_TYPES.every((type) => {
        const variants = STOREFRONT_HOME_BLOCK_VARIANTS[type];

        return variants.includes("default") && variants.length >= 3;
      }),
    ).toBe(true);
  });

  it("skips unknown blocks and keeps disabled known blocks", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          { enabled: true, id: "unknown", type: "unknown" },
          {
            enabled: false,
            id: "popular-products",
            title: "Popular",
            translations: {
              en: { title: "Popular" },
              script: { title: "Ignored" },
            },
            type: "popular-products",
          },
        ],
      }),
    ).toMatchObject({
      blocks: [
        {
          enabled: false,
          id: "popular-products",
          title: "Popular",
          translations: {
            en: { title: "Popular" },
          },
          type: "popular-products",
        },
      ],
    });
  });

  it("strips hero content overrides so admin CMS remains the source of truth", () => {
    const homePage = sanitizeStorefrontHomePage({
      blocks: [
        {
          body: "Body",
          ctaHref: "/products",
          ctaLabel: "Shop now",
          enabled: true,
          id: "hero",
          imageUrl: "https://cdn.example.com/hero.webp",
          subtitle: "Subtitle",
          title: "Hero",
          translations: {
            en: { title: "Hero" },
          },
          type: "hero",
          variant: "fullscreen",
        },
      ],
    });
    const [heroBlock] = homePage.blocks;

    expect(heroBlock).toMatchObject({
      enabled: true,
      id: "hero",
      type: "hero",
      variant: "fullscreen",
    });
    expect(heroBlock?.body).toBeUndefined();
    expect(heroBlock?.ctaHref).toBeUndefined();
    expect(heroBlock?.ctaLabel).toBeUndefined();
    expect(heroBlock?.imageUrl).toBeUndefined();
    expect(heroBlock?.subtitle).toBeUndefined();
    expect(heroBlock?.title).toBeUndefined();
    expect(heroBlock?.translations).toBeUndefined();
  });

  it("keeps section copy overrides for storefront-owned built-in blocks", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          {
            body: "Small print",
            ctaLabel: "Join",
            enabled: true,
            id: "newsletter",
            subtitle: "Offers and production updates.",
            title: "Stay in the loop",
            translations: {
              en: {
                body: "Small print",
                ctaLabel: "Join",
                subtitle: "Offers and production updates.",
                title: "Stay in the loop",
              },
              pl: {
                ctaLabel: "Dołącz",
                title: "Bądź na bieżąco",
              },
            },
            type: "newsletter",
          },
        ],
      }),
    ).toMatchObject({
      blocks: [
        {
          body: "Small print",
          ctaLabel: "Join",
          subtitle: "Offers and production updates.",
          title: "Stay in the loop",
          translations: {
            en: {
              body: "Small print",
              ctaLabel: "Join",
              subtitle: "Offers and production updates.",
              title: "Stay in the loop",
            },
            pl: {
              ctaLabel: "Dołącz",
              title: "Bądź na bieżąco",
            },
          },
          type: "newsletter",
        },
      ],
    });
  });

  it("keeps a safe source locale on home pages", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [{ enabled: true, id: "hero", type: "hero" }],
        sourceLocale: "EN",
      }),
    ).toMatchObject({
      sourceLocale: "en",
    });
    expect(
      sanitizeStorefrontHomePage({
        blocks: [{ enabled: true, id: "hero", type: "hero" }],
        sourceLocale: "../script",
      }).sourceLocale,
    ).toBeUndefined();
  });

  it("removes unsafe block URLs before persistence", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          {
            ctaHref: "javascript:alert(1)",
            enabled: true,
            id: "rich-text-cta-1",
            imageUrl: "data:image/svg+xml,<svg></svg>",
            type: "rich-text-cta",
          },
          {
            ctaHref: "/products",
            enabled: true,
            id: "rich-text-cta",
            type: "rich-text-cta",
          },
        ],
      }),
    ).toMatchObject({
      blocks: [
        {
          ctaHref: undefined,
          imageUrl: undefined,
          type: "rich-text-cta",
        },
        {
          ctaHref: "/products",
          type: "rich-text-cta",
        },
      ],
    });
  });

  it("keeps only variants allowed by the selected block type", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          {
            enabled: true,
            id: "hero",
            type: "hero",
            variant: "fullscreen",
          },
          {
            enabled: true,
            id: "trust-grid",
            type: "trust-grid",
            variant: "fullscreen",
          },
          {
            enabled: true,
            id: "newsletter",
            type: "newsletter",
            variant: "minimal",
          },
        ],
      }),
    ).toMatchObject({
      blocks: [
        {
          type: "hero",
          variant: "fullscreen",
        },
        {
          type: "trust-grid",
          variant: undefined,
        },
        {
          type: "newsletter",
          variant: "minimal",
        },
      ],
    });
  });

  it("keeps safe per-block radius overrides", () => {
    expect(
      sanitizeStorefrontHomePage({
        blocks: [
          {
            enabled: true,
            id: "hero",
            radiusOverrides: {
              buttons: "xl",
              cards: "sharp",
              media: "none",
              section: "3xl",
              unknown: "lg",
            },
            type: "hero",
          },
        ],
      }),
    ).toMatchObject({
      blocks: [
        {
          radiusOverrides: {
            buttons: "xl",
            media: "none",
            section: "3xl",
          },
          type: "hero",
        },
      ],
    });
  });

  it("accepts only safe theme values", () => {
    expect(
      sanitizeStorefrontTheme({
        accentColor: "red",
        buttonStyle: "outline",
        logoUrl: "javascript:alert(1)",
        primaryColor: "#112233",
        radius: "3xl",
      }),
    ).toMatchObject({
      accentColor: undefined,
      buttonStyle: "outline",
      logoUrl: undefined,
      primaryColor: "#112233",
      radius: "3xl",
    });
    expect(
      sanitizeStorefrontTheme({
        buttonStyle: "ghost",
      }).buttonStyle,
    ).toBe("solid");
  });

  it("keeps the gradient flag only when explicitly enabled", () => {
    expect(
      sanitizeStorefrontTheme({ gradientEnabled: true }).gradientEnabled,
    ).toBe(true);
    expect(
      sanitizeStorefrontTheme({ gradientEnabled: "yes" }).gradientEnabled,
    ).toBeUndefined();
    expect(sanitizeStorefrontTheme(undefined).gradientEnabled).toBeUndefined();
  });

  it("does not invent a theme radius when one was not saved", () => {
    expect(sanitizeStorefrontTheme(undefined).radius).toBeUndefined();
    expect(
      sanitizeStorefrontTheme({
        radius: "sharp",
      }).radius,
    ).toBeUndefined();
  });

  it("keeps https theme logo URLs", () => {
    expect(
      sanitizeStorefrontTheme({
        logoUrl: "https://cdn.example.com/logo.svg",
      }),
    ).toMatchObject({
      logoUrl: "https://cdn.example.com/logo.svg",
    });
  });

  it("keeps only safe storefront sharing image URLs", () => {
    expect(
      sanitizeStorefrontSharing({
        defaultOpenGraphImageUrl: "https://cdn.example.com/default.png",
        faviconUrl: "data:image/svg+xml,<svg></svg>",
      }),
    ).toMatchObject({
      defaultOpenGraphImageUrl: "https://cdn.example.com/default.png",
      faviconUrl: undefined,
      id: "sharing",
    });
  });

  it("saves sanitized home blocks and revalidates channel tags", async () => {
    const saved = await saveStorefrontHomePage({
      channelId: "channel_1",
      homePage: {
        blocks: [
          {
            ctaHref: "javascript:alert(1)",
            enabled: true,
            id: "rich-text-cta",
            title: "CTA",
            type: "rich-text-cta",
          },
        ],
        id: "home",
      },
      uid: "uid_1",
    });

    expect(saved.blocks[0]).toMatchObject({
      ctaHref: undefined,
      title: "CTA",
      type: "rich-text-cta",
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/home",
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({
            title: "CTA",
            type: "rich-text-cta",
          }),
        ]),
        updatedByUid: "uid_1",
      }),
      { merge: true },
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      storefrontHomeCacheTag,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontHomeCacheTag}-channel_1`,
      "max",
    );
  });

  it("omits undefined optional block fields from Firestore home writes", async () => {
    await saveStorefrontHomePageDraft({
      channelId: "channel_1",
      homePage: {
        blocks: [
          {
            enabled: true,
            id: "hero",
            type: "hero",
          },
        ],
        id: "home",
      },
      uid: "uid_1",
    });

    const payload = mocks.set.mock.calls.at(-1)?.[0] as
      | { blocks?: Array<Record<string, unknown>> }
      | undefined;
    const [block] = payload?.blocks ?? [];

    expectFirestorePayloadHasNoUndefinedValues(payload);
    expect(block).toMatchObject({
      enabled: true,
      id: "hero",
      type: "hero",
    });
    expect(block).not.toHaveProperty("radiusOverrides");
    expect(block).not.toHaveProperty("variant");
  });

  it("saves sanitized draft content without revalidating live storefront tags", async () => {
    const homePage = await saveStorefrontHomePageDraft({
      channelId: "channel_1",
      homePage: {
        blocks: [
          {
            ctaHref: "javascript:alert(1)",
            enabled: true,
            id: "rich-text-cta",
            title: "Draft CTA",
            type: "rich-text-cta",
          },
        ],
        id: "home",
      },
      uid: "uid_1",
    });
    const theme = await saveStorefrontThemeDraft({
      channelId: "channel_1",
      theme: {
        id: "theme",
        primaryColor: "#112233",
      },
      uid: "uid_1",
    });
    const sharing = await saveStorefrontSharingDraft({
      channelId: "channel_1",
      sharing: {
        defaultOpenGraphImageUrl: "/draft-share.png",
        faviconUrl: "javascript:alert(1)",
        id: "sharing",
      },
      uid: "uid_1",
    });

    expect(homePage.blocks[0]).toMatchObject({
      ctaHref: undefined,
      title: "Draft CTA",
    });
    expect(theme.primaryColor).toBe("#112233");
    expect(sharing).toMatchObject({
      defaultOpenGraphImageUrl: "/draft-share.png",
      faviconUrl: undefined,
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefrontDraft/home",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefrontDraft/theme",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefrontDraft/sharing",
    );
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("saves sanitized theme settings and revalidates channel tags", async () => {
    const saved = await saveStorefrontTheme({
      channelId: "channel_1",
      theme: {
        accentColor: "#445566",
        id: "theme",
        logoUrl: "data:image/svg+xml,<svg></svg>",
        primaryColor: "#112233",
        radius: "3xl",
      },
      uid: "uid_1",
    });

    expect(saved).toMatchObject({
      accentColor: "#445566",
      logoUrl: undefined,
      primaryColor: "#112233",
      radius: "3xl",
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/theme",
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accentColor: "#445566",
        primaryColor: "#112233",
        radius: "3xl",
        updatedByUid: "uid_1",
      }),
      { merge: true },
    );
    expectFirestorePayloadHasNoUndefinedValues(
      mocks.set.mock.calls.at(-1)?.[0],
    );
    expect(mocks.set.mock.calls.at(-1)?.[0]).toHaveProperty(
      "logoUrl",
      expect.anything(),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      storefrontThemeCacheTag,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontThemeCacheTag}-channel_1`,
      "max",
    );
  });

  it("omits undefined optional theme fields from Firestore writes", async () => {
    await saveStorefrontThemeDraft({
      channelId: "channel_1",
      theme: {
        accentColor: "red",
        id: "theme",
        logoUrl: "javascript:alert(1)",
      },
      uid: "uid_1",
    });

    const payload = mocks.set.mock.calls.at(-1)?.[0];

    expectFirestorePayloadHasNoUndefinedValues(payload);
    expect(payload).toHaveProperty("accentColor", expect.anything());
    expect(payload).toHaveProperty("logoUrl", expect.anything());
  });

  it("saves sanitized sharing settings and revalidates channel tags", async () => {
    const saved = await saveStorefrontSharing({
      channelId: "channel_1",
      sharing: {
        defaultOpenGraphImageUrl: "https://cdn.example.com/default.png",
        faviconUrl: "https://cdn.example.com/favicon.ico",
        id: "sharing",
      },
      uid: "uid_1",
    });

    expect(saved).toMatchObject({
      defaultOpenGraphImageUrl: "https://cdn.example.com/default.png",
      faviconUrl: "https://cdn.example.com/favicon.ico",
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/sharing",
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultOpenGraphImageUrl: "https://cdn.example.com/default.png",
        faviconUrl: "https://cdn.example.com/favicon.ico",
        updatedByUid: "uid_1",
      }),
      { merge: true },
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      storefrontSharingCacheTag,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontSharingCacheTag}-channel_1`,
      "max",
    );
  });

  it("clears a saved radius when the theme uses default rounding", async () => {
    const saved = await saveStorefrontTheme({
      channelId: "channel_1",
      theme: {
        id: "theme",
      },
      uid: "uid_1",
    });

    expect(saved.radius).toBeUndefined();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        radius: expect.anything(),
        updatedByUid: "uid_1",
      }),
      { merge: true },
    );
  });

  it("loads draft content and recent revisions", async () => {
    mocks.docSnapshots.set("channels/channel_1/storefrontDraft/home", {
      blocks: [
        {
          enabled: true,
          id: "popular-products",
          title: "Draft",
          type: "popular-products",
        },
      ],
      id: "home",
    });
    mocks.docSnapshots.set("channels/channel_1/storefrontDraft/sharing", {
      defaultOpenGraphImageUrl: "https://cdn.example.com/draft-share.png",
      id: "sharing",
    });
    mocks.collectionDocs.push({
      data: () => ({
        changedAreas: ["home", "sharing", "theme", "unknown"],
        homePage: {
          blocks: [
            {
              enabled: true,
              id: "popular-products",
              title: "Published",
              type: "popular-products",
            },
          ],
          id: "home",
        },
        sharing: {
          defaultOpenGraphImageUrl:
            "https://cdn.example.com/published-share.png",
          id: "sharing",
        },
        source: "publish",
      }),
      id: "revision_1",
    });

    await expect(
      getStorefrontEditorDraftContent("channel_1"),
    ).resolves.toMatchObject({
      homePage: {
        blocks: [
          {
            title: "Draft",
            type: "popular-products",
          },
        ],
      },
      sharing: {
        defaultOpenGraphImageUrl: "https://cdn.example.com/draft-share.png",
      },
    });
    await expect(
      listStorefrontEditorRevisions({ channelId: "channel_1" }),
    ).resolves.toMatchObject([
      {
        changedAreas: ["home", "sharing", "theme"],
        id: "revision_1",
        sharing: {
          defaultOpenGraphImageUrl:
            "https://cdn.example.com/published-share.png",
        },
        source: "publish",
      },
    ]);
    expect(mocks.collection).toHaveBeenCalledWith(
      "channels/channel_1/storefrontRevisions",
    );
    expect(mocks.orderBy).toHaveBeenCalledWith("createdAt", "desc");
  });

  it("publishes draft content to live docs and records a revision", async () => {
    mocks.docSnapshots.set("channels/channel_1/storefrontDraft/home", {
      blocks: [
        {
          enabled: true,
          id: "popular-products",
          title: "Draft Products",
          type: "popular-products",
        },
      ],
      id: "home",
    });
    mocks.docSnapshots.set("channels/channel_1/storefrontDraft/theme", {
      id: "theme",
      primaryColor: "#112233",
    });
    mocks.docSnapshots.set("channels/channel_1/storefrontDraft/sharing", {
      defaultOpenGraphImageUrl: "https://cdn.example.com/draft-share.png",
      id: "sharing",
    });

    const revision = await publishStorefrontEditorDraft({
      channelId: "channel_1",
      uid: "uid_1",
    });

    expect(revision).toMatchObject({
      changedAreas: ["home", "sharing", "theme"],
      id: "revision_1",
      sharing: {
        defaultOpenGraphImageUrl: "https://cdn.example.com/draft-share.png",
      },
      source: "publish",
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/home",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/theme",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/sharing",
    );
    expect(mocks.revisionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        changedAreas: ["home", "sharing", "theme"],
        createdByUid: "uid_1",
        homePage: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ title: "Draft Products" }),
          ]),
        }),
        sharing: expect.objectContaining({
          defaultOpenGraphImageUrl: "https://cdn.example.com/draft-share.png",
        }),
        source: "publish",
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontHomeCacheTag}-channel_1`,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontThemeCacheTag}-channel_1`,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontSharingCacheTag}-channel_1`,
      "max",
    );
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(3);
  });

  it("rolls back a published revision into live docs and clears drafts", async () => {
    mocks.revisionGet.mockResolvedValue({
      data: () => ({
        changedAreas: ["home"],
        homePage: {
          blocks: [
            {
              enabled: true,
              id: "hero",
              title: "Previous Hero",
              type: "hero",
            },
          ],
          id: "home",
        },
        sharing: {
          defaultOpenGraphImageUrl:
            "https://cdn.example.com/previous-share.png",
          id: "sharing",
        },
        source: "publish",
      }),
      exists: true,
      id: "revision_1",
    });

    const rollbackRevision = await rollbackStorefrontEditorRevision({
      channelId: "channel_1",
      revisionId: "revision_1",
      uid: "uid_1",
    });

    expect(rollbackRevision).toMatchObject({
      changedAreas: ["home", "sharing"],
      rollbackRevisionId: "revision_1",
      sharing: {
        defaultOpenGraphImageUrl: "https://cdn.example.com/previous-share.png",
      },
      source: "rollback",
    });
    expect(mocks.revisionDoc).toHaveBeenCalledWith("revision_1");
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/home",
    );
    expect(mocks.doc).toHaveBeenCalledWith(
      "channels/channel_1/storefront/sharing",
    );
    expect(mocks.revisionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        rollbackRevisionId: "revision_1",
        source: "rollback",
      }),
    );
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(3);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontHomeCacheTag}-channel_1`,
      "max",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `${storefrontSharingCacheTag}-channel_1`,
      "max",
    );
  });
});
