import {
  DynamicPricingConfig,
  Price,
  ProductPageCountPrice,
  ProductPrice,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { buildPageCountPriceDocumentId } from "@konfi/utils";
import {
  deleteDoc,
  doc,
  Firestore,
  getDoc as firestoreGetDoc,
  getDocs,
  orderBy,
  query,
  QueryConstraint,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { create, db, tenant, update } from "./firestore";

const PRODUCT_PRICES_SUBCOLLECTION = "prices";
const PRODUCT_PAGE_COUNT_STEP_PRICES_SUBCOLLECTION = "pageCountStepPrices";
const PRODUCT_PAGE_COUNT_PRICES_SUBCOLLECTION = "pageCountPrices";
const PRODUCT_PAGE_COUNT_SEGMENT_STEP_PRICES_SUBCOLLECTION =
  "pageCountSegmentStepPrices";
const PRODUCT_DYNAMIC_PRICING_SUBCOLLECTION = "dynamicPricing";
const PRODUCT_DYNAMIC_PRICING_DOCUMENT_ID = "config";

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const firebaseError = error as { code?: string; message?: string };

  return (
    firebaseError.code?.includes("permission-denied") === true ||
    firebaseError.message?.includes("Missing or insufficient permissions.") ===
      true
  );
}

function buildDisabledDynamicPricingConfig(
  config: DynamicPricingConfig,
): DynamicPricingConfig {
  return {
    ...config,
    attributeRules: config.attributeRules ?? [],
    basePrice: config.basePrice ?? 0,
    enabled: false,
    globalRules: config.globalRules ?? [],
    inputs: config.inputs ?? [],
    linkedPresetIds: config.linkedPresetIds ?? [],
  };
}

function getProductPricesCollectionPath(
  channelId: string,
  productId: string,
  subcollection: string,
): string {
  return `/channels/${channelId}/products/${productId}/${subcollection}`;
}

async function getProductPricesFromSubcollection(
  firestore: Firestore,
  channelId: string,
  productId: string,
  subcollection: string,
  constraints?: QueryConstraint[],
): Promise<ProductPrice[]> {
  try {
    const collectionRef = db.collection<ProductPrice>(
      firestore,
      getProductPricesCollectionPath(channelId, productId, subcollection),
    );
    const pricesQuery = query(
      collectionRef,
      ...(constraints || []),
      orderBy("id", "desc"),
    );
    const snapData = await getDocs(pricesQuery);
    return snapData.docs.map((item) => item.data() as ProductPrice);
  } catch (error) {
    console.error("Error fetching product prices:", error);
    return [];
  }
}

async function getProductPriceByCalculatedCombinationFromSubcollection(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
  subcollection: string,
): Promise<ProductPrice | undefined> {
  try {
    const docRef = db.doc<ProductPrice>(
      firestore,
      getProductPricesCollectionPath(channelId, productId, subcollection),
      calculatedCombination,
    );
    const docSnap = await firestoreGetDoc(docRef);
    return docSnap.exists() ? docSnap.data() : undefined;
  } catch (error) {
    console.error("Error fetching price by calculated combination:", error);
    return undefined;
  }
}

async function batchCreateProductPricesInSubcollection(
  firestore: Firestore,
  channelId: string,
  productId: string,
  subcollection: string,
  priceData: Array<{
    calculatedCombination: string;
    prices: Price[];
  }>,
  tenantContext?: TenantContext,
): Promise<boolean> {
  try {
    const collectionRef = db.collection(
      firestore,
      getProductPricesCollectionPath(channelId, productId, subcollection),
    );

    for (let i = 0; i < priceData.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      const batchData = priceData.slice(i, i + BATCH_SIZE);

      batchData.forEach(({ calculatedCombination, prices }) => {
        const docRef = doc(collectionRef, calculatedCombination);

        const productPrice: ProductPrice = {
          id: calculatedCombination,
          productId,
          channelId,
          prices,
        };
        batch.set(
          docRef,
          tenantContext
            ? tenant.withTenantId(
                productPrice,
                tenantContext,
                "product price batch create",
              )
            : productPrice,
        );
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error("Error batch creating prices:", error);
    return false;
  }
}

async function batchDeleteProductPricesInSubcollection(
  firestore: Firestore,
  channelId: string,
  productId: string,
  subcollection: string,
  calculatedCombinations: string[],
): Promise<boolean> {
  try {
    for (let i = 0; i < calculatedCombinations.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      const batchCombinations = calculatedCombinations.slice(i, i + BATCH_SIZE);

      batchCombinations.forEach((calculatedCombination) => {
        const docRef = db.doc<ProductPrice>(
          firestore,
          getProductPricesCollectionPath(channelId, productId, subcollection),
          calculatedCombination,
        );
        batch.delete(docRef);
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error("Error batch deleting prices:", error);
    return false;
  }
}

export async function getProductPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  constraints?: QueryConstraint[],
): Promise<ProductPrice[]> {
  return getProductPricesFromSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PRICES_SUBCOLLECTION,
    constraints,
  );
}

export async function getProductPageCountStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  constraints?: QueryConstraint[],
): Promise<ProductPrice[]> {
  return getProductPricesFromSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_STEP_PRICES_SUBCOLLECTION,
    constraints,
  );
}

export async function getProductPageCountPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  constraints?: QueryConstraint[],
): Promise<ProductPageCountPrice[]> {
  return (await getProductPricesFromSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_PRICES_SUBCOLLECTION,
    constraints,
  )) as ProductPageCountPrice[];
}

export async function getProductPageCountSegmentStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  constraints?: QueryConstraint[],
): Promise<ProductPageCountPrice[]> {
  return (await getProductPricesFromSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_SEGMENT_STEP_PRICES_SUBCOLLECTION,
    constraints,
  )) as ProductPageCountPrice[];
}

