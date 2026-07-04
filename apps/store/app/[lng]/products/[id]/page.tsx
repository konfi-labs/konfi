import {
  getAppForServer,
  getStoreRuntimeConfigForRequest,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import {
  getAttributeTranslations,
  getPageMetadata,
  getProductTranslations,
} from "@konfi/firebase";
import {
  ApplicationMethodTargetTypeEnum,
  Attribute,
  Campaign,
  CurrencyEnum,
  DEFAULT_LOCALE,
  Locale,
  Product,
  ProductTemplate,
  Promotion,
  Rating,
  Settings,
  ShippingOptions,
} from "@konfi/types";
import {
  formatMetadataResult,
  formatPrice,
  getProductListingPrices,
  getAvailableShippingOptions,
  isMatrixLikePriceType,
  isPurchasable,
  orderAttributeOptions,
  T_STORE_PRODUCTS,
  validatePromotion,
  validatePromotionRules,
} from "@konfi/utils";
import { RelatedProducts } from "app/[lng]/components/products/Related";
import { isUndefined } from "es-toolkit";
import {
  getDoc as firestoreGetDoc,
  getFirestore,
  type CollectionReference,
  where,
} from "firebase/firestore";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Product as ProductSchema, WithContext } from "schema-dts";
import { ProductSchema as ProductJsonLdSchema } from "../../components/schema/ProductSchema";
import ProductPage from "./product-page";
import {
  ADMIN_PRODUCT_PREVIEW_COOKIE,
  isAdminProductPreviewRequested,
  verifyAdminProductPreviewSession,
} from "@/lib/product-preview.server";
import { buildAlternates } from "@/lib/seo";
import ProductLoading from "./loading";

// Helper to parse channel hints embedded in slug (format: slug__ch__channelId)
const CHANNEL_HINT_DELIM = "__ch__";
const PRODUCT_ID_BUILD_PLACEHOLDER = "__build-validation__";
function parseIdChannelHint(raw: string): { slug: string; channelId?: string } {
  const idx = raw.lastIndexOf(CHANNEL_HINT_DELIM);
  if (idx === -1) return { slug: raw };
  const slug = raw.slice(0, idx);
  const ch = raw.slice(idx + CHANNEL_HINT_DELIM.length);
  return { slug: slug || raw, channelId: ch || undefined };
}

