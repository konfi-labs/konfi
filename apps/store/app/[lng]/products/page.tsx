import {
  fetchMetadata,
  getAdminDb,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { getCategorizedCardProducts } from "@/lib/products/categorized-card-products";
import { buildAlternates } from "@/lib/seo";
import {
  DEFAULT_LOCALE,
  Locale,
  Promotion,
  PromotionRuleAttributeEnum,
} from "@konfi/types";
import { T_STORE_PRODUCTS } from "@konfi/utils";
import { filter } from "es-toolkit/compat";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ProductsLoading from "./loading";
import ProductsPage from "./products-page";

async function getCampaignProductIds(campaignId?: string) {
  try {
    if (campaignId) {
      const promotionsSnapshot = await getAdminDb()
        .collection("promotions")
        .where("campaignId", "==", campaignId)
        .where("active", "==", true)
        .limit(1)
        .get();
      const promotion = promotionsSnapshot.docs[0]?.data() as
        | Promotion
        | undefined;
      if (promotion) {
        if (promotion.rules) {
          const promotionProductsRule = promotion.rules.find(
            (rule) => rule.attribute === PromotionRuleAttributeEnum.PRODUCT,
          );
          if (promotionProductsRule) {
            const productIds = promotionProductsRule.values;
            if (productIds) {
              return productIds;
            }
          }
        }
      }
      return [];
    }
  } catch (error) {
    console.error(error);
    return [];
  }
}

type Params = Promise<{ lng: Locale }>;
type ProductSearchParams = {
  campaignId?: string | string[];
  category?: string | string[];
  isNew?: string | string[];
  price?: string | string[];
};
type SearchParams = Promise<ProductSearchParams>;

function readFirstSearchParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed || undefined;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ProductsLoading />}>
      <ProductsPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductsPageContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  // Await dynamic data OUTSIDE cache scope
  const { lng } = await params;
  const resolvedSearchParams = await searchParams;
  const campaignId = readFirstSearchParam(resolvedSearchParams.campaignId);
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  return (
    <CachedPageContent
      lng={lng}
      campaignId={campaignId}
      channelId={runtimeConfig.channelId}
    />
  );
}

async function CachedPageContent({
  lng,
  campaignId,
  channelId,
}: {
  lng: Locale;
  campaignId?: string;
  channelId: string;
}) {
  const categorizedCardProducts = await getCategorizedCardProducts(
    lng,
    channelId,
  );

  if (campaignId) {
    const campaignProductIds = await getCampaignProductIds(campaignId);
    if (campaignProductIds) {
      for (const category in categorizedCardProducts) {
        categorizedCardProducts[category] = filter(
          categorizedCardProducts[category],
          (product) => campaignProductIds.includes(product.id),
        );
      }
      // delete all categories and set one thats called "Promojce"
      const promoProducts = [];
      for (const category in categorizedCardProducts) {
        promoProducts.push(...categorizedCardProducts[category]);
      }
      if (categorizedCardProducts)
        categorizedCardProducts["Produkty w promocji"] = promoProducts;
      for (const category in categorizedCardProducts) {
        if (category !== "Produkty w promocji") {
          delete categorizedCardProducts[category];
        }
      }
    }
  }

  return (
    <ProductsPage
      categorizedCardProducts={categorizedCardProducts}
      lng={lng || DEFAULT_LOCALE}
    />
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ lng }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const metadata = await fetchMetadata(T_STORE_PRODUCTS, lng);

  return {
    ...metadata,
    alternates: buildAlternates({
      pathname: `/${lng}/products`,
      searchParams: resolvedSearchParams,
    }),
  };
}
