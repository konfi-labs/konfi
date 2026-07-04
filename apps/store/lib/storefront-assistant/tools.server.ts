import "server-only";

import {
  getPublicStorePageContent,
  searchPublicStorefrontProducts,
} from "@/lib/storefront-assistant/data.server";
import type {
  StorefrontAssistantContact,
  StorefrontAssistantPageContent,
  StorefrontAssistantPageRoute,
  StorefrontAssistantProduct,
} from "@/lib/storefront-assistant/types";
import { Locale } from "@konfi/types";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

const pageRouteSchema = z.enum([
  "about-us",
  "cooperation",
  "help/contact",
  "help/faq",
  "help/general-conditions-of-sale",
  "help/reasons-for-rejections",
  "help/regulations",
] satisfies StorefrontAssistantPageRoute[]);

const STORE_PAGE_ROUTE_KEYWORDS: Array<{
  keywords: string[];
  route: StorefrontAssistantPageRoute;
}> = [
  {
    keywords: ["contact", "kontakt", "email", "mail", "phone", "telefon"],
    route: "help/contact",
  },
  {
    keywords: [
      "file",
      "files",
      "plik",
      "pliki",
      "przygotow",
      "rejection",
      "rejected",
      "odrzuc",
      "spad",
      "bleed",
    ],
    route: "help/reasons-for-rejections",
  },
  {
    keywords: ["faq", "question", "pytan", "pomoc"],
    route: "help/faq",
  },
  {
    keywords: ["terms", "regulamin", "condition", "warunki"],
    route: "help/regulations",
  },
  {
    keywords: ["sale", "sales", "sprzedaz", "sprzeda", "ogolne"],
    route: "help/general-conditions-of-sale",
  },
  {
    keywords: ["cooperation", "wspolprac", "współprac", "partner"],
    route: "cooperation",
  },
  {
    keywords: ["about", "o nas", "firma", "company"],
    route: "about-us",
  },
];

export interface StorefrontAssistantToolMemory {
  contacts: StorefrontAssistantContact[];
  pageContents: StorefrontAssistantPageContent[];
  products: StorefrontAssistantProduct[];
}

export function createStorefrontAssistantToolMemory(): StorefrontAssistantToolMemory {
  return {
    contacts: [],
    pageContents: [],
    products: [],
  };
}

function rememberProducts(
  memory: StorefrontAssistantToolMemory,
  products: StorefrontAssistantProduct[],
) {
  const seen = new Set(memory.products.map((product) => product.url));

  for (const product of products) {
    if (seen.has(product.url)) {
      continue;
    }

    seen.add(product.url);
    memory.products.push(product);
  }
}

function rememberPageContent(
  memory: StorefrontAssistantToolMemory,
  pageContent: StorefrontAssistantPageContent,
) {
  memory.pageContents.push(pageContent);

  if (pageContent.contact) {
    memory.contacts.push(pageContent.contact);
  }
}

function normalizeContextQuery(query: string) {
  return query
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferStorePageRoute(
  query: string,
): StorefrontAssistantPageRoute | undefined {
  const normalizedQuery = normalizeContextQuery(query);

  return STORE_PAGE_ROUTE_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => normalizedQuery.includes(keyword)),
  )?.route;
}

export async function loadStorefrontAssistantContext({
  locale,
  memory,
  query,
}: {
  locale: Locale;
  memory: StorefrontAssistantToolMemory;
  query: string;
}) {
  const route = inferStorePageRoute(query);
  const pageContent = route
    ? await getPublicStorePageContent({ locale, route })
    : undefined;
  const products = route
    ? []
    : await searchPublicStorefrontProducts({
        limit: 3,
        locale,
        query,
      });

  rememberProducts(memory, products);

  if (pageContent) {
    rememberPageContent(memory, pageContent);
  }

  return {
    pageContent,
    products,
  };
}

export function createStorefrontAssistantTools({
  locale,
  memory,
}: {
  locale: Locale;
  memory: StorefrontAssistantToolMemory;
}): ToolSet {
  return {
    getStorefrontContext: tool({
      description:
        "Fetch the most relevant public storefront context for the customer query. Use this first before answering. It can return public page content, contact details, and product suggestions.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("The customer's original storefront assistant query."),
      }),
      execute: async ({ query }) => {
        return loadStorefrontAssistantContext({ locale, memory, query });
      },
    }),
    searchPublicProducts: tool({
      description:
        "Search public storefront products by customer intent. Use before recommending product links. Returns only public active products and safe storefront URLs.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Customer product intent, for example business cards, flyers, posters, banners, stickers, paper type, or quantity.",
          ),
        limit: z.number().int().min(1).max(5).optional(),
      }),
      execute: async ({ query, limit }) => {
        const products = await searchPublicStorefrontProducts({
          limit,
          locale,
          query,
        });

        rememberProducts(memory, products);
        return { products };
      },
    }),
    getStorePageContent: tool({
      description:
        "Fetch public storefront page content for contact details, FAQ, file rejection reasons, terms, cooperation, or about-us questions. Use before answering questions about store pages or contact data.",
      inputSchema: z.object({
        route: pageRouteSchema.describe("Whitelisted public storefront page."),
      }),
      execute: async ({ route }) => {
        const pageContent = await getPublicStorePageContent({
          locale,
          route,
        });

        rememberPageContent(memory, pageContent);
        return pageContent;
      },
    }),
  };
}
