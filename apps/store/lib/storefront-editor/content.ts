import "server-only";

import {
  DEFAULT_STOREFRONT_HOME_BLOCKS,
  DEFAULT_STOREFRONT_THEME,
  STOREFRONT_HOME_BLOCK_RADIUS_TARGETS,
  STOREFRONT_HOME_BLOCK_VARIANTS,
  STOREFRONT_HOME_BLOCK_TYPES,
  type StorefrontHomeBlock,
  type StorefrontHomeBlockRadiusSettings,
  type StorefrontHomeBlockTranslation,
  type StorefrontHomeBlockType,
  type StorefrontHomeBlockVariant,
  type StorefrontHomePage,
  type StorefrontSharingSettings,
  type StorefrontThemeRadius,
  type StorefrontThemeSettings,
} from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import {
  getAdminDb,
  shouldSkipStaticDataDuringCiBuild,
  shouldSilentlyFallbackFromOptionalStaticDataError,
} from "@/lib/firebase/serverApp";
import {
  sanitizeStorefrontSharing,
  storefrontSharingCacheTag,
} from "./sharing-settings";

export { sanitizeStorefrontSharing, storefrontSharingCacheTag };

export const storefrontHomeCacheTag = "storefrontHome";
export const storefrontThemeCacheTag = "storefrontTheme";

const homeDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefront/home`;

const themeDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefront/theme`;

const sharingDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefront/sharing`;

const draftHomeDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefrontDraft/home`;

const draftThemeDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefrontDraft/theme`;

const draftSharingDocumentPath = (channelId: string) =>
  `channels/${channelId}/storefrontDraft/sharing`;

const revisionCollectionPath = (channelId: string) =>
  `channels/${channelId}/storefrontRevisions`;

export type StorefrontEditorRevisionChangedArea = "home" | "sharing" | "theme";
export type StorefrontEditorRevisionSource = "publish" | "rollback";

export interface StorefrontEditorDraftContent {
  homePage?: StorefrontHomePage;
  sharing?: StorefrontSharingSettings;
  theme?: StorefrontThemeSettings;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface StorefrontEditorRevision {
  changedAreas: StorefrontEditorRevisionChangedArea[];
  createdAt?: unknown;
  createdByUid?: string;
  homePage?: StorefrontHomePage;
  id: string;
  rollbackRevisionId?: string;
  sharing?: StorefrontSharingSettings;
  source: StorefrontEditorRevisionSource;
  theme?: StorefrontThemeSettings;
}

const blockTypes = new Set<StorefrontHomeBlockType>(
  STOREFRONT_HOME_BLOCK_TYPES,
);
const defaultBlockTypes = new Set<StorefrontHomeBlockType>(
  DEFAULT_STOREFRONT_HOME_BLOCKS.map((block) => block.type),
);
const legacyDefaultBackfillBlockTypes = new Set<StorefrontHomeBlockType>([
  "testimonials",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const hrefProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
const imageProtocols = new Set(["http:", "https:"]);

const urlValue = (
  value: unknown,
  allowedProtocols: ReadonlySet<string>,
): string | undefined => {
  const text = stringValue(value);

  if (!text) {
    return undefined;
  }

  if (text.startsWith("/") || text.startsWith("#")) {
    return text;
  }

  try {
    const parsedUrl = new URL(text);

    return allowedProtocols.has(parsedUrl.protocol) ? text : undefined;
  } catch {
    return undefined;
  }
};

const localeValue = (value: unknown) => {
  const locale = stringValue(value)?.toLowerCase();

  return locale && /^[a-z]{2}(-[a-z]{2})?$/iu.test(locale) ? locale : undefined;
};

const booleanValue = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const colorPattern = /^#[0-9a-f]{6}$/iu;
const radiusValues = new Set<StorefrontThemeRadius>([
  "none",
  "sm",
  "md",
  "lg",
  "xl",
  "3xl",
]);
const buttonStyleValues = new Set(["solid", "subtle", "outline"]);

const sanitizeRadius = (value: unknown): StorefrontThemeRadius | undefined => {
  const radius = stringValue(value);

  return radius && radiusValues.has(radius as StorefrontThemeRadius)
    ? (radius as StorefrontThemeRadius)
    : undefined;
};

const sanitizeBlockRadiusOverrides = (
  value: unknown,
): StorefrontHomeBlockRadiusSettings | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const radiusOverrides =
    STOREFRONT_HOME_BLOCK_RADIUS_TARGETS.reduce<StorefrontHomeBlockRadiusSettings>(
      (result, target) => {
        const radius = sanitizeRadius(value[target]);

        if (radius) {
          result[target] = radius;
        }

        return result;
      },
      {},
    );

  return Object.keys(radiusOverrides).length > 0 ? radiusOverrides : undefined;
};

const sanitizeBlockTranslation = (
  value: unknown,
): StorefrontHomeBlockTranslation | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    body: stringValue(value.body),
    ctaLabel: stringValue(value.ctaLabel),
    subtitle: stringValue(value.subtitle),
    title: stringValue(value.title),
  };
};

const sanitizeBlockTranslations = (
  value: unknown,
): Record<string, StorefrontHomeBlockTranslation> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const translations = Object.entries(value).reduce<
    Record<string, StorefrontHomeBlockTranslation>
  >((result, [locale, translation]) => {
    if (!/^[a-z]{2}(-[a-z]{2})?$/iu.test(locale)) {
      return result;
    }

    const sanitizedTranslation = sanitizeBlockTranslation(translation);

    if (sanitizedTranslation) {
      result[locale.toLowerCase()] = sanitizedTranslation;
    }

    return result;
  }, {});

  return Object.keys(translations).length > 0 ? translations : undefined;
};

const sanitizeRemovedDefaultBlockTypes = (
  value: unknown,
): StorefrontHomeBlockType[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const removedBlockTypes = value.reduce<StorefrontHomeBlockType[]>(
    (result, item) => {
      const blockType = stringValue(item);

      if (
        blockType &&
        blockTypes.has(blockType as StorefrontHomeBlockType) &&
        defaultBlockTypes.has(blockType as StorefrontHomeBlockType) &&
        !result.includes(blockType as StorefrontHomeBlockType)
      ) {
        result.push(blockType as StorefrontHomeBlockType);
      }

      return result;
    },
    [],
  );

  return removedBlockTypes.length > 0 ? removedBlockTypes : undefined;
};

const sanitizeBlock = (
  value: unknown,
  fallbackIndex: number,
): StorefrontHomeBlock | null => {
  if (!isRecord(value)) {
    return null;
  }

  const type = stringValue(value.type);

  if (!type || !blockTypes.has(type as StorefrontHomeBlockType)) {
    return null;
  }

  const blockType = type as StorefrontHomeBlockType;
  const variant = stringValue(value.variant);
  const variants = STOREFRONT_HOME_BLOCK_VARIANTS[
    blockType
  ] as readonly string[];
  const contentFields =
    blockType === "hero"
      ? {}
      : {
          body: stringValue(value.body),
          ctaHref: urlValue(value.ctaHref, hrefProtocols),
          ctaLabel: stringValue(value.ctaLabel),
          imageUrl: urlValue(value.imageUrl, imageProtocols),
          subtitle: stringValue(value.subtitle),
          title: stringValue(value.title),
          translations: sanitizeBlockTranslations(value.translations),
        };

  return {
    enabled: booleanValue(value.enabled, true),
    id: stringValue(value.id) ?? `${type}-${fallbackIndex}`,
    ...contentFields,
    radiusOverrides: sanitizeBlockRadiusOverrides(value.radiusOverrides),
    type: blockType,
    variant:
      variant && variants.includes(variant)
        ? (variant as StorefrontHomeBlockVariant)
        : undefined,
  };
};

const appendLegacyDefaultBlocks = (
  blocks: StorefrontHomeBlock[],
  removedDefaultBlockTypes: readonly StorefrontHomeBlockType[] | undefined,
) => {
  if (!blocks.length) {
    return [...DEFAULT_STOREFRONT_HOME_BLOCKS];
  }

  const existingBlockTypes = new Set(blocks.map((block) => block.type));
  const removedBlockTypes = new Set(removedDefaultBlockTypes ?? []);
  const backfilledBlocks = DEFAULT_STOREFRONT_HOME_BLOCKS.filter(
    (block) =>
      legacyDefaultBackfillBlockTypes.has(block.type) &&
      !existingBlockTypes.has(block.type) &&
      !removedBlockTypes.has(block.type) &&
      DEFAULT_STOREFRONT_HOME_BLOCKS.every(
        (defaultBlock) =>
          defaultBlock.type === block.type ||
          existingBlockTypes.has(defaultBlock.type),
      ),
  );

  if (backfilledBlocks.length === 0) {
    return blocks;
  }

  return backfilledBlocks.reduce<StorefrontHomeBlock[]>(
    (result, backfilledBlock) => {
      const defaultIndex = DEFAULT_STOREFRONT_HOME_BLOCKS.findIndex(
        (defaultBlock) => defaultBlock.type === backfilledBlock.type,
      );
      const previousDefaultBlockTypes = new Set<StorefrontHomeBlockType>(
        DEFAULT_STOREFRONT_HOME_BLOCKS.slice(0, defaultIndex).map(
          (defaultBlock) => defaultBlock.type,
        ),
      );
      let insertAfterIndex = -1;

      result.forEach((block, index) => {
        if (previousDefaultBlockTypes.has(block.type)) {
          insertAfterIndex = index;
        }
      });

      return [
        ...result.slice(0, insertAfterIndex + 1),
        backfilledBlock,
        ...result.slice(insertAfterIndex + 1),
      ];
    },
    blocks,
  );
};

const timestampValue = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    isRecord(value) &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    try {
      return value.toMillis();
    } catch {
      return undefined;
    }
  }

  return typeof value === "number" || typeof value === "string"
    ? value
    : undefined;
};

const changedAreasValue = (
  value: unknown,
): StorefrontEditorRevisionChangedArea[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is StorefrontEditorRevisionChangedArea =>
      item === "home" || item === "sharing" || item === "theme",
  );
};

const sanitizeStorefrontEditorRevision = (
  id: string,
  value: unknown,
): StorefrontEditorRevision | null => {
  if (!isRecord(value)) {
    return null;
  }

  const source = value.source === "rollback" ? "rollback" : "publish";
  const homePage = isRecord(value.homePage)
    ? sanitizeStorefrontHomePage(value.homePage)
    : undefined;
  const theme = isRecord(value.theme)
    ? sanitizeStorefrontTheme(value.theme)
    : undefined;
  const sharing = isRecord(value.sharing)
    ? sanitizeStorefrontSharing(value.sharing)
    : undefined;

  return {
    changedAreas: changedAreasValue(value.changedAreas),
    createdAt: timestampValue(value.createdAt),
    createdByUid: stringValue(value.createdByUid),
    homePage,
    id,
    rollbackRevisionId: stringValue(value.rollbackRevisionId),
    sharing,
    source,
    theme,
  };
};

export const sanitizeStorefrontHomePage = (
  value: unknown,
): StorefrontHomePage => {
  const sourceLocale = isRecord(value)
    ? localeValue(value.sourceLocale)
    : undefined;
  const removedDefaultBlockTypes = isRecord(value)
    ? sanitizeRemovedDefaultBlockTypes(value.removedDefaultBlockTypes)
    : undefined;
  const blocks =
    isRecord(value) && Array.isArray(value.blocks)
      ? value.blocks.flatMap((block, index) => {
          const sanitized = sanitizeBlock(block, index);

          return sanitized ? [sanitized] : [];
        })
      : [];

  return {
    blocks: appendLegacyDefaultBlocks(blocks, removedDefaultBlockTypes),
    id: "home",
    ...(removedDefaultBlockTypes ? { removedDefaultBlockTypes } : {}),
    ...(sourceLocale ? { sourceLocale } : {}),
  };
};

export const sanitizeStorefrontTheme = (
  value: unknown,
): StorefrontThemeSettings => {
  const record = isRecord(value) ? value : {};
  const primaryColor = stringValue(record.primaryColor);
  const accentColor = stringValue(record.accentColor);
  const radius = stringValue(record.radius);
  const buttonStyle = stringValue(record.buttonStyle);
  const sanitizedRadius = sanitizeRadius(radius);

  return {
    accentColor:
      accentColor && colorPattern.test(accentColor) ? accentColor : undefined,
    buttonStyle:
      buttonStyle && buttonStyleValues.has(buttonStyle)
        ? (buttonStyle as StorefrontThemeSettings["buttonStyle"])
        : DEFAULT_STOREFRONT_THEME.buttonStyle,
    gradientEnabled: record.gradientEnabled === true ? true : undefined,
    id: "theme",
    logoUrl: urlValue(record.logoUrl, imageProtocols),
    primaryColor:
      primaryColor && colorPattern.test(primaryColor)
        ? primaryColor
        : undefined,
    ...(sanitizedRadius ? { radius: sanitizedRadius } : {}),
  };
};

const themeWritePayload = (params: {
  theme: StorefrontThemeSettings;
  uid: string;
}) => ({
  ...params.theme,
  accentColor: params.theme.accentColor ?? FieldValue.delete(),
  gradientEnabled: params.theme.gradientEnabled ?? FieldValue.delete(),
  logoUrl: params.theme.logoUrl ?? FieldValue.delete(),
  primaryColor: params.theme.primaryColor ?? FieldValue.delete(),
  radius: params.theme.radius ?? FieldValue.delete(),
  updatedAt: FieldValue.serverTimestamp(),
  updatedByUid: params.uid,
});

const sharingWritePayload = (params: {
  sharing: StorefrontSharingSettings;
  uid: string;
}) => ({
  ...params.sharing,
  defaultOpenGraphImageUrl:
    params.sharing.defaultOpenGraphImageUrl ?? FieldValue.delete(),
  faviconUrl: params.sharing.faviconUrl ?? FieldValue.delete(),
  updatedAt: FieldValue.serverTimestamp(),
  updatedByUid: params.uid,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const stripUndefinedFirestoreValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedFirestoreValues) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>(
    (result, [key, item]) => {
      if (item !== undefined) {
        result[key] = stripUndefinedFirestoreValues(item);
      }

      return result;
    },
    {},
  ) as T;
};

const revalidateStorefrontEditorLiveContent = (channelId: string) => {
  revalidateTag(storefrontHomeCacheTag, "max");
  revalidateTag(`${storefrontHomeCacheTag}-${channelId}`, "max");
  revalidateTag(storefrontSharingCacheTag, "max");
  revalidateTag(`${storefrontSharingCacheTag}-${channelId}`, "max");
  revalidateTag(storefrontThemeCacheTag, "max");
  revalidateTag(`${storefrontThemeCacheTag}-${channelId}`, "max");
};

export async function getCachedStorefrontHomePage(
  channelId: string,
): Promise<StorefrontHomePage> {
  "use cache";
  cacheTag(storefrontHomeCacheTag, `${storefrontHomeCacheTag}-${channelId}`);
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return sanitizeStorefrontHomePage(undefined);
  }

  try {
    const snapshot = await getAdminDb().doc(homeDocumentPath(channelId)).get();

    return sanitizeStorefrontHomePage(snapshot.data());
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error loading storefront home page:", error);
    }
    return sanitizeStorefrontHomePage(undefined);
  }
}

export async function getCachedStorefrontTheme(
  channelId: string,
): Promise<StorefrontThemeSettings> {
  "use cache";
  cacheTag(storefrontThemeCacheTag, `${storefrontThemeCacheTag}-${channelId}`);
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return sanitizeStorefrontTheme(undefined);
  }

  try {
    const snapshot = await getAdminDb().doc(themeDocumentPath(channelId)).get();

    return sanitizeStorefrontTheme(snapshot.data());
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error loading storefront theme:", error);
    }
    return sanitizeStorefrontTheme(undefined);
  }
}

export async function getCachedStorefrontSharing(
  channelId: string,
): Promise<StorefrontSharingSettings> {
  "use cache";
  cacheTag(
    storefrontSharingCacheTag,
    `${storefrontSharingCacheTag}-${channelId}`,
  );
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return sanitizeStorefrontSharing(undefined);
  }

  try {
    const snapshot = await getAdminDb()
      .doc(sharingDocumentPath(channelId))
      .get();

    return sanitizeStorefrontSharing(snapshot.data());
  } catch (error) {
    if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
      console.error("Error loading storefront sharing settings:", error);
    }
    return sanitizeStorefrontSharing(undefined);
  }
}

export async function getStorefrontEditorDraftContent(
  channelId: string,
): Promise<StorefrontEditorDraftContent> {
  const [homeSnapshot, themeSnapshot, sharingSnapshot] = await Promise.all([
    getAdminDb().doc(draftHomeDocumentPath(channelId)).get(),
    getAdminDb().doc(draftThemeDocumentPath(channelId)).get(),
    getAdminDb().doc(draftSharingDocumentPath(channelId)).get(),
  ]);

  return {
    homePage: homeSnapshot.exists
      ? sanitizeStorefrontHomePage(homeSnapshot.data())
      : undefined,
    sharing: sharingSnapshot.exists
      ? sanitizeStorefrontSharing(sharingSnapshot.data())
      : undefined,
    theme: themeSnapshot.exists
      ? sanitizeStorefrontTheme(themeSnapshot.data())
      : undefined,
    updatedAt:
      sharingSnapshot.data()?.updatedAt ??
      themeSnapshot.data()?.updatedAt ??
      homeSnapshot.data()?.updatedAt,
    updatedByUid:
      sharingSnapshot.data()?.updatedByUid ??
      themeSnapshot.data()?.updatedByUid ??
      homeSnapshot.data()?.updatedByUid,
  };
}

export async function listStorefrontEditorRevisions(params: {
  channelId: string;
  limit?: number;
}): Promise<StorefrontEditorRevision[]> {
  const snapshot = await getAdminDb()
    .collection(revisionCollectionPath(params.channelId))
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(params.limit ?? 10, 1), 25))
    .get();

  return snapshot.docs.flatMap((document) => {
    const revision = sanitizeStorefrontEditorRevision(
      document.id,
      document.data(),
    );

    return revision ? [revision] : [];
  });
}

export async function saveStorefrontHomePage(params: {
  channelId: string;
  homePage: StorefrontHomePage;
  uid: string;
}) {
  const homePage = sanitizeStorefrontHomePage(params.homePage);

  await getAdminDb()
    .doc(homeDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues({
        ...homePage,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: params.uid,
      }),
      { merge: true },
    );

  revalidateTag(storefrontHomeCacheTag, "max");
  revalidateTag(`${storefrontHomeCacheTag}-${params.channelId}`, "max");

  return homePage;
}

export async function saveStorefrontHomePageDraft(params: {
  channelId: string;
  homePage: StorefrontHomePage;
  uid: string;
}) {
  const homePage = sanitizeStorefrontHomePage(params.homePage);

  await getAdminDb()
    .doc(draftHomeDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues({
        ...homePage,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: params.uid,
      }),
      { merge: true },
    );

  return homePage;
}

export async function saveStorefrontTheme(params: {
  channelId: string;
  theme: StorefrontThemeSettings;
  uid: string;
}) {
  const theme = sanitizeStorefrontTheme(params.theme);

  await getAdminDb()
    .doc(themeDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues(
        themeWritePayload({ theme, uid: params.uid }),
      ),
      {
        merge: true,
      },
    );

  revalidateTag(storefrontThemeCacheTag, "max");
  revalidateTag(`${storefrontThemeCacheTag}-${params.channelId}`, "max");

  return theme;
}

export async function saveStorefrontThemeDraft(params: {
  channelId: string;
  theme: StorefrontThemeSettings;
  uid: string;
}) {
  const theme = sanitizeStorefrontTheme(params.theme);

  await getAdminDb()
    .doc(draftThemeDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues(
        themeWritePayload({ theme, uid: params.uid }),
      ),
      {
        merge: true,
      },
    );

  return theme;
}

export async function saveStorefrontSharing(params: {
  channelId: string;
  sharing: StorefrontSharingSettings;
  uid: string;
}) {
  const sharing = sanitizeStorefrontSharing(params.sharing);

  await getAdminDb()
    .doc(sharingDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues(
        sharingWritePayload({
          sharing,
          uid: params.uid,
        }),
      ),
      { merge: true },
    );

  revalidateTag(storefrontSharingCacheTag, "max");
  revalidateTag(`${storefrontSharingCacheTag}-${params.channelId}`, "max");

  return sharing;
}

export async function saveStorefrontSharingDraft(params: {
  channelId: string;
  sharing: StorefrontSharingSettings;
  uid: string;
}) {
  const sharing = sanitizeStorefrontSharing(params.sharing);

  await getAdminDb()
    .doc(draftSharingDocumentPath(params.channelId))
    .set(
      stripUndefinedFirestoreValues(
        sharingWritePayload({
          sharing,
          uid: params.uid,
        }),
      ),
      { merge: true },
    );

  return sharing;
}

export async function publishStorefrontEditorDraft(params: {
  channelId: string;
  uid: string;
}): Promise<StorefrontEditorRevision> {
  const [
    draftHomeSnapshot,
    draftThemeSnapshot,
    draftSharingSnapshot,
    liveHomeSnapshot,
    liveThemeSnapshot,
    liveSharingSnapshot,
  ] = await Promise.all([
    getAdminDb().doc(draftHomeDocumentPath(params.channelId)).get(),
    getAdminDb().doc(draftThemeDocumentPath(params.channelId)).get(),
    getAdminDb().doc(draftSharingDocumentPath(params.channelId)).get(),
    getAdminDb().doc(homeDocumentPath(params.channelId)).get(),
    getAdminDb().doc(themeDocumentPath(params.channelId)).get(),
    getAdminDb().doc(sharingDocumentPath(params.channelId)).get(),
  ]);
  const changedAreas: StorefrontEditorRevisionChangedArea[] = [];
  const homePage = draftHomeSnapshot.exists
    ? sanitizeStorefrontHomePage(draftHomeSnapshot.data())
    : liveHomeSnapshot.exists
      ? sanitizeStorefrontHomePage(liveHomeSnapshot.data())
      : undefined;
  const theme = draftThemeSnapshot.exists
    ? sanitizeStorefrontTheme(draftThemeSnapshot.data())
    : liveThemeSnapshot.exists
      ? sanitizeStorefrontTheme(liveThemeSnapshot.data())
      : undefined;
  const sharing = draftSharingSnapshot.exists
    ? sanitizeStorefrontSharing(draftSharingSnapshot.data())
    : liveSharingSnapshot.exists
      ? sanitizeStorefrontSharing(liveSharingSnapshot.data())
      : undefined;

  if (draftHomeSnapshot.exists) {
    changedAreas.push("home");
  }

  if (draftSharingSnapshot.exists) {
    changedAreas.push("sharing");
  }

  if (draftThemeSnapshot.exists) {
    changedAreas.push("theme");
  }

  if (changedAreas.length === 0) {
    throw new Error("No storefront draft changes are available to publish.");
  }

  const revisionRef = getAdminDb()
    .collection(revisionCollectionPath(params.channelId))
    .doc();
  const revisionPayload = {
    changedAreas,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: params.uid,
    id: revisionRef.id,
    source: "publish" satisfies StorefrontEditorRevisionSource,
    ...(homePage ? { homePage } : {}),
    ...(sharing ? { sharing } : {}),
    ...(theme ? { theme } : {}),
  };

  await Promise.all([
    homePage
      ? getAdminDb()
          .doc(homeDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues({
              ...homePage,
              updatedAt: FieldValue.serverTimestamp(),
              updatedByUid: params.uid,
            }),
            { merge: true },
          )
      : Promise.resolve(),
    theme
      ? getAdminDb()
          .doc(themeDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues(
              themeWritePayload({ theme, uid: params.uid }),
            ),
            { merge: true },
          )
      : Promise.resolve(),
    sharing
      ? getAdminDb()
          .doc(sharingDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues(
              sharingWritePayload({ sharing, uid: params.uid }),
            ),
            {
              merge: true,
            },
          )
      : Promise.resolve(),
    draftHomeSnapshot.exists
      ? getAdminDb().doc(draftHomeDocumentPath(params.channelId)).delete()
      : Promise.resolve(),
    draftThemeSnapshot.exists
      ? getAdminDb().doc(draftThemeDocumentPath(params.channelId)).delete()
      : Promise.resolve(),
    draftSharingSnapshot.exists
      ? getAdminDb().doc(draftSharingDocumentPath(params.channelId)).delete()
      : Promise.resolve(),
    revisionRef.set(stripUndefinedFirestoreValues(revisionPayload)),
  ]);

  revalidateStorefrontEditorLiveContent(params.channelId);

  return {
    changedAreas,
    createdByUid: params.uid,
    homePage,
    id: revisionRef.id,
    sharing,
    source: "publish",
    theme,
  };
}

export async function rollbackStorefrontEditorRevision(params: {
  channelId: string;
  revisionId: string;
  uid: string;
}): Promise<StorefrontEditorRevision> {
  const revisionSnapshot = await getAdminDb()
    .collection(revisionCollectionPath(params.channelId))
    .doc(params.revisionId)
    .get();
  const revision = sanitizeStorefrontEditorRevision(
    revisionSnapshot.id,
    revisionSnapshot.data(),
  );

  if (!revision || !(revision.homePage || revision.sharing || revision.theme)) {
    throw new Error("Storefront revision was not found.");
  }

  const rollbackRevisionRef = getAdminDb()
    .collection(revisionCollectionPath(params.channelId))
    .doc();
  const changedAreas: StorefrontEditorRevisionChangedArea[] = [
    ...(revision.homePage ? (["home"] as const) : []),
    ...(revision.sharing ? (["sharing"] as const) : []),
    ...(revision.theme ? (["theme"] as const) : []),
  ];
  const rollbackPayload = {
    changedAreas,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: params.uid,
    id: rollbackRevisionRef.id,
    rollbackRevisionId: revision.id,
    source: "rollback" satisfies StorefrontEditorRevisionSource,
    ...(revision.homePage ? { homePage: revision.homePage } : {}),
    ...(revision.sharing ? { sharing: revision.sharing } : {}),
    ...(revision.theme ? { theme: revision.theme } : {}),
  };

  await Promise.all([
    revision.homePage
      ? getAdminDb()
          .doc(homeDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues({
              ...revision.homePage,
              updatedAt: FieldValue.serverTimestamp(),
              updatedByUid: params.uid,
            }),
            { merge: true },
          )
      : Promise.resolve(),
    revision.theme
      ? getAdminDb()
          .doc(themeDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues(
              themeWritePayload({ theme: revision.theme, uid: params.uid }),
            ),
            {
              merge: true,
            },
          )
      : Promise.resolve(),
    revision.sharing
      ? getAdminDb()
          .doc(sharingDocumentPath(params.channelId))
          .set(
            stripUndefinedFirestoreValues(
              sharingWritePayload({
                sharing: revision.sharing,
                uid: params.uid,
              }),
            ),
            {
              merge: true,
            },
          )
      : Promise.resolve(),
    getAdminDb().doc(draftHomeDocumentPath(params.channelId)).delete(),
    getAdminDb().doc(draftThemeDocumentPath(params.channelId)).delete(),
    getAdminDb().doc(draftSharingDocumentPath(params.channelId)).delete(),
    rollbackRevisionRef.set(stripUndefinedFirestoreValues(rollbackPayload)),
  ]);

  revalidateStorefrontEditorLiveContent(params.channelId);

  return {
    changedAreas,
    createdByUid: params.uid,
    homePage: revision.homePage,
    id: rollbackRevisionRef.id,
    rollbackRevisionId: revision.id,
    sharing: revision.sharing,
    source: "rollback",
    theme: revision.theme,
  };
}
