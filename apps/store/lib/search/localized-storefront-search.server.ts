import "server-only";

import {
  getAppForServer,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { getProductTranslations } from "@konfi/firebase";
import { DEFAULT_LOCALE } from "@konfi/types";
import { getAI, getGenerativeModel, VertexAIBackend } from "firebase/ai";
import type { AppCheckTokenResult } from "firebase/app-check";
import {
  searchStorefrontProducts,
  type StorefrontProductSearchResult,
} from "./product-search.server";

export async function searchLocalizedStorefrontProducts(input: {
  appCheckToken?: AppCheckTokenResult | string;
  channelId?: string;
  limit?: number;
  lng: string;
  query: string;
}): Promise<StorefrontProductSearchResult[] | null> {
  try {
    if (!input.channelId) {
      console.error("Channel ID is missing or empty");
      return null;
    }

    const tenantContext = await getTenantContextForRequest();
    const { firebaseServerApp, firestore } = await getAppForServer(
      input.appCheckToken,
    );
    let translatedQuery = input.query;

    if (
      input.lng !== DEFAULT_LOCALE &&
      input.query !== " " &&
      input.query !== ""
    ) {
      const vertexAI = getAI(firebaseServerApp, {
        backend: new VertexAIBackend("global"),
      });
      const gemini = getGenerativeModel(vertexAI, {
        model: "gemini-3.1-flash-lite",
        generationConfig: {
          maxOutputTokens: 10,
        },
      });
      gemini.systemInstruction = {
        role: "system",
        parts: [
          {
            text: `
            You are a helpful assistant that translates queries from any language to ${DEFAULT_LOCALE}. Return only the translated query without any additional text or explanation. Sometimes the query may not be a complete word or sentence, but just a part of it. In such cases, translate the part to ${DEFAULT_LOCALE} as accurately as possible. Keep in mind that this is an app for a print shop.
            `,
          },
        ],
      };
      await gemini
        .generateContent(input.query)
        .then((result) => {
          translatedQuery = result.response.text();
        })
        .catch((error) => {
          console.error("Translation error:", error);
        });
    }

    const results = await searchStorefrontProducts({
      channelId: input.channelId,
      firestore,
      limit: input.limit,
      query: translatedQuery,
      tenantContext,
    });

    try {
      const productIds = results.map((result) => result.id);

      if (productIds.length > 0) {
        const translationResults = await Promise.all(
          productIds.map((productId) =>
            getProductTranslations(
              firestore,
              input.channelId ?? "",
              productId,
              input.lng,
            )
              .then((translations) => ({ productId, translations }))
              .catch((error) => {
                console.warn(
                  `Failed to fetch translation for product ${productId}:`,
                  error,
                );
                return { productId, translations: [] };
              }),
          ),
        );

        const translationMap = new Map(
          translationResults.map(({ productId, translations }) => [
            productId,
            translations[0] || null,
          ]),
        );

        results.forEach((result) => {
          const translation = translationMap.get(result.id);

          if (translation?.name) {
            result.name = translation.name;
          }
        });
      }
    } catch (translationError) {
      console.warn(
        "Failed to apply product translations to search results:",
        translationError,
      );
    }

    try {
      const serialized = JSON.stringify(results);
      return JSON.parse(serialized) as StorefrontProductSearchResult[];
    } catch (stringifyError) {
      console.error("Serialization failed:", stringifyError);
      return [];
    }
  } catch (error) {
    console.error("Storefront product search error:", error);
    return null;
  }
}