async function getProduct(
  id: string,
  lng: Locale,
  queryChannelId?: string,
  options?: { allowAdminPreview?: boolean },
  runtimeChannelId?: string,
): Promise<{
  product: Product | undefined;
  attributes: Attribute[] | undefined;
  description: string | undefined;
  productLowPrice: string | undefined;
  productHighPrice: string | undefined;
  handlingTime: number | undefined;
  shippingRate: number | undefined;
  ratings?: Rating[];
  ratingsCount?: number;
  expressSettings?: Settings["express"];
  resolvedChannelId?: string;
}> {
  try {
    const { get, db } = await import("@konfi/firebase");
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);

    // Parse channel hint from id (e.g., "slug__ch__channelId")
    const { slug: slugFromId, channelId: hintChannelId } =
      parseIdChannelHint(id);
    const effectiveChannelId =
      queryChannelId ?? hintChannelId ?? runtimeChannelId;

    if (!effectiveChannelId) {
      throw new Error("Store product channelId could not be resolved.");
    }

    async function getOptionalSettingsDoc<T>(
      channelId: string | undefined,
      docId: string,
    ): Promise<T | undefined> {
      if (!channelId) {
        return undefined;
      }

      const docSnap = await firestoreGetDoc(
        db.doc<T>(firestore, `/channels/${channelId}/settings`, docId),
      );

      return docSnap.exists() ? (docSnap.data() as T) : undefined;
    }

    async function getStoreSettingWithFallback<T>(
      docId: string,
    ): Promise<T | undefined> {
      const channelSetting = await getOptionalSettingsDoc<T>(
        effectiveChannelId,
        docId,
      );

      if (channelSetting !== undefined) {
        return channelSetting;
      }

      if (runtimeChannelId && effectiveChannelId !== runtimeChannelId) {
        return await getOptionalSettingsDoc<T>(runtimeChannelId, docId);
      }

      return undefined;
    }

    // Build product query filters
    const allowAdminPreview = options?.allowAdminPreview === true;
    const productFilters = [where("seo.slug", "==", slugFromId as string)];

    if (!allowAdminPreview) {
      productFilters.push(where("active", "==", true));
    }

    // If we're explicitly pointing to another channel (query param or hint),
    // do NOT require published=true (B2B/shared links)
    if (!allowAdminPreview && !queryChannelId && !hintChannelId) {
      productFilters.push(where("availability.published", "==", true));
    }

    // Fetch product
    const product: Product = await get<Product>(
      db.query<Product>(
        firestore,
        `/channels/${effectiveChannelId}/products`,
        1,
        undefined,
        productFilters,
      ),
    )
      .then((result) => {
        if (!result) throw "Product result is undefined";
        const [products] = result;
        return products[0];
      })
      .catch((error) => {
        throw `${error}`;
      });

    if (isUndefined(product)) {
      console.error("isUndefined(product)");
      return {
        product: undefined,
        attributes: undefined,
        description: undefined,
        productLowPrice: undefined,
        productHighPrice: undefined,
        handlingTime: undefined,
        shippingRate: undefined,
        resolvedChannelId: effectiveChannelId,
      };
    }

    if (!allowAdminPreview && !isPurchasable(product)) {
      return {
        product: undefined,
        attributes: undefined,
        description: undefined,
        productLowPrice: undefined,
        productHighPrice: undefined,
        handlingTime: undefined,
        shippingRate: undefined,
        resolvedChannelId: effectiveChannelId,
      };
    }

    // Start parallel operations - separate conditional and fixed promises
    const ratingsPromise = import("@/lib/firebase/data").then(
      ({ getRatings }) =>
        getRatings({
          channelId: effectiveChannelId,
          productId: product.id,
        }),
    );

    const fixedPromises = [
      // 1. Product translations (use effective channel)
      getProductTranslations(firestore, effectiveChannelId, product.id, lng),

      // 2. Shipping options prices (prefer effective channel, fallback to default)
      getStoreSettingWithFallback<Settings["shippingOptionsPrices"]>(
        "shippingOptionsPrices",
      ),

      // 3. Express settings
      getStoreSettingWithFallback<Settings["express"]>("express"),

      // 4. Ratings
      ratingsPromise,
    ] as const;

    // Conditional attributes promise
    const attributesPromise = isMatrixLikePriceType(product.priceType)
      ? get<Attribute>(
          db.query<Attribute>(firestore, `/attributes`, 99, undefined, [
            where("id", "in", product.attributes),
          ]),
        )
      : Promise.resolve(null);

    // Execute all parallel operations
    const [fixedResults, attributesResult] = await Promise.all([
      Promise.all(fixedPromises),
      attributesPromise,
    ]);

    // Destructure results with proper types
    const [
      productTranslations,
      shippingOptionsPrices,
      expressSettings,
      { ratings, ratingsCount },
    ] = fixedResults;

    // Apply product translations
    if (productTranslations && productTranslations.length > 0) {
      const translation = productTranslations[0];
      product.name = translation.name || product.name;
      product.description = translation.description || product.description;
      if (translation.seo) {
        product.seo = {
          ...product.seo,
          title: translation.seo.title || product.seo.title,
          description: translation.seo.description || product.seo.description,
        };
      }
      product.specialNotes = translation.specialNotes || product.specialNotes;
    }

    // Use raw markdown string instead of serialized MDX to avoid eval() in client
    const description = product.description ?? "";

    // Process attributes if matrix pricing
    let filteredAttributes: Attribute[] = [];
    if (isMatrixLikePriceType(product.priceType) && attributesResult) {
      const [attributes] = attributesResult;

      // Get all attribute IDs that need translations
      const attributeIds = product.attributes.filter((attrId) =>
        attributes.some((attr: Attribute) => attr.id === attrId),
      );

      // Fetch all attribute translations in parallel
      const attributeTranslationPromises = attributeIds.map((attrId) =>
        getAttributeTranslations(firestore, attrId, lng).then(
          (translations) => ({ attrId, translations }),
        ),
      );

      const attributeTranslations = await Promise.all(
        attributeTranslationPromises,
      );
      const translationMap = new Map(
        attributeTranslations.map(({ attrId, translations }) => [
          attrId,
          translations[0] || null,
        ]),
      );

      // Build filtered attributes with translations
      for (const attrId of product.attributes) {
        const attribute = attributes.find(
          (attr: Attribute) => attr.id === attrId,
        );
        if (!attribute) {
          console.error("Something went wrong with attributes initialization");
          return {
            product: undefined,
            attributes: undefined,
            description: undefined,
            productLowPrice: undefined,
            productHighPrice: undefined,
            handlingTime: undefined,
            shippingRate: undefined,
            resolvedChannelId: effectiveChannelId,
          };
        }

        // Apply translations
        const translation = translationMap.get(attrId);
        if (translation) {
          attribute.name = translation.name || attribute.name;
          attribute.options.forEach((option, index) => {
            const optionTranslation = translation.options[index];
            if (optionTranslation) {
              option.label = optionTranslation.label || option.label;
            }
          });
        }

        const productOptionValues =
          product.attributeOptions[attribute.id] ?? [];
        const orderedOptions =
          Array.isArray(productOptionValues) && productOptionValues.length > 0
            ? orderAttributeOptions(attribute.options, productOptionValues)
            : attribute.options;

        filteredAttributes.push({
          ...attribute,
          options: orderedOptions,
        });
      }
    }

    const effectivePrices = getProductListingPrices(product);

    product.prices = [];

    // Calculate shipping rate
    let shippingRate = 30;
    const availableShippingOptions = getAvailableShippingOptions([
      product.shipping.types,
    ]);

    if (shippingOptionsPrices && availableShippingOptions) {
      const filteredShippingOptionsPrices = Object.keys(
        shippingOptionsPrices,
      ).filter((key) =>
        availableShippingOptions.includes(key as ShippingOptions),
      );

      const shippingRates = filteredShippingOptionsPrices.map(
        (key) => shippingOptionsPrices[key],
      );

      shippingRate =
        shippingRates.length > 0
          ? Math.max(...Object.values(shippingRates)) / 100
          : 30;
    }

    return {
      product,
      attributes: filteredAttributes,
      description,
      productLowPrice:
        effectivePrices.lowPrice.value && effectivePrices.lowPrice.volume
          ? formatPrice(
              effectivePrices.lowPrice.value,
              undefined,
              effectivePrices.lowPrice.volume.value,
              undefined,
              lng,
            )
          : undefined,
      productHighPrice:
        effectivePrices.highPrice.value && effectivePrices.highPrice.volume
          ? formatPrice(
              effectivePrices.highPrice.value,
              undefined,
              effectivePrices.highPrice.volume.value,
              undefined,
              lng,
            )
          : undefined,
      handlingTime: effectivePrices.lowPrice.volume
        ? effectivePrices.lowPrice.volume.deliveryTime
        : undefined,
      shippingRate,
      ratings,
      ratingsCount,
      expressSettings,
      resolvedChannelId: effectiveChannelId,
    };
  } catch (error) {
    console.error(error);
    return {
      product: undefined,
      attributes: undefined,
      description: undefined,
      productLowPrice: undefined,
      productHighPrice: undefined,
      handlingTime: undefined,
      shippingRate: undefined,
      resolvedChannelId: undefined,
    };
  }
}
async function getTemplates(
  productId: string,
  queryChannelId?: string,
  runtimeChannelId?: string,
): Promise<
  { name: string; url: string; attributeOptions?: string[] }[] | undefined