export async function getProductPriceByCalculatedCombination(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<ProductPrice | undefined> {
  return getProductPriceByCalculatedCombinationFromSubcollection(
    firestore,
    channelId,
    productId,
    calculatedCombination,
    PRODUCT_PRICES_SUBCOLLECTION,
  );
}

export async function getProductPageCountStepPriceByCalculatedCombination(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<ProductPrice | undefined> {
  return getProductPriceByCalculatedCombinationFromSubcollection(
    firestore,
    channelId,
    productId,
    calculatedCombination,
    PRODUCT_PAGE_COUNT_STEP_PRICES_SUBCOLLECTION,
  );
}

export async function getProductPageCountPriceByCalculatedCombination(
  firestore: Firestore,
  channelId: string,
  productId: string,
  pageCount: number,
  calculatedCombination: string,
): Promise<ProductPageCountPrice | undefined> {
  return (await getProductPriceByCalculatedCombinationFromSubcollection(
    firestore,
    channelId,
    productId,
    buildPageCountPriceDocumentId(pageCount, calculatedCombination),
    PRODUCT_PAGE_COUNT_PRICES_SUBCOLLECTION,
  )) as ProductPageCountPrice | undefined;
}

export async function getProductPageCountSegmentStepPriceByCalculatedCombination(
  firestore: Firestore,
  channelId: string,
  productId: string,
  pageCount: number,
  calculatedCombination: string,
): Promise<ProductPageCountPrice | undefined> {
  return (await getProductPriceByCalculatedCombinationFromSubcollection(
    firestore,
    channelId,
    productId,
    buildPageCountPriceDocumentId(pageCount, calculatedCombination),
    PRODUCT_PAGE_COUNT_SEGMENT_STEP_PRICES_SUBCOLLECTION,
  )) as ProductPageCountPrice | undefined;
}

export async function createProductPrice(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
  prices: Price[],
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<ProductPrice>(
      firestore,
      `/channels/${channelId}/products/${productId}/prices`,
      calculatedCombination,
    );

    const priceData: ProductPrice = {
      id: calculatedCombination,
      productId,
      channelId,
      prices,
    };
    await create(
      firestore,
      priceData,
      docRef,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    return calculatedCombination;
  } catch (error) {
    console.error("Error creating product price:", error);
    return undefined;
  }
}

const BATCH_SIZE = 400;

export async function batchCreateProductPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  priceData: Array<{
    calculatedCombination: string;
    prices: Price[];
  }>,
  tenantContext?: TenantContext,
): Promise<boolean> {
  return batchCreateProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PRICES_SUBCOLLECTION,
    priceData,
    tenantContext,
  );
}

