import { Locale } from "@konfi/types";

export type StorefrontAssistantTopic =
  | "contact"
  | "print-prep"
  | "product-suggestion"
  | "refusal"
  | "fallback";

export interface StorefrontAssistantContact {
  companyName?: string;
  streetAddress?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  contactUrl: string;
}

export interface StorefrontAssistantProduct {
  name: string;
  description?: string;
  category?: string;
  url: string;
}

export interface StorefrontAssistantResponse {
  answer: string;
  conversationId?: string;
  topic: StorefrontAssistantTopic;
  refusal: boolean;
  contact?: StorefrontAssistantContact;
  products: StorefrontAssistantProduct[];
}

export interface StorefrontAssistantRequestBody {
  conversationId?: string;
  message: string;
  locale?: Locale;
}

export interface StorefrontAssistantPageContent {
  contact?: StorefrontAssistantContact;
  content: string;
  route: StorefrontAssistantPageRoute;
  url: string;
}

export type StorefrontAssistantPageRoute =
  | "about-us"
  | "cooperation"
  | "help/contact"
  | "help/faq"
  | "help/general-conditions-of-sale"
  | "help/reasons-for-rejections"
  | "help/regulations";