> {
  "use cache";
  const templateChannelId = queryChannelId ?? runtimeChannelId;

  if (!templateChannelId) {
    return [];
  }

  cacheTag(
    `productTemplates-${templateChannelId}`,
    `productTemplates-${templateChannelId}-${productId}`,
  );
  cacheLife("max");

  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);

  let templates: { name: string; url: string; attributeOptions: string[] }[];

  try {
    const { getDocs, query, collection } = await import("firebase/firestore");
    const templatesCollection = collection(
      firestore,
      `channels/${templateChannelId}/products/${productId}/templates`,
    ) as CollectionReference<ProductTemplate>;
    const templatesSnapshot = await getDocs(query(templatesCollection));

    const productTemplates = templatesSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    // Convert to expected format
    const templatePromises = productTemplates.map(
      async (template: ProductTemplate) => {
        const persistedDownloadUrl = template.downloadUrl?.trim();

        if (!persistedDownloadUrl) {
          return null;
        }

        return {
          name: template.fileName?.replace(/\.[^/.]+$/, "") || template.name,
          url: persistedDownloadUrl,
          attributeOptions: template.attributeOptions || [],
        };
      },
    );

    const templateResults = await Promise.all(templatePromises);

    templates = templateResults.filter(
      (
        template,
      ): template is {
        name: string;
        url: string;
        attributeOptions: string[];
      } => template !== null && template.url !== undefined,
    );

    // Note: For matrix products, templates should be filtered client-side based on currently
    // selected attribute combinations. Templates should only be shown when the current
    // selection exactly matches the template's attributeOptions.
    // For single/threshold price type products, all templates can be shown.
  } catch (error) {
    console.error("Error fetching product templates:", error);
    templates = [];
  }

  return templates.length > 0 ? templates : [];
}