export async function batchCreateProductPageCountStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  priceData: Array<{
    calculatedCombination: string;
    prices: Price[];
  }>,
  tenantContext?: TenantContext,
): Promise<boolean> {
  return batchCreateProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_STEP_PRICES_SUBCOLLECTION,
    priceData,
    tenantContext,
  );
}

export async function batchCreateProductPageCountPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  priceData: Array<{
    pageCount: number;
    calculatedCombination: string;
    prices: Price[];
  }>,
  tenantContext?: TenantContext,
): Promise<boolean> {
  try {
    const collectionRef = db.collection<ProductPageCountPrice>(
      firestore,
      getProductPricesCollectionPath(
        channelId,
        productId,
        PRODUCT_PAGE_COUNT_PRICES_SUBCOLLECTION,
      ),
    );

    for (let i = 0; i < priceData.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      const batchData = priceData.slice(i, i + BATCH_SIZE);

      batchData.forEach(({ pageCount, calculatedCombination, prices }) => {
        const id = buildPageCountPriceDocumentId(
          pageCount,
          calculatedCombination,
        );
        const docRef = doc(collectionRef, id);
        const productPrice: ProductPageCountPrice = {
          id,
          productId,
          channelId,
          pageCount,
          calculatedCombination,
          prices,
        };
        batch.set(
          docRef,
          tenantContext
            ? tenant.withTenantId(
                productPrice,
                tenantContext,
                "product page-count price batch create",
              )
            : productPrice,
        );
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error("Error batch creating page-count prices:", error);
    return false;
  }
}

export async function batchCreateProductPageCountSegmentStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  priceData: Array<{
    pageCount: number;
    calculatedCombination: string;
    prices: Price[];
  }>,
  tenantContext?: TenantContext,
): Promise<boolean> {
  try {
    const collectionRef = db.collection<ProductPageCountPrice>(
      firestore,
      getProductPricesCollectionPath(
        channelId,
        productId,
        PRODUCT_PAGE_COUNT_SEGMENT_STEP_PRICES_SUBCOLLECTION,
      ),
    );

    for (let i = 0; i < priceData.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      const batchData = priceData.slice(i, i + BATCH_SIZE);

      batchData.forEach(({ pageCount, calculatedCombination, prices }) => {
        const id = buildPageCountPriceDocumentId(
          pageCount,
          calculatedCombination,
        );
        const docRef = doc(collectionRef, id);
        const productPrice: ProductPageCountPrice = {
          id,
          productId,
          channelId,
          pageCount,
          calculatedCombination,
          prices,
        };
        batch.set(
          docRef,
          tenantContext
            ? tenant.withTenantId(
                productPrice,
                tenantContext,
                "product segmented page-count price batch create",
              )
            : productPrice,
        );
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error(
      "Error batch creating segmented page-count step prices:",
      error,
    );
    return false;
  }
}

export async function batchDeleteProductPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombinations: string[],
): Promise<boolean> {
  return batchDeleteProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PRICES_SUBCOLLECTION,
    calculatedCombinations,
  );
}

export async function batchDeleteProductPageCountStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombinations: string[],
): Promise<boolean> {
  return batchDeleteProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_STEP_PRICES_SUBCOLLECTION,
    calculatedCombinations,
  );
}

export async function batchDeleteProductPageCountPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  ids: string[],
): Promise<boolean> {
  return batchDeleteProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_PRICES_SUBCOLLECTION,
    ids,
  );
}

export async function batchDeleteProductPageCountSegmentStepPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
  ids: string[],
): Promise<boolean> {
  return batchDeleteProductPricesInSubcollection(
    firestore,
    channelId,
    productId,
    PRODUCT_PAGE_COUNT_SEGMENT_STEP_PRICES_SUBCOLLECTION,
    ids,
  );
}

