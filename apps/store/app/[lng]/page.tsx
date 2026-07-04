import { getCampaignsAdPayload } from "@/components/promotions/CampaignsAd";
import {
  fetchMetadata,
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  shouldSilentlyFallbackFromOptionalStaticDataError,
  shouldDeferStorefrontDataDuringProductionBuild,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { getStoredGoogleReviews } from "@/lib/google/review-snapshots";
import {
  getCachedStorefrontHomePage,
  getCachedStorefrontSharing,
  getCachedStorefrontTheme,
  getStorefrontEditorDraftContent,
} from "@/lib/storefront-editor/content";
import { getStorefrontEditorSessionForRequest } from "@/lib/storefront-editor/session";
import { GoogleReview, getPopularProductsIds } from "@konfi/google";
import {
  CardProduct,
  Category,
  CategoryTranslation,
  CurrencyEnum,
  HeroCard,
  Hero as HeroType,
  Locale,
  Product,
  ProductTranslation,
} from "@konfi/types";
import {
  formatPrice,
  getProductListingPrices,
  isPurchasable,
  isWithinLastMonth,
  T_STORE_HOME,
} from "@konfi/utils";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import HomePage from "./home-page";

function logOptionalHomepageDataError(message: string, error: unknown) {
  if (!shouldSilentlyFallbackFromOptionalStaticDataError(error)) {
    console.error(message, error);
  }
}

async function getProductTranslationForLocale(
  channelId: string,
  productId: string,
  lng: Locale,
): Promise<ProductTranslation | undefined> {
  const snapshot = await getAdminDb()
    .doc(`channels/${channelId}/products/${productId}/translations/${lng}`)
    .get();

  return snapshot.exists ? (snapshot.data() as ProductTranslation) : undefined;
}

async function getCategoryTranslationForLocale(
  channelId: string,
  categoryId: string,
  lng: Locale,
): Promise<CategoryTranslation | undefined> {
  if (!categoryId) {
    return undefined;
  }

  const snapshot = await getAdminDb()
    .doc(`channels/${channelId}/categories/${categoryId}/translations/${lng}`)
    .get();

  return snapshot.exists ? (snapshot.data() as CategoryTranslation) : undefined;
}

async function getChannelCategories(channelId: string): Promise<Category[]> {
  const snapshot = await getAdminDb()
    .collection(`channels/${channelId}/categories`)
    .limit(99)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Category);
}

function toCardProducts(products: Product[], lng: Locale): CardProduct[] {
  return products
    .filter((product) => isPurchasable(product))
    .map((product) => {
      const effectivePrices = getProductListingPrices(product);

      return {
        id: product.id,
        slug: product.seo.slug,
        name: product.name,
        images: product.spec.images,
        isNew: isWithinLastMonth(product.availability.publication?.toDate()),
        categoryName: product.category.name,
        startingFrom: {
          formattedPrice:
            effectivePrices.lowPrice.value && effectivePrices.lowPrice.volume
              ? formatPrice(
                  effectivePrices.lowPrice.value,
                  CurrencyEnum.PLN,
                  effectivePrices.lowPrice.volume.value,
                  undefined,
                  lng,
                )
              : "",
          unit: product.prefferedUnit,
        },
      };
    });
}

async function applyProductListingTranslations(
  products: Product[],
  categories: Category[],
  lng: Locale,
  channelId: string,
): Promise<Product[]> {
  const categoryByName = new Map(
    categories.map((category) => [category.name, category]),
  );
  const translatedCategoryNames = Array.from(
    new Set(products.map((product) => product.category.name)),
  );

  const [productTranslations, categoryTranslations] = await Promise.all([
    Promise.all(
      products.map((product) =>
        getProductTranslationForLocale(channelId, product.id, lng).then(
          (translation) => ({
            productId: product.id,
            translation,
          }),
        ),
      ),
    ),
    Promise.all(
      translatedCategoryNames.map((categoryName) => {
        const categoryId = categoryByName.get(categoryName)?.id;

        if (!categoryId) {
          return Promise.resolve({
            categoryName,
            translation: undefined,
          });
        }

        return getCategoryTranslationForLocale(channelId, categoryId, lng).then(
          (translation) => ({
            categoryName,
            translation,
          }),
        );
      }),
    ),
  ]);

  const productTranslationById = new Map(
    productTranslations.map(({ productId, translation }) => [
      productId,
      translation,
    ]),
  );
  const categoryTranslationByName = new Map(
    categoryTranslations.map(({ categoryName, translation }) => [
      categoryName,
      translation,
    ]),
  );

  return products.map((product) => {
    const productTranslation = productTranslationById.get(product.id);
    const categoryTranslation = categoryTranslationByName.get(
      product.category.name,
    );

    return {
      ...product,
      name: productTranslation?.name || product.name,
      description: productTranslation?.description || product.description,
      seo: productTranslation?.seo
        ? {
            ...product.seo,
            title: productTranslation.seo.title || product.seo.title,
            description:
              productTranslation.seo.description || product.seo.description,
          }
        : product.seo,
      category: {
        ...product.category,
        name: categoryTranslation?.name || product.category.name,
      },
    };
  });
}

