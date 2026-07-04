import { Locale } from "@konfi/types";
import type {
  StorefrontAssistantContact,
  StorefrontAssistantProduct,
  StorefrontAssistantResponse,
  StorefrontAssistantTopic,
} from "./types";
import { z } from "zod";

const SUPPORTED_LOCALES = new Set<string>(Object.values(Locale));

export const storefrontAssistantTopicSchema = z.enum([
  "contact",
  "print-prep",
  "product-suggestion",
  "refusal",
  "fallback",
] satisfies StorefrontAssistantTopic[]);

export const storefrontAssistantProductSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(400).optional(),
  category: z.string().max(120).optional(),
  url: z.string().min(1).max(300),
}) satisfies z.ZodType<StorefrontAssistantProduct>;

export const storefrontAssistantContactSchema = z.object({
  companyName: z.string().max(180).optional(),
  streetAddress: z.string().max(180).optional(),
  postalCode: z.string().max(60).optional(),
  city: z.string().max(120).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().max(180).optional(),
  contactUrl: z.string().min(1).max(300),
}) satisfies z.ZodType<StorefrontAssistantContact>;

export const storefrontAssistantResponseSchema = z.object({
  answer: z.string().min(1).max(1200),
  topic: storefrontAssistantTopicSchema,
  refusal: z.boolean(),
  contact: storefrontAssistantContactSchema.optional(),
  products: z.array(storefrontAssistantProductSchema).max(3),
}) satisfies z.ZodType<StorefrontAssistantResponse>;

export function normalizeAssistantLocale(locale?: string): Locale {
  if (locale && SUPPORTED_LOCALES.has(locale)) {
    return locale as Locale;
  }

  return Locale.pl;
}

function normalizeUrl(value: string) {
  return value.trim().toLowerCase();
}

function uniqueProducts(
  products: StorefrontAssistantProduct[],
): StorefrontAssistantProduct[] {
  const seen = new Set<string>();
  const unique: StorefrontAssistantProduct[] = [];

  for (const product of products) {
    const key = normalizeUrl(product.url);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(product);
  }

  return unique;
}

export function sanitizeStorefrontAssistantResponse({
  allowedContacts,
  allowedProducts,
  locale,
  response,
}: {
  allowedContacts: StorefrontAssistantContact[];
  allowedProducts: StorefrontAssistantProduct[];
  locale: Locale;
  response: StorefrontAssistantResponse;
}): StorefrontAssistantResponse {
  const allowedProductUrls = new Set(
    allowedProducts.map((product) => normalizeUrl(product.url)),
  );
  const products = uniqueProducts(response.products)
    .filter((product) => allowedProductUrls.has(normalizeUrl(product.url)))
    .slice(0, 3);
  const contact =
    response.contact &&
    response.contact.contactUrl.startsWith(`/${locale}/`) &&
    allowedContacts.some(
      (allowedContact) =>
        normalizeUrl(allowedContact.contactUrl) ===
        normalizeUrl(response.contact?.contactUrl ?? ""),
    )
      ? response.contact
      : allowedContacts[0];

  return {
    ...response,
    contact,
    products,
  };
}