export async function deleteAllProductPrices(
  firestore: Firestore,
  channelId: string,
  productId: string,
): Promise<boolean> {
  try {
    const prices = await getProductPrices(firestore, channelId, productId);

    // Process deletions in batches of 400
    for (let i = 0; i < prices.length; i += BATCH_SIZE) {
      const batch = writeBatch(firestore);
      const batchPrices = prices.slice(i, i + BATCH_SIZE);

      batchPrices.forEach((price) => {
        const docRef = db.doc<ProductPrice>(
          firestore,
          `/channels/${channelId}/products/${productId}/prices`,
          price.id,
        );
        batch.delete(docRef);
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error("Error deleting all prices:", error);
    return false;
  }
}

export async function getProductDynamicPricing(
  firestore: Firestore,
  channelId: string,
  productId: string,
): Promise<DynamicPricingConfig | undefined> {
  try {
    const docRef = db.doc<DynamicPricingConfig>(
      firestore,
      getProductPricesCollectionPath(
        channelId,
        productId,
        PRODUCT_DYNAMIC_PRICING_SUBCOLLECTION,
      ),
      PRODUCT_DYNAMIC_PRICING_DOCUMENT_ID,
    );
    const docSnap = await firestoreGetDoc(docRef);
    return docSnap.exists() ? docSnap.data() : undefined;
  } catch (error) {
    console.error("Error fetching product dynamic pricing:", error);
    return undefined;
  }
}

export async function upsertProductDynamicPricing(
  firestore: Firestore,
  channelId: string,
  productId: string,
  config: DynamicPricingConfig,
  tenantContext?: TenantContext,
): Promise<boolean> {
  try {
    const docRef = db.doc<DynamicPricingConfig>(
      firestore,
      getProductPricesCollectionPath(
        channelId,
        productId,
        PRODUCT_DYNAMIC_PRICING_SUBCOLLECTION,
      ),
      PRODUCT_DYNAMIC_PRICING_DOCUMENT_ID,
    );
    await setDoc(
      docRef,
      tenantContext
        ? tenant.withTenantId(
            config,
            tenantContext,
            "product dynamic pricing upsert",
          )
        : config,
      { merge: true },
    );
    return true;
  } catch (error) {
    console.error("Error saving product dynamic pricing:", error);
    return false;
  }
}

export async function deleteProductDynamicPricing(
  firestore: Firestore,
  channelId: string,
  productId: string,
  tenantContext?: TenantContext,
): Promise<boolean> {
  const docRef = db.doc<DynamicPricingConfig>(
    firestore,
    getProductPricesCollectionPath(
      channelId,
      productId,
      PRODUCT_DYNAMIC_PRICING_SUBCOLLECTION,
    ),
    PRODUCT_DYNAMIC_PRICING_DOCUMENT_ID,
  );

  try {
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      try {
        const existingConfig = await firestoreGetDoc(docRef);

        if (!existingConfig.exists()) {
          return true;
        }

        await setDoc(
          docRef,
          tenantContext
            ? tenant.withTenantId(
                buildDisabledDynamicPricingConfig(existingConfig.data()),
                tenantContext,
                "product dynamic pricing disable",
              )
            : buildDisabledDynamicPricingConfig(existingConfig.data()),
        );
        return true;
      } catch (fallbackError) {
        console.error(
          "Error disabling product dynamic pricing after delete was denied:",
          fallbackError,
        );
      }
    }

    console.error("Error deleting product dynamic pricing:", error);
    return false;
  }
}

export async function deleteProductPrice(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<boolean> {
  try {
    const docRef = db.doc<ProductPrice>(
      firestore,
      `/channels/${channelId}/products/${productId}/prices`,
      calculatedCombination,
    );
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting product price:", error);
    return false;
  }
}

export async function updateProductPrice(
  firestore: Firestore,
  channelId: string,
  productId: string,
  calculatedCombination: string,
  updates: Partial<ProductPrice>,
): Promise<void> {
  try {
    const docRef = db.doc<ProductPrice>(
      firestore,
      `/channels/${channelId}/products/${productId}/prices`,
      calculatedCombination,
    );
    await update({ ...updates }, docRef);
  } catch (error) {
    console.error("Error updating product price:", error);
    throw error;
  }
}
