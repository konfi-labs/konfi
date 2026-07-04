import {
  getAppForServer,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { buildRuntimeAssetUrl } from "@/lib/runtime-config";
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
  T_STORE_B2B_PRODUCTS,
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
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ProductPage from "../../../products/[id]/product-page";
import ProductLoading from "../../../products/[id]/loading";

async function getProduct(
  channelIdFromUrl: string,
  slug: string,
  lng: Locale,
  defaultChannelId: string,
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

    // For B2B products, use the channelId from the URL path
    const effectiveChannelId = channelIdFromUrl;

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

      if (effectiveChannelId !== defaultChannelId) {
        return await getOptionalSettingsDoc<T>(defaultChannelId, docId);
      }

      return undefined;
    }

    // Build product query filters - don't require published for B2B
    const productFilters = [
      where("seo.slug", "==", slug as string),
      where("active", "==", true),
    ];

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

    if (!isPurchasable(product)) {
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

    // Start parallel operations
    const ratingsPromise = import("@/lib/firebase/data").then(
      ({ getRatings }) =>
        getRatings({
          channelId: effectiveChannelId,
          productId: product.id,
        }),
    );

    const fixedPromises = [
      // 1. Product translations
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

    // Destructure results
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

    // Use raw markdown string
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

        filteredAttributes.push({
          ...attribute,
          options: attribute.options.filter((option) =>
            product.attributeOptions[attribute.id].includes(option.value),
          ),
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
    console.error("Error fetching B2B product:", error);
    return {
      product: undefined,
      attributes: undefined,
      description: undefined,
      productLowPrice: undefined,
      productHighPrice: undefined,
      handlingTime: undefined,
      shippingRate: undefined,
      resolvedChannelId: channelIdFromUrl,
    };
  }
}

async function getTemplates(
  product: Product,
  queryChannelId?: string,
): Promise<
  { name: string; url: string; attributeOptions?: string[] }[] | undefined
> {
  const storageModule = await import("firebase/storage");
  const channelId = queryChannelId;

  if (!channelId) {
    return [];
  }

  const { getStorage, getDownloadURL, ref } = storageModule;
  const { firebaseServerApp } = await getAppForServer();
  const storage = getStorage(firebaseServerApp);
  const firestore = getFirestore(firebaseServerApp);

  let templates: { name: string; url: string; attributeOptions: string[] }[];

  try {
    const { getDocs, query, collection } = await import("firebase/firestore");
    const templatesCollection = collection(
      firestore,
      `channels/${channelId}/products/${product.id}/templates`,
    ) as CollectionReference<ProductTemplate>;
    const templatesSnapshot = await getDocs(query(templatesCollection));

    const productTemplates = templatesSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    // Convert to expected format
    const templatePromises = productTemplates.map(
      async (template: ProductTemplate) => {
        try {
          let url: string;

          // Use stored download URL if available, otherwise fall back to fetching from Storage
          if (template.downloadUrl) {
            url = template.downloadUrl;
          } else {
            // Backward compatibility: fetch download URL from Storage
            const templateRef = ref(storage, template.filePath);
            url = await getDownloadURL(templateRef);
          }

          // Handle backward compatibility - convert old attributeIds to attributeOptions
          let attributeOptions = template.attributeOptions || [];

          return {
            name: template.fileName?.replace(/\.[^/.]+$/, "") || template.name,
            url: url,
            attributeOptions: attributeOptions,
          };
        } catch (error) {
          console.error(`Error fetching template ${template.fileName}:`, error);
          return null;
        }
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

    return templates;
  } catch (error) {
    console.error("Error fetching templates:", error);
    return undefined;
  }
}

async function getPromotions(product: Product) {
  try {
    const [{ get, db }, { getDoc }] = await Promise.all([
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
  } catch (error) {
    console.error("Error fetching promotions:", error);
    return [];
  }
}

type Params = Promise<{ id: string; lng: Locale }>;
type B2BProductResult = Awaited<ReturnType<typeof getProduct>>;

async function getCachedB2BProduct(
  channelId: string,
  slug: string,
  lng: Locale,
  defaultChannelId: string,
): Promise<B2BProductResult> {
  "use cache";
  cacheTag(
    `b2bProduct-${channelId}`,
    `b2bProduct-${channelId}-${slug}`,
    `b2bProduct-${channelId}-${slug}-${lng}`,
    `b2bProduct-${channelId}-${slug}-${lng}-${defaultChannelId}`,
  );
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  const result = await getProduct(channelId, slug, lng, defaultChannelId);
  return JSON.parse(JSON.stringify(result)) as B2BProductResult;
}

async function getCachedB2BProductsPageMetadata(
  lng: Locale,
  channelId: string,
): Promise<Metadata> {
  "use cache";
  cacheTag(
    `pageMetadata-${T_STORE_B2B_PRODUCTS}`,
    `pageMetadata-${T_STORE_B2B_PRODUCTS}-${lng}`,
    `pageMetadata-${T_STORE_B2B_PRODUCTS}-${channelId}`,
  );
  cacheLife("max");

  const { firebaseServerApp } = await getAppForServer();
  const firestore = getFirestore(firebaseServerApp);
  const metadataResult = await getPageMetadata(
    firestore,
    T_STORE_B2B_PRODUCTS,
    lng,
    channelId,
  );

  return formatMetadataResult(metadataResult);
}

export default async function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProductLoading />}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({ params }: { params: Params }) {
  const { id, lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  // B2B products: extract channelId from the id format "channelId--slug"
  // Example: "my-channel--my-product-slug"
  const parts = id.split("--");
  if (parts.length < 2) {
    return <div>Invalid B2B product URL format. Expected: channelId--slug</div>;
  }

  const channelId = parts[0];
  const slug = parts.slice(1).join("--");

  const {
    product,
    attributes,
    description,
    ratings,
    ratingsCount,
    expressSettings,
  } = await getCachedB2BProduct(channelId, slug, lng, runtimeConfig.channelId);

  if (!product) {
    return <div>Product not found</div>;
  }

  const [templates, promotions] = await Promise.all([
    getTemplates(product, channelId),
    getPromotions(product),
  ]);

  return (
    <>
      <ProductPage
        product={product ? JSON.parse(JSON.stringify(product)) : undefined}
        attributes={
          attributes ? JSON.parse(JSON.stringify(attributes)) : attributes
        }
        description={description ?? ""}
        templates={
          templates ? JSON.parse(JSON.stringify(templates)) : undefined
        }
        ratings={ratings}
        ratingsCount={ratingsCount || 0}
        promotions={
          promotions ? JSON.parse(JSON.stringify(promotions)) : undefined
        }
        expressSettings={
          expressSettings
            ? JSON.parse(JSON.stringify(expressSettings))
            : undefined
        }
        resolvedChannelId={channelId}
      />
      <Suspense>
        <RelatedProducts
          productId={product.id}
          productCategoryName={product.category.id}
          channelId={channelId}
          lng={lng}
        />
      </Suspense>
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  const parts = id.split("--");
  if (parts.length < 2) {
    return { title: "Product Not Found" };
  }

  const channelId = parts[0];
  const slug = parts.slice(1).join("--");

  const { product } = await getCachedB2BProduct(
    channelId,
    slug,
    lng,
    runtimeConfig?.channelId ?? channelId,
  );

  if (!product) {
    return getCachedB2BProductsPageMetadata(lng, channelId);
  }

  return {
    title: product.seo.title || product.name,
    description: product.seo.description,
    openGraph: {
      title: product.seo.title || product.name,
      description: product.seo.description || undefined,
      images:
        product.spec.images.length > 0 && runtimeConfig?.cdnUrl
          ? [
              {
                url:
                  buildRuntimeAssetUrl(
                    runtimeConfig.cdnUrl,
                    `channels/${channelId}/products/${product.id}/${product.spec.images[0]}`,
                  ) ?? "",
                width: 800,
                height: 600,
                alt: product.name,
              },
            ]
          : undefined,
    },
  };
}
