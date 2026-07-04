import {
  getAdminDb,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import {
  CardProduct,
  Category,
  CategoryTranslation,
  CurrencyEnum,
  Locale,
  NavigationProductsMenuPayload,
  NavigationProductsMenuProduct,
  Product,
  ProductTranslation,
  type CategorizedCardProducts,
} from "@konfi/types";
import {
  formatPrice,
  getProductListingPrices,
  isPurchasable,
  isWithinLastMonth,
} from "@konfi/utils";
import { orderBy } from "es-toolkit";
import { cacheLife, cacheTag } from "next/cache";
import { buildNavigationProductsMenuCategories } from "./navigation-products-menu";

export async function getCategorizedCardProducts(
  lng: Locale,
  channelId: string,
) {
  "use cache";
  cacheTag("categorizedCardProducts", lng, channelId);
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return {};
  }

  try {
    const firestore = getAdminDb();

    const [productsSnapshot, categoriesSnapshot] = await Promise.all([
      firestore
        .collection(`channels/${channelId}/products`)
        .where("active", "==", true)
        .where("availability.published", "==", true)
        .limit(99)
        .get(),
      firestore.collection(`channels/${channelId}/categories`).limit(99).get(),
    ]);

    const products = productsSnapshot.docs.map((doc) => doc.data() as Product);
    const dbCategories = categoriesSnapshot.docs.map(
      (doc) => doc.data() as Category,
    );
    const purchasableProducts = products.filter(isPurchasable);
    const categoryMap = new Map(dbCategories.map((cat) => [cat.name, cat.id]));

    const [productTranslations, categoryTranslations] = await Promise.all([
      Promise.all(
        purchasableProducts.map((product) =>
          firestore
            .doc(
              `channels/${channelId}/products/${product.id}/translations/${lng}`,
            )
            .get()
            .then((snapshot) => ({
              productId: product.id,
              translation: snapshot.exists
                ? (snapshot.data() as ProductTranslation)
                : undefined,
            })),
        ),
      ),
      Promise.all(
        Array.from(categoryMap.entries()).map(([name, id]) =>
          firestore
            .doc(`channels/${channelId}/categories/${id}/translations/${lng}`)
            .get()
            .then((snapshot) => ({
              name,
              translation: snapshot.exists
                ? (snapshot.data() as CategoryTranslation)
                : undefined,
            })),
        ),
      ),
    ]);

    const productTranslationMap = new Map(
      productTranslations.map(({ productId, translation }) => [
        productId,
        translation,
      ]),
    );
    const categoryTranslationMap = new Map(
      categoryTranslations.map(({ name, translation }) => [name, translation]),
    );
    const categorizedCardProducts: CategorizedCardProducts = {};

    for (const product of purchasableProducts) {
      const productTranslation = productTranslationMap.get(product.id);
      const categoryTranslation = categoryTranslationMap.get(
        product.category.name,
      );
      const translatedProduct: Product = {
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
      const effectivePrices = getProductListingPrices(translatedProduct);
      const category = translatedProduct.category.name;
      const cardProduct: CardProduct = {
        id: translatedProduct.id,
        slug: translatedProduct.seo.slug,
        name: translatedProduct.name,
        images: translatedProduct.spec.images,
        isNew: isWithinLastMonth(
          translatedProduct.availability.publication?.toDate(),
        ),
        categoryName: category,
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
          unit: translatedProduct.prefferedUnit,
        },
      };

      const categoryProducts = categorizedCardProducts[category] ?? [];
      categoryProducts.push(cardProduct);
      categorizedCardProducts[category] = categoryProducts;
    }

    for (const category in categorizedCardProducts) {
      categorizedCardProducts[category] = orderBy(
        categorizedCardProducts[category],
        ["name"],
        ["asc"],
      );
    }

    return categorizedCardProducts;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function getNavigationProductsMenu(
  lng: Locale,
  channelId: string,
): Promise<NavigationProductsMenuPayload | undefined> {
  "use cache";
  cacheTag("categorizedCardProducts", lng, channelId);
  cacheLife({ stale: 86400, revalidate: 86400, expire: 604800 });

  if (shouldSkipStaticDataDuringCiBuild()) {
    return { categories: [] };
  }

  try {
    const firestore = getAdminDb();

    const [productsSnapshot, categoriesSnapshot] = await Promise.all([
      firestore
        .collection(`channels/${channelId}/products`)
        .where("active", "==", true)
        .where("availability.published", "==", true)
        .limit(99)
        .get(),
      firestore.collection(`channels/${channelId}/categories`).limit(99).get(),
    ]);

    const products = productsSnapshot.docs.map((doc) => doc.data() as Product);
    const dbCategories = categoriesSnapshot.docs.map(
      (doc) => doc.data() as Category,
    );
    const purchasableProducts = products.filter(isPurchasable);
    const categoriesById = new Map(
      dbCategories.map((category) => [category.id, category]),
    );
    const categoriesByName = new Map(
      dbCategories.map((category) => [category.name, category]),
    );

    const [productTranslations, categoryTranslations] = await Promise.all([
      Promise.all(
        purchasableProducts.map((product) =>
          firestore
            .doc(
              `channels/${channelId}/products/${product.id}/translations/${lng}`,
            )
            .get()
            .then((snapshot) => ({
              productId: product.id,
              translation: snapshot.exists
                ? (snapshot.data() as ProductTranslation)
                : undefined,
            })),
        ),
      ),
      Promise.all(
        dbCategories.map((category) =>
          firestore
            .doc(
              `channels/${channelId}/categories/${category.id}/translations/${lng}`,
            )
            .get()
            .then((snapshot) => ({
              categoryId: category.id,
              translation: snapshot.exists
                ? (snapshot.data() as CategoryTranslation)
                : undefined,
            })),
        ),
      ),
    ]);

    const productTranslationMap = new Map(
      productTranslations.map(({ productId, translation }) => [
        productId,
        translation,
      ]),
    );
    const categoryTranslationMap = new Map(
      categoryTranslations.map(({ categoryId, translation }) => [
        categoryId,
        translation,
      ]),
    );
    const translatedCategories = dbCategories.map((category) => ({
      ...category,
      name: categoryTranslationMap.get(category.id)?.name || category.name,
      path: category.path?.map((segment) => ({
        ...segment,
        name:
          categoryTranslationMap.get(segment.id)?.name ||
          categoriesById.get(segment.id)?.name ||
          segment.name,
      })),
    }));

    const cardProducts: NavigationProductsMenuProduct[] = [];

    for (const product of purchasableProducts) {
      const productCategory =
        categoriesById.get(product.category.id) ??
        categoriesByName.get(product.category.name);
      const categoryTranslation = productCategory
        ? categoryTranslationMap.get(productCategory.id)
        : undefined;
      const productTranslation = productTranslationMap.get(product.id);
      const translatedProduct: Product = {
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
          id: productCategory?.id ?? product.category.id,
          name: categoryTranslation?.name || product.category.name,
          parentId: productCategory?.parentId ?? product.category.parentId,
          path: productCategory?.path ?? product.category.path,
        },
      };
      const effectivePrices = getProductListingPrices(translatedProduct);

      cardProducts.push({
        categoryId: translatedProduct.category.id,
        categoryName: translatedProduct.category.name,
        id: translatedProduct.id,
        images: translatedProduct.spec.images,
        isNew: isWithinLastMonth(
          translatedProduct.availability.publication?.toDate(),
        ),
        name: translatedProduct.name,
        slug: translatedProduct.seo.slug,
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
          unit: translatedProduct.prefferedUnit,
        },
      });
    }

    return {
      categories: buildNavigationProductsMenuCategories({
        categories: translatedCategories,
        products: cardProducts,
      }),
    };
  } catch (error) {
    console.error(error);
    return undefined;
  }
}