async function getCachedHeroCards(lng: Locale, channelId: string) {
  "use cache";
  cacheTag("heroCards", lng, channelId);
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return [];
  }

  const [heroResult, heroTranslationResult] = await Promise.all([
    getAdminDb().doc(`channels/${channelId}/cms/hero`).get(),
    getAdminDb()
      .doc(`channels/${channelId}/cms/hero/translations/${lng}`)
      .get(),
  ]);

  const heroCards: HeroCard[] = (
    (heroResult.data() as HeroType | undefined)?.cards ?? []
  ).map((card) => ({
    ...card,
  }));
  if (heroTranslationResult.exists) {
    const heroTranslations = heroTranslationResult.data()?.cards ?? [];
    let index = 0;
    for (const card of heroCards) {
      const translation = heroTranslations[index];
      if (translation) {
        card.title = translation.title || card.title;
        card.subtitle = translation.subtitle || card.subtitle;
        card.buttonUrl = translation.buttonUrl || card.buttonUrl;
        card.buttonLabel = translation.buttonLabel || card.buttonLabel;
      }
      index++;
    }
  }

  return heroCards.filter((card) => card.active);
}

async function getHeroCards(lng: Locale, channelId: string) {
  try {
    return await getCachedHeroCards(lng, channelId);
  } catch (error) {
    logOptionalHomepageDataError("Error loading homepage hero cards:", error);
    return [];
  }
}

async function getFeaturedProductCards(lng: Locale, channelId: string) {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return undefined;
  }

  await connection();

  const featuredSnapshot = await getAdminDb()
    .collection(`channels/${channelId}/products`)
    .where("recommended", "==", true)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .limit(9)
    .get();
  const featuredProducts = featuredSnapshot.docs.map(
    (doc) => doc.data() as Product,
  );

  if (featuredProducts.length === 0) {
    return undefined;
  }

  const translatedProducts = await applyProductListingTranslations(
    featuredProducts,
    await getChannelCategories(channelId),
    lng,
    channelId,
  );

  return toCardProducts(translatedProducts, lng);
}

async function getFeaturedProducts(lng: Locale, channelId: string) {
  try {
    return await getFeaturedProductCards(lng, channelId);
  } catch (error) {
    logOptionalHomepageDataError(
      "Error loading homepage featured products:",
      error,
    );
    return undefined;
  }
}

async function getPopularProductCards(lng: Locale, channelId: string) {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return undefined;
  }

  await connection();

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return undefined;
  }

  const analyticsDataClient = (await import("@/lib/google/serverApp"))
    .analyticsDataClient;
  const propertyId = (await import("@/lib/google/serverApp")).propertyId;
  if (!analyticsDataClient || !propertyId) {
    return undefined;
  }
  const popularProductsIds = await getPopularProductsIds({
    analyticsDataClient,
    propertyId,
  });

  let popularProducts: Product[] | undefined;

  if (popularProductsIds?.length) {
    const popularSnapshot = await getAdminDb()
      .collection(`channels/${channelId}/products`)
      .where("id", "in", popularProductsIds.slice(0, 30))
      .where("active", "==", true)
      .where("availability.published", "==", true)
      .limit(4)
      .get();

    popularProducts = popularSnapshot.docs.map((doc) => doc.data() as Product);
  }

  if (!popularProducts || popularProducts.length < 4) return undefined;

  const translatedProducts = await applyProductListingTranslations(
    popularProducts,
    await getChannelCategories(channelId),
    lng,
    channelId,
  );

  return toCardProducts(translatedProducts, lng);
}

async function getPopularProducts(lng: Locale, channelId: string) {
  try {
    return await getPopularProductCards(lng, channelId);
  } catch (error) {
    logOptionalHomepageDataError("Error loading popular products:", error);
    return undefined;
  }
}

async function getCachedGoogleReviews(
  lng: Locale,
  channelId: string,
): Promise<GoogleReview[]> {
  "use cache";
  cacheTag("googleReviews", lng, channelId);
  cacheLife("max");

  if (shouldSkipStaticDataDuringCiBuild()) {
    return [];
  }

  return await getStoredGoogleReviews(lng, channelId);
}

async function getGoogleReviews(
  lng: Locale,
  channelId: string,
): Promise<GoogleReview[]> {
  try {
    return await getCachedGoogleReviews(lng, channelId);
  } catch (error) {
    logOptionalHomepageDataError("Error loading Google reviews:", error);
    return [];
  }
}

