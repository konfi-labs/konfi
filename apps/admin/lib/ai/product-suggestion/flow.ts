import "server-only";

import {
  Attribute,
  Discount,
  DynamicPricingConfig,
  DynamicPricingPreset,
  FormattedOrderItem,
  Price,
  PriceTypeEnum,
  Product,
  ProductPrice,
} from "@konfi/types";
import {
  areAllDependencyRulesMet,
  calcPrice,
  DEFAULT_COMBINATION,
  getDescriptiveCombination,
  getRandomId,
  normalizeAttributeDependency,
} from "@konfi/utils";
import { resolveQuotePricingQuantities } from "@/lib/ai/quote-pricing";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { getAdminDb } from "@/lib/firebase/serverApp";

import {
  ProductsSuggestionInput,
  ParsedProductQuestion,
} from "@/lib/ai/product-suggestion/types";
import {
  splitQuestionByProducts,
  suggestCalculatedCombination,
  suggestProductRequestDetails,
} from "@/lib/ai/product-suggestion/ai-functions";
import {
  getPrimaryCustomSize,
  normalizeSuggestedCustomSizes,
} from "@/lib/ai/product-suggestion/custom-sizes";
import {
  selectBestProductSuggestionCandidate,
  type ProductSuggestionCandidate,
} from "@/lib/ai/product-suggestion/candidate-selection";
import { resolveDynamicProductSuggestionPrices } from "@/lib/ai/product-suggestion/pricing";

// Constants
const CONCURRENCY_LIMIT = 3;
const FIRESTORE_IN_QUERY_LIMIT = 10;

// Helper to get Firestore instance
function getDb() {
  return getAdminDb();
}

// Helper to chunk arrays
function chunkArray<T>(input: T[], size: number): T[][] {
  if (size <= 0) {
    return [input];
  }
  const result: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    result.push(input.slice(i, i + size));
  }
  return result;
}

// Run operations with concurrency limit
async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = CONCURRENCY_LIMIT,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = [];
  results.length = items.length;
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) {
      return;
    }
    results[currentIndex] = await worker(items[currentIndex], currentIndex);
    await runNext();
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}