async function getPromotions(product: Product): Promise<Promotion[]> {
  try {
    const [{ get, db }] = await Promise.all([
      import("@konfi/firebase"),
      import("firebase/firestore"),
    ]);
    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const result = await get<Promotion>(
      db.query<Promotion>(firestore, `/promotions`, 99, undefined, [
        where("active", "==", true),
        where("isAutomatic", "==", true),
        where(
          "applicationMethod.targetType",
          "==",
          ApplicationMethodTargetTypeEnum.ITEMS,
        ),
      ]),
    );
    if (!result) return [];
    const [promotions] = result;
    const matchingPromotions: Promotion[] = [];
    for (const promotion of promotions) {
      const candidatePromotion = promotion;
      if (!promotion.active) continue;
      if (!promotion.rules || promotion.rules.length <= 0) continue;
      const isMatching = validatePromotionRules(
        promotion.rules,
        product.id,
        product.category.id,
        CurrencyEnum.PLN,
      );
      if (isMatching) {
        if (promotion.campaignId) {
          const campaignRef = db.doc<Campaign>(
            firestore,
            "campaigns",
            promotion.campaignId,
          );
          const getDoc = (await import("firebase/firestore")).getDoc;
          const campaign = (await getDoc(campaignRef)).data();
          if (campaign) {
            candidatePromotion.campaign = campaign;
          }
        }
        if (validatePromotion(candidatePromotion, candidatePromotion.campaign))
          matchingPromotions.push(candidatePromotion);
      }
    }
    return matchingPromotions;
  } catch {
    console.error("Error while fetching promotions");
    return [];
  }
}

