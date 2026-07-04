import { analytics } from "@/lib/firebase/clientApp";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  CardProduct,
  Category,
  CategoryTranslation,
  CurrencyEnum,
  Locale,
  Product,
  ProductTranslation,
} from "@konfi/types";
import {
  formatPrice,
  getProductListingPrices,
  isPurchasable,
  isWithinLastMonth,
} from "@konfi/utils";
import { ProductRecommendations } from "./Recommendations";

async function getProductTranslation(
  channelId: string,
  productId: string,
  lng: Locale,
) {
  const snapshot = await getAdminDb()
    .doc(`channels/${channelId}/products/${productId}/translations/${lng}`)
    .get();

  return snapshot.exists ? (snapshot.data() as ProductTranslation) : undefined;
}

async function getCategoryTranslation(
  channelId: string,
  categoryId: string | undefined,
  lng: Locale,
) {
  if (!categoryId) {
    return undefined;
  }

  const snapshot = await getAdminDb()
    .doc(`channels/${channelId}/categories/${categoryId}/translations/${lng}`)
    .get();

  return snapshot.exists ? (snapshot.data() as CategoryTranslation) : undefined;
}

function toRecommendationCard(product: Product, lng: Locale): CardProduct {
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
}

async function applyTranslations(
  product: Product,
  lng: Locale,
  channelId: string,
  categoryId: string | undefined,
) {
  const productTranslation = await getProductTranslation(
    channelId,
    product.id,
    lng,
  );

  if (productTranslation) {
    product.name = productTranslation.name || product.name;
    product.description = productTranslation.description || product.description;
    if (productTranslation.seo) {
      product.seo = {
        ...product.seo,
        title: productTranslation.seo.title || product.seo.title,
        description:
          productTranslation.seo.description || product.seo.description,
      };
    }
    product.specialNotes =
      productTranslation.specialNotes || product.specialNotes;
  }

  const categoryTranslation = await getCategoryTranslation(
    channelId,
    categoryId,
    lng,
  );

  if (categoryTranslation) {
    product.category.name = categoryTranslation.name || product.category.name;
  }
}

async function getRelatedProducts(
  productId: string,
  productCategoryName: string,
  lng: Locale,
  channelId: string,
): Promise<CardProduct[] | undefined> {
  try {
    const firestore = getAdminDb();
    const [recommendationSnapshot, categoriesSnapshot] = await Promise.all([
      firestore
        .collection(`channels/${channelId}/products`)
        .where("active", "==", true)
        .where("availability.published", "==", true)
        .where("category.name", "==", productCategoryName)
        .limit(4)
        .get(),
      firestore.collection(`channels/${channelId}/categories`).limit(99).get(),
    ]);
    const dbCategories = categoriesSnapshot.docs.map(
      (doc) => doc.data() as Category,
    );
    const categoryId = dbCategories.find(
      (cat) => cat.name === productCategoryName,
    )?.id;
    const recommendedProducts = recommendationSnapshot.docs
      .map((doc) => doc.data() as Product)
      .filter((product) => product.id !== productId && isPurchasable(product));
    const recommendations: CardProduct[] = [];

    for (const recommendedProduct of recommendedProducts) {
      await applyTranslations(recommendedProduct, lng, channelId, categoryId);
      recommendations.push(toRecommendationCard(recommendedProduct, lng));
    }

    if (recommendations.length < 4) {
      const additionalRecommendationSnapshot = await firestore
        .collection(`channels/${channelId}/products`)
        .where("active", "==", true)
        .where("availability.published", "==", true)
        .where("id", "!=", productId)
        .limit(4 - recommendations.length)
        .get();
      const additionalProducts = additionalRecommendationSnapshot.docs
        .map((doc) => doc.data() as Product)
        .filter(
          (product) => product.id !== productId && isPurchasable(product),
        );

      for (const additionalProduct of additionalProducts) {
        await applyTranslations(additionalProduct, lng, channelId, categoryId);
        recommendations.push(toRecommendationCard(additionalProduct, lng));
      }
    }

    return recommendations;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function RelatedProducts({
  productId,
  productCategoryName,
  channelId,
  lng,
}: {
  productId?: string;
  productCategoryName?: string;
  channelId?: string;
  lng: Locale;
}) {
  if (!productId || !productCategoryName || !channelId) return null;

  const relatedProducts = await getRelatedProducts(
    productId,
    productCategoryName,
    lng,
    channelId,
  );

  if (!relatedProducts?.length) return null;

  return (
    <ProductRecommendations
      products={relatedProducts}
      analytics={analytics}
      lng={lng}
    />
  );
}