function sumCustomSizeQuantities(
  customSizes: readonly { quantity: number }[],
): number {
  return customSizes.reduce((total, size) => {
    const quantity = Number(size.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? total + quantity : total;
  }, 0);
}

// Fetch prices from subcollection
async function fetchPricesFromSubcollection(
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<Price[] | undefined> {
  try {
    const db = getDb();

    // Try to get the specific combination first
    const priceDocRef = db
      .collection(`channels/${channelId}/products/${productId}/prices`)
      .doc(calculatedCombination);

    const priceDoc = await priceDocRef.get();

    if (priceDoc.exists) {
      const data = priceDoc.data() as ProductPrice;
      return data.prices;
    }

    // If specific combination not found, try default
    const defaultPriceDocRef = db
      .collection(`channels/${channelId}/products/${productId}/prices`)
      .doc(DEFAULT_COMBINATION);

    const defaultPriceDoc = await defaultPriceDocRef.get();

    if (defaultPriceDoc.exists) {
      const data = defaultPriceDoc.data() as ProductPrice;
      return data.prices;
    }

    return undefined;
  } catch (error) {
    console.error(
      `Error fetching prices from subcollection for product ${productId}:`,
      error,
    );
    return undefined;
  }
}

async function fetchProductDynamicPricing(
  channelId: string,
  productId: string,
): Promise<DynamicPricingConfig | undefined> {
  try {
    const db = getDb();
    const snapshot = await db
      .doc(`/channels/${channelId}/products/${productId}/dynamicPricing/config`)
      .get();

    return snapshot.exists
      ? (snapshot.data() as DynamicPricingConfig)
      : undefined;
  } catch (error) {
    console.error(
      `Error fetching dynamic pricing config for product ${productId}:`,
      error,
    );
    return undefined;
  }
}

async function fetchDynamicPricingPresetsByIds(
  channelId: string,
  presetIds: string[],
): Promise<DynamicPricingPreset[]> {
  const uniqueIds = Array.from(
    new Set(presetIds.filter((presetId) => presetId.length > 0)),
  );

  if (uniqueIds.length === 0) {
    return [];
  }

  try {
    const db = getDb();
    const snapshots = await Promise.all(
      uniqueIds.map((presetId) =>
        db
          .doc(`/channels/${channelId}/dynamicPricingPresets/${presetId}`)
          .get(),
      ),
    );

    return snapshots.flatMap((snapshot) =>
      snapshot.exists ? [snapshot.data() as DynamicPricingPreset] : [],
    );
  } catch (error) {
    console.error(
      `Error fetching dynamic pricing presets for channel ${channelId}:`,
      error,
    );
    return [];
  }
}

/**
 * Main product suggestion flow
 * Ported from apps/functions/src/ai/productSuggestionFlow.ts
 */
export async function productsSuggestionFlow(
  input: ProductsSuggestionInput,
): Promise<FormattedOrderItem[]> {
  const { channelId, question, productNamesWithAttributes, tenantId } = input;
  const aiUsageContext = { channelId, tenantId };

  console.log(
    `[productsSuggestionFlow] Starting with ${productNamesWithAttributes.length} products for question: "${question}"`,
  );

  try {
    // Step 1: Split the question into product-specific questions
    console.log(
      "[productsSuggestionFlow] Step 1: Splitting question by products...",
    );
    const questions = await splitQuestionByProducts(
      question,
      productNamesWithAttributes,
      aiUsageContext,
    );

    if (questions.length === 0) {
      console.log(
        "[productsSuggestionFlow] No questions extracted, returning empty",
      );
      return [];
    }

    console.log("[productsSuggestionFlow] Parsed product questions", questions);

    const db = getDb();
    const productsCollection = db.collectionGroup("products");
    const attributesRef = db.collection("/attributes");

    // Caches
    const productCache = new Map<string, Product | null>();
    const attributeCache = new Map<string, Attribute>();
    const attributeContextCache = new Map<
      string,
      {
        attributes: Attribute[];
        transformedAttributes: { [key: string]: string[] };
      }
    >();

    // Helper to get a product by ID
    const getProduct = async (
      productId: string,
    ): Promise<Product | undefined> => {
      if (productCache.has(productId)) {
        return productCache.get(productId) ?? undefined;
      }
      let query = productsCollection
        .where("active", "==", true)
        .where("id", "==", productId);
      if (tenantId) {
        query = query.where("tenantId", "==", tenantId);
      }
      const snapshot = await query.get();
      if (snapshot.empty) {
        productCache.set(productId, null);
        return undefined;
      }
      const product = snapshot.docs[0].data() as Product;
      productCache.set(productId, product);
      return product;
    };

    // Helper to load attributes
    const loadAttributes = async (
      attributeIds: string[],
    ): Promise<Attribute[]> => {
      const missingAttributeIds = attributeIds.filter(
        (attributeId) => !attributeCache.has(attributeId),
      );
      if (missingAttributeIds.length > 0) {
        for (const chunk of chunkArray(
          missingAttributeIds,
          FIRESTORE_IN_QUERY_LIMIT,
        )) {
          const snapshot = await attributesRef
            .where("active", "==", true)
            .where("id", "in", chunk)
            .get();
          snapshot.docs.forEach((doc) => {
            const attribute = doc.data() as Attribute;
            attributeCache.set(attribute.id, attribute);
          });
        }
      }
      return attributeIds
        .map((attributeId) => attributeCache.get(attributeId))
        .filter((attribute): attribute is Attribute => Boolean(attribute));
    };

    // Helper to get attribute context for a product
    const getAttributeContext = async (product: Product) => {
      const cached = attributeContextCache.get(product.id);
      if (cached) {
        return cached;
      }

      const attributeIds = Object.keys(product.attributeOptions ?? {});
      if (attributeIds.length === 0) {
        const emptyContext = {
          attributes: [] as Attribute[],
          transformedAttributes: {} as { [key: string]: string[] },
        };
        attributeContextCache.set(product.id, emptyContext);
        return emptyContext;
      }

      const attributeDocs = await loadAttributes(attributeIds);
      const attributeMap = new Map(attributeDocs.map((doc) => [doc.id, doc]));
      const transformedAttributes: { [key: string]: string[] } = {};
      const processedAttributes = new Set<string>();
      const maxIterations = 5;
      let iteration = 0;

      while (
        processedAttributes.size < product.attributes.length &&
        iteration < maxIterations
      ) {
        let addedInThisIteration = 0;

        for (const attributeName of product.attributes) {
          if (processedAttributes.has(attributeName)) {
            continue;
          }

          const attribute = attributeMap.get(attributeName);

          if (isUndefined(attribute)) {
            processedAttributes.add(attributeName);
            continue;
          }

          const depRules = normalizeAttributeDependency(
            product.attributeDependencies?.[attributeName],
          );
          if (
            depRules.some((rule) => !processedAttributes.has(rule.dependsOn))
          ) {
            continue;
          }

          const retrievedAttributeOptions =
            product.attributeOptions?.[attribute.id] ?? [];
          const options: string[] = [];

          for (const retrievedAttributeOption of retrievedAttributeOptions) {
            const option = attribute.options.find(
              (item) => item.value === retrievedAttributeOption,
            );
            if (option) {
              options.push(option.label);
            }
          }

          transformedAttributes[attributeName] = options;
          processedAttributes.add(attributeName);
          addedInThisIteration++;
        }

        if (addedInThisIteration === 0) {
          break;
        }

        iteration++;
      }

      const sortedAttributes = product.attributes
        .map((attributeId) => attributeMap.get(attributeId))
        .filter((attribute): attribute is Attribute => Boolean(attribute));

      const context = { attributes: sortedAttributes, transformedAttributes };
      attributeContextCache.set(product.id, context);
      return context;
    };

    // Process a single question
    const processQuestion = async (
      _question: ParsedProductQuestion,
      index: number,
    ): Promise<FormattedOrderItem | null> => {
      try {
        const candidateProductIds = Array.from(
          new Set([
            _question.productId,
            ...(_question.candidateProductIds ?? []),
          ]),
        ).slice(0, 2);

        const processProductCandidate = async (
          productId: string,
        ): Promise<ProductSuggestionCandidate | null> => {
          const product = await getProduct(productId);
          if (!product) {
            console.log(
              `[productsSuggestionFlow] No products found for question at index ${index}`,
              { ..._question, productId },
            );
            return null;
          }

          let combination: string | undefined;
          let calculatedCombination: string | undefined;
          let description: string | undefined;
          let customFormat = product.customSize ?? false;
          let width = 0;
          let height = 0;
          let customSizes: {
            width: number;
            height: number;
            quantity: number;
          }[] = [];
          let volume = product.spec?.defaultOrder ?? 1;
          let selectedAttributeOptions: Record<string, string> = {};

          let attributes: Attribute[] = [];
          let transformedAttributes: { [key: string]: string[] } = {};

          // Process attributes if the product has them
          if (!isEmpty(product.attributes)) {
            const context = await getAttributeContext(product);
            attributes = context.attributes;
            transformedAttributes = context.transformedAttributes;

            if (Object.keys(transformedAttributes).length > 0) {
              const calculatedOutput = await suggestCalculatedCombination(
                transformedAttributes,
                _question.question,
                aiUsageContext,
              );
              const suggestedCalculatedCombination =
                calculatedOutput?.calculatedCombination;
              if (!suggestedCalculatedCombination) {
                console.warn(
                  "[productsSuggestionFlow] Failed to determine combination for product",
                  { productId: product.id },
                );
                return null;
              }

              const suggestedCombinationParts =
                suggestedCalculatedCombination.split("-");
              const transformedSplitCombination: string[] = [];
              const usedParts = new Set<number>();
              const currentSelections: { [key: string]: string } = {};

              for (const attributeId of product.attributes) {
                const attribute = attributes.find(
                  (attr) => attr.id === attributeId,
                );
                if (!attribute) {
                  continue;
                }

                const depRulesInner = normalizeAttributeDependency(
                  product.attributeDependencies?.[attributeId],
                );
                if (
                  depRulesInner.length > 0 &&
                  !areAllDependencyRulesMet(depRulesInner, currentSelections)
                ) {
                  continue;
                }

                for (let i = 0; i < suggestedCombinationParts.length; i++) {
                  if (usedParts.has(i)) {
                    continue;
                  }

                  const part = suggestedCombinationParts[i];
                  const option = attribute.options.find(
                    (opt) => opt.label === part,
                  );
                  if (option) {
                    transformedSplitCombination.push(option.value);
                    currentSelections[attributeId] = option.value;
                    usedParts.add(i);
                    if (option.customFormat) {
                      customFormat = true;
                    }
                    break;
                  }
                }
              }

              if (transformedSplitCombination.length > 0) {
                const [
                  resolvedCombination,
                  resolvedCalculatedCombination,
                  resolvedDescription,
                  resolvedAttributeOptions,
                ] = getDescriptiveCombination(
                  attributes,
                  transformedSplitCombination,
                  undefined,
                  product.attributeDependencies,
                );
                combination = resolvedCombination;
                calculatedCombination = resolvedCalculatedCombination;
                description = resolvedDescription;
                selectedAttributeOptions = Object.fromEntries(
                  Object.entries(resolvedAttributeOptions).flatMap(
                    ([key, value]) =>
                      typeof value === "string" ? [[key, value]] : [],
                  ),
                );
              }
            }
          }

          const requestDetails = await suggestProductRequestDetails(
            {
              customFormat,
              defaultVolume: product.spec?.defaultOrder,
              minHeight: product.spec?.minimumHeight,
              minWidth: product.spec?.minimumWidth,
              question: _question.question,
            },
            aiUsageContext,
          );
          const requestedMultipleSizes = {
            hasMultipleSizes: requestDetails.hasMultipleSizes,
            sizesCount: requestDetails.sizesCount,
          };

          if (product.customSize) {
            if (requestDetails.hasMultipleSizes) {
              customSizes = normalizeSuggestedCustomSizes(
                requestDetails.customSizes ?? [],
              );
              const primaryCustomSize = getPrimaryCustomSize(customSizes);
              if (primaryCustomSize) {
                width = primaryCustomSize.width;
                height = primaryCustomSize.height;
              }
            } else {
              width = Number(requestDetails.width ?? 0);
              height = Number(requestDetails.height ?? 0);
            }
          }

          volume = Number(requestDetails.volume ?? volume);
          const customSizesTotalQuantity =
            customSizes.length > 0 ? sumCustomSizeQuantities(customSizes) : 0;
          const pricingVolume =
            customSizesTotalQuantity > 0 ? customSizesTotalQuantity : volume;

          // Get prices
          let prices = product.prices;
          if (calculatedCombination && (!prices || prices.length === 0)) {
            const subcollectionPrices = await fetchPricesFromSubcollection(
              product.channelId || channelId,
              product.id,
              calculatedCombination,
            );
            if (subcollectionPrices && subcollectionPrices.length > 0) {
              prices = subcollectionPrices;
            }
          }

          const pricingQuantities = resolveQuotePricingQuantities({
            defaultOrder: product.spec?.defaultOrder,
            itemVolume: pricingVolume,
            priceType: product.priceType,
          });
          const pricingCombination =
            product.priceType === PriceTypeEnum.DYNAMIC
              ? calculatedCombination || combination || DEFAULT_COMBINATION
              : calculatedCombination;

          if (product.priceType === PriceTypeEnum.DYNAMIC) {
            const dynamicPrices = await resolveDynamicProductSuggestionPrices({
              calculatedCombination: pricingCombination,
              channelId,
              combination,
              customFormat,
              height,
              product,
              quantity: pricingQuantities.quantity,
              readers: {
                getDynamicPricingAttributes: loadAttributes,
                getDynamicPricingPresetsByIds: fetchDynamicPricingPresetsByIds,
                getProductDynamicPricing: fetchProductDynamicPricing,
              },
              selectedAttributeOptions,
              volume: pricingQuantities.volume,
              width,
            });

            if (dynamicPrices && dynamicPrices.length > 0) {
              prices = dynamicPrices;
            }
          }

          // Calculate price
          const priceResult = calcPrice(
            pricingQuantities.quantity,
            prices,
            product.priceType,
            undefined,
            pricingCombination,
            pricingQuantities.volume,
            customFormat,
            width,
            height,
            product.spec.minimumOrder,
            null,
            product.designSpec?.includeBleed
              ? product.designSpec?.bleed
              : undefined,
            undefined,
            customSizes.length > 0 ? customSizes : undefined,
          );

          if ("error" in priceResult) {
            console.warn("[productsSuggestionFlow] Pricing error for product", {
              productId: product.id,
              combination: pricingCombination,
              channelId: product.channelId || channelId,
              reason: priceResult.error,
            });
            return null;
          }

          const orderItem: FormattedOrderItem = {
            id: getRandomId(),
            name: "",
            product: {
              id: product?.id ?? "",
              name: product?.name ?? "",
              channelId: product?.channelId ?? "",
              spec: {
                images: product?.spec?.images ?? [],
              },
            },
            description: description ?? "",
            combination,
            calculatedCombination: pricingCombination,
            volume: pricingQuantities.isMatrixLike
              ? pricingQuantities.volume
              : 0,
            discount: new Discount().object,
            customFormat,
            totalPrice: ("result" in priceResult ? priceResult.result : 0) ?? 0,
            customPrice: null,
            width,
            height,
            quantity: pricingQuantities.quantity,
            unit: product.prefferedUnit,
            customSizes: customSizes,
          };

          const deliveryTime =
            "deliveryTime" in priceResult &&
            typeof priceResult.deliveryTime === "number"
              ? priceResult.deliveryTime
              : null;

          return {
            deliveryTime,
            item: orderItem,
            requestedMultipleSizes,
          };
        };

        const candidateItems = (
          await runWithConcurrency(
            candidateProductIds,
            (productId) => processProductCandidate(productId),
            CONCURRENCY_LIMIT,
          )
        ).filter((item): item is ProductSuggestionCandidate => Boolean(item));

        if (candidateItems.length === 0) {
          return null;
        }

        const requestedMultipleSizes =
          candidateItems.length > 1
            ? candidateItems.find((candidate) => candidate.requestedMultipleSizes)
                ?.requestedMultipleSizes
            : undefined;
        const selectedCandidate = selectBestProductSuggestionCandidate({
          candidates: candidateItems,
          primaryProductId: _question.productId,
          requestedMultipleSizes,
        });

        if (!selectedCandidate) {
          return null;
        }

        if (candidateItems.length > 1) {
          console.log("[productsSuggestionFlow] Selected product candidate", {
            candidates: candidateItems.map((candidate) => ({
              customSizes: candidate.item.customSizes?.length ?? 0,
              deliveryTime: candidate.deliveryTime,
              productId: candidate.item.product.id,
              totalPrice: candidate.item.totalPrice,
            })),
            requestedMultipleSizes,
            selectedProductId: selectedCandidate.item.product.id,
          });
        }

        return selectedCandidate.item;
      } catch (error) {
        console.error("[productsSuggestionFlow] Failed to process question", {
          error,
          question: _question,
        });
        return null;
      }
    };

    // Process all questions with concurrency
    const processedItems = await runWithConcurrency(
      questions,
      (item, index) => processQuestion(item, index),
      CONCURRENCY_LIMIT,
    );

    const results = processedItems.filter((item): item is FormattedOrderItem =>
      Boolean(item),
    );
    console.log(
      `[productsSuggestionFlow] Completed with ${results.length} items`,
    );
    return results;
  } catch (error) {
    console.error("[productsSuggestionFlow] Flow failed:", error);
    throw error;
  }
}