export async function generateStaticParams() {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return [
      { id: PRODUCT_ID_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE as Locale },
    ];
  }

  try {
    const get = (await import("@konfi/firebase")).get;
    const db = (await import("@konfi/firebase")).db;
    const defaultChannelId = (await import("@/lib/firebase/serverApp"))
      .channelId;
    // If you define a public list of linked channel IDs, prebuild their slugs too (encoded with __ch__).
    // Example: NEXT_PUBLIC_LINKED_CHANNEL_IDS="b2b-channel-1,b2b-channel-2"
    const linked = (process.env.NEXT_PUBLIC_LINKED_CHANNEL_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!defaultChannelId && linked.length === 0) {
      return [
        { id: PRODUCT_ID_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE as Locale },
      ];
    }

    const { firebaseServerApp } = await getAppForServer();
    const firestore = getFirestore(firebaseServerApp);
    const defaults: { id: string; lng: Locale }[] = [];

    if (defaultChannelId) {
      const result = await get<Product>(
        db.query<Product>(
          firestore,
          `/channels/${defaultChannelId}/products`,
          99,
          undefined,
        ),
      );

      if (result) {
        const [products] = result;
        defaults.push(
          ...products
            .filter((product) => isPurchasable(product))
            .map((product) => ({
              id: product?.seo.slug ?? product?.id,
              lng: DEFAULT_LOCALE as Locale,
            })),
        );
      }
    }

    const extras: { id: string; lng: Locale }[] = [];
    for (const chId of linked) {
      try {
        const r = await get<Product>(
          db.query<Product>(
            firestore,
            `/channels/${chId}/products`,
            99,
            undefined,
          ),
        );
        if (!r) continue;
        const [prods] = r;
        // encode the channel in the path so the server can resolve it
        extras.push(
          ...prods
            .filter((p) => isPurchasable(p))
            .map((p) => ({
              id: `${p?.seo.slug ?? p?.id}${CHANNEL_HINT_DELIM}${chId}`,
              lng: DEFAULT_LOCALE as Locale,
            })),
        );
      } catch (e) {
        console.error(
          "Failed generating static params for linked channel",
          chId,
          e,
        );
      }
    }

    const params = [...defaults, ...extras];

    // Next.js Cache Components requires at least one param for validation.
    return params.length > 0
      ? params
      : [{ id: PRODUCT_ID_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE as Locale }];
  } catch (error) {
    console.error("Error generating static product params:", error);
    return [
      { id: PRODUCT_ID_BUILD_PLACEHOLDER, lng: DEFAULT_LOCALE as Locale },
    ];
  }
}
type Params = Promise<{ id: string; lng: Locale }>;
type SearchParams = Promise<{ adminPreview?: string; channelId?: string }>;

async function getRuntimeProduct(id: string, lng: Locale, channelId: string) {
  "use cache";
  cacheTag(
    `storeProduct-${channelId}`,
    `storeProduct-${channelId}-${id}`,
    `storeProduct-${channelId}-${id}-${lng}`,
  );
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  const result = await getProduct(id, lng, undefined, undefined, channelId);
  // Serialize to strip Firestore Timestamps (toJSON) which are not supported by RSC serialization
  return JSON.parse(JSON.stringify(result));
}