type HomePageData = {
  campaignsAd?: string;
  featuredProducts?: CardProduct[];
  googleReviews: GoogleReview[];
  heroCards: HeroCard[];
  homePage: Awaited<ReturnType<typeof getCachedStorefrontHomePage>> | undefined;
  popularProducts?: CardProduct[];
  storefrontSharing:
    | Awaited<ReturnType<typeof getCachedStorefrontSharing>>
    | undefined;
  storefrontTheme:
    | Awaited<ReturnType<typeof getCachedStorefrontTheme>>
    | undefined;
};

function renderHomePage(params: {
  data: HomePageData;
  editor?: {
    adminCmsUrl?: string;
    draftContent?: Awaited<ReturnType<typeof getStorefrontEditorDraftContent>>;
    expiresAt?: number;
  };
  lng: Locale;
  maintenance: NonNullable<
    Awaited<ReturnType<typeof getStoreRuntimeConfigForRequest>>
  >["maintenance"];
}) {
  const { data, editor, lng, maintenance } = params;

  return (
    <HomePage
      adminCmsUrl={editor?.adminCmsUrl}
      featuredProducts={
        !data.featuredProducts
          ? undefined
          : JSON.parse(JSON.stringify(data.featuredProducts))
      }
      popularProducts={
        !data.popularProducts
          ? undefined
          : JSON.parse(JSON.stringify(data.popularProducts))
      }
      heroCards={data.heroCards}
      campaignsAd={data.campaignsAd}
      editorEnabled={Boolean(editor)}
      editorSessionExpiresAt={editor?.expiresAt}
      googleReviews={data.googleReviews}
      homePage={editor?.draftContent?.homePage ?? data.homePage}
      lng={lng}
      maintenance={maintenance}
      storefrontSharing={
        editor?.draftContent?.sharing ?? data.storefrontSharing
      }
      storefrontTheme={editor?.draftContent?.theme ?? data.storefrontTheme}
    />
  );
}

async function StorefrontEditorHomePage({
  data,
  lng,
  runtimeConfig,
}: {
  data: HomePageData;
  lng: Locale;
  runtimeConfig: NonNullable<
    Awaited<ReturnType<typeof getStoreRuntimeConfigForRequest>>
  >;
}) {
  const editorSession = await getStorefrontEditorSessionForRequest(
    runtimeConfig,
  ).catch((error) => {
    console.error(error);
    return null;
  });

  const editorDraftContent = editorSession
    ? await getStorefrontEditorDraftContent(runtimeConfig.channelId).catch(
        (error) => {
          logOptionalHomepageDataError(
            "Error loading storefront editor draft content:",
            error,
          );
          return undefined;
        },
      )
    : undefined;

  const adminCmsUrl =
    editorSession && runtimeConfig.adminBaseUrl
      ? `${runtimeConfig.adminBaseUrl}/${lng}/configuration/cms`
      : undefined;

  return renderHomePage({
    data,
    editor: editorSession
      ? {
          adminCmsUrl,
          draftContent: editorDraftContent,
          expiresAt: editorSession.expiresAt,
        }
      : undefined,
    lng,
    maintenance: runtimeConfig.maintenance,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ lng: Locale }>;
}) {
  if (shouldDeferStorefrontDataDuringProductionBuild()) {
    await connection();
  }

  const { lng } = await params;
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  const [
    heroCards,
    featuredProducts,
    popularProducts,
    campaignsAd,
    googleReviews,
    homePage,
    storefrontTheme,
    storefrontSharing,
  ] = await Promise.all([
    getHeroCards(lng, runtimeConfig.channelId),
    getFeaturedProducts(lng, runtimeConfig.channelId),
    getPopularProducts(lng, runtimeConfig.channelId),
    getCampaignsAdPayload().catch((error) => {
      logOptionalHomepageDataError("Error loading campaigns ad:", error);
      return undefined;
    }),
    getGoogleReviews(lng, runtimeConfig.channelId),
    getCachedStorefrontHomePage(runtimeConfig.channelId).catch((error) => {
      logOptionalHomepageDataError(
        "Error loading storefront homepage content:",
        error,
      );
      return undefined;
    }),
    getCachedStorefrontTheme(runtimeConfig.channelId).catch((error) => {
      logOptionalHomepageDataError("Error loading storefront theme:", error);
      return undefined;
    }),
    getCachedStorefrontSharing(runtimeConfig.channelId).catch((error) => {
      logOptionalHomepageDataError("Error loading storefront sharing:", error);
      return undefined;
    }),
  ]);

  const data: HomePageData = {
    campaignsAd,
    featuredProducts,
    googleReviews,
    heroCards,
    homePage,
    popularProducts,
    storefrontSharing,
    storefrontTheme,
  };

  return (
    <Suspense fallback={null}>
      <StorefrontEditorHomePage
        data={data}
        lng={lng}
        runtimeConfig={runtimeConfig}
      />
    </Suspense>
  );
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  if (shouldDeferStorefrontDataDuringProductionBuild()) {
    await connection();
  }

  const { lng } = await params;
  return await fetchMetadata(T_STORE_HOME, lng);
}