async function getAdminProductPreviewSessionEnabled() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_PRODUCT_PREVIEW_COOKIE)?.value;

  return Boolean(verifyAdminProductPreviewSession(sessionCookie));
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ProductLoading />}>
      <CachedPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CachedPageContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  // Await params and searchParams inside the cached component
  const { id, lng } = await params;
  const { adminPreview, channelId } = await searchParams;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  if (id === PRODUCT_ID_BUILD_PLACEHOLDER) {
    notFound();
  }

  // Detect channel hints inside the id and bypass cache when present
  const { channelId: hintChannelId } = parseIdChannelHint(id);
  const allowAdminPreview =
    isAdminProductPreviewRequested(adminPreview) &&
    (await getAdminProductPreviewSessionEnabled());
  const bypassCache =
    allowAdminPreview || Boolean(channelId) || Boolean(hintChannelId);

  const {
    product,
    attributes,
    description,
    productLowPrice,
    handlingTime,
    shippingRate,
    ratings,
    ratingsCount,
    expressSettings,
    resolvedChannelId,
  } = bypassCache
    ? await getProduct(
        id,
        lng,
        channelId,
        {
          allowAdminPreview,
        },
        runtimeConfig.channelId,
      )
    : await getRuntimeProduct(id, lng, runtimeConfig.channelId);

  const [templates, promotions] = await Promise.all([
    product
      ? getTemplates(product.id, resolvedChannelId, runtimeConfig.channelId)
      : undefined,
    product ? getPromotions(product) : [],
  ]);

  let jsonLd: WithContext<ProductSchema> | undefined;
  // Only emit JSON-LD for the public store channel
  if (!allowAdminPreview && !channelId && !hintChannelId) {
    jsonLd = product && {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.seo.title ?? product.name,
      image: runtimeConfig.cdnUrl
        ? `${runtimeConfig.cdnUrl}/channels/${resolvedChannelId ?? runtimeConfig.channelId}/products/${product.id}/${product.spec.images[0]}`
        : undefined,
      description: product.seo.description,
      category: product.category.name,
      url: `${runtimeConfig.storeBaseUrl}/${lng}/products/${product.seo.slug}`,
      itemCondition: "https://schema.org/NewCondition",
      aggregateRating:
        product.averageRating && ratingsCount
          ? {
              "@type": "AggregateRating",
              bestRating: 5,
              ratingValue: product.averageRating,
              ratingCount: ratingsCount,
            }
          : undefined,
      offers: productLowPrice
        ? [
            {
              "@type": "Offer",
              availability: "https://schema.org/InStock",
              priceCurrency: "PLN",
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: productLowPrice,
                priceCurrency: "PLN",
                valueAddedTaxIncluded: true,
                referenceQuantity: {
                  "@type": "QuantitativeValue",
                  value: product.spec.minimumOrder,
                  unitCode: "item",
                },
              },
              eligibleRegion: "PL",
              price: productLowPrice,
              shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingRate: {
                  "@type": "MonetaryAmount",
                  value: shippingRate,
                  currency: "PLN",
                },
                shippingDestination: {
                  "@type": "DefinedRegion",
                  addressCountry: "PL",
                },
                deliveryTime: {
                  "@type": "ShippingDeliveryTime",
                  handlingTime: {
                    "@type": "QuantitativeValue",
                    minValue: 1,
                    maxValue: handlingTime,
                    unitCode: "DAY",
                  },
                  transitTime: {
                    "@type": "QuantitativeValue",
                    minValue: 1,
                    maxValue: 4,
                    unitCode: "DAY",
                  },
                },
              },
              hasMerchantReturnPolicy: {
                "@type": "MerchantReturnPolicy",
                refundType: "https://schema.org/FullRefund",
                returnPolicyCategory:
                  "https://schema.org/MerchantReturnFiniteReturnWindow",
                merchantReturnDays: 14,
                returnMethod: "https://schema.org/ReturnByMail",
                returnFees: "https://schema.org/FreeReturn",
                applicableCountry: "PL",
              },
            },
          ]
        : undefined,
    };
  }

  return (
    <>
      {jsonLd ? (
        <Suspense fallback={null}>
          <ProductJsonLdSchema jsonLd={jsonLd} />
        </Suspense>
      ) : null}
      <ProductPage
        product={product ? JSON.parse(JSON.stringify(product)) : undefined}
        attributes={
          attributes ? JSON.parse(JSON.stringify(attributes)) : attributes
        }
        description={description ?? ""}
        templates={
          templates ? JSON.parse(JSON.stringify(templates)) : undefined
        }
        ratings={ratings ? JSON.parse(JSON.stringify(ratings)) : ratings}
        ratingsCount={ratingsCount || 0}
        promotions={
          promotions ? JSON.parse(JSON.stringify(promotions)) : undefined
        }
        expressSettings={
          expressSettings
            ? JSON.parse(JSON.stringify(expressSettings))
            : undefined
        }
        resolvedChannelId={resolvedChannelId}
      >
        {product ? (
          <Suspense>
            <RelatedProducts
              productId={product.id}
              productCategoryName={product.category.name}
              channelId={resolvedChannelId ?? runtimeConfig.channelId}
              lng={lng}
            />
          </Suspense>
        ) : null}
      </ProductPage>
    </>
  );
}

interface StoreProductMetadataData {
  canonicalId: string;
  description: string | undefined;
  title: string;
}

async function getCachedProductMetadataData(
  slug: string,
  lng: Locale,
  targetChannelId: string,
): Promise<StoreProductMetadataData | undefined> {
  "use cache";
  cacheTag(
    `storeProductMetadata-${targetChannelId}`,
    `storeProductMetadata-${targetChannelId}-${slug}`,
    `storeProductMetadata-${targetChannelId}-${slug}-${lng}`,
  );
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return undefined;
  }

  const get = (await import("@konfi/firebase")).get;
  const db = (await import("@konfi/firebase")).db;
  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);

  const product = await get<Product>(
    db.query<Product>(
      firestore,
      `/channels/${targetChannelId}/products`,
      1,
      undefined,
      [where("seo.slug", "==", slug), where("active", "==", true)],
    ),
  )
    .then((result) => {
      if (!result) {
        return undefined;
      }

      const [products] = result;
      return products[0];
    })
    .catch((error) => {
      console.error(error);
      return undefined;
    });

  if (!product) {
    return undefined;
  }

  const translations = await getProductTranslations(
    firestore,
    targetChannelId,
    product.id,
    lng,
  );
  const translation = translations[0];
  const translatedSeo = translation?.seo;
  const translatedTitle = translatedSeo?.title || product.seo.title;
  const translatedDescription =
    translatedSeo?.description || product.seo.description;

  return {
    canonicalId: product.seo.slug ?? product.id,
    description:
      translatedDescription || translation?.description || product.description,
    title: translatedTitle || translation?.name || product.name,
  };
}

async function getCachedProductsPageMetadata(
  lng: Locale,
  targetChannelId: string,
): Promise<Metadata> {
  "use cache";
  cacheTag(
    `pageMetadata-${T_STORE_PRODUCTS}`,
    `pageMetadata-${T_STORE_PRODUCTS}-${lng}`,
    `pageMetadata-${T_STORE_PRODUCTS}-${targetChannelId}`,
  );
  cacheLife("max");

  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);
  const metadataResult = await getPageMetadata(
    firestore,
    T_STORE_PRODUCTS,
    lng,
    targetChannelId,
  );

  return formatMetadataResult(metadataResult);
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    return {
      robots: {
        follow: false,
        index: false,
      },
      title: "Store not found",
    };
  }

  if (
    id === PRODUCT_ID_BUILD_PLACEHOLDER ||
    shouldSkipStaticDataDuringCiBuild()
  ) {
    return {
      title: "Products",
      description: "Products",
      alternates: buildAlternates({
        baseUrl: runtimeConfig.storeBaseUrl,
        pathname: `/${lng}/products`,
      }),
    };
  }

  // Respect channel hint for metadata as well
  const { slug: slugFromId, channelId: hintChannelId } = parseIdChannelHint(id);
  const targetChannelId = hintChannelId ?? runtimeConfig.channelId;
  const metadataData = await getCachedProductMetadataData(
    slugFromId,
    lng,
    targetChannelId,
  );

  if (metadataData) {
    return {
      title: metadataData.title,
      description: metadataData.description,
      alternates: buildAlternates({
        baseUrl: runtimeConfig.storeBaseUrl,
        pathname: `/${lng}/products/${metadataData.canonicalId}`,
      }),
    };
  }

  const metadataResult = await getCachedProductsPageMetadata(
    lng,
    runtimeConfig.channelId,
  );
  return {
    ...metadataResult,
    alternates: buildAlternates({
      baseUrl: runtimeConfig.storeBaseUrl,
      pathname: `/${lng}/products`,
    }),
  };
}
