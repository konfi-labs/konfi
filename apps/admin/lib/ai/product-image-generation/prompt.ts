import {
  buildCompactProductContext,
  type ProductImagePromptContextInput,
} from "./context";

const LANGUAGE_LABELS: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
};

export const DEFAULT_PRODUCT_IMAGE_PROMPT_TEMPLATE = `Create an ultra-realistic premium editorial product photo of the physical product described below. Show the real product in a slightly rotated top-down composition. The entire image background must be plain white (#ffffff), including every corner and edge. Use soft diffused studio lighting, subtle natural shadows, realistic material texture appropriate to the product, and crisp physical edges.`;

const PRODUCT_SURFACE_DESIGN_GUIDANCE = `Keep the outer background pure #ffffff edge-to-edge: no off-white cast, color tint, gradients, texture, vignette, backdrop, or props. Use the context only to decide the visible product surface: design-led print products need a finished calm premium layout with large readable modern typography, concrete simple graphics, generous white space, and muted elegant contrast; functional utility products should stay restrained and mostly plain. Avoid abstract placeholder blobs, random patterns, busy collage, warped geometry, and distorted print details.`;

const PRODUCT_REFERENCE_IMAGE_GUIDANCE = `If references are provided, use them only for material, shape, composition, or fixed structure. Do not copy reference artwork, branding, layout, text, or illustrations. Preserve product-defining structures like calendar grids, tear-off strips, covers, backing cards, or header cards, but redesign the editable printed face from scratch.`;

export function resolvePromptLanguageLabel(
  languageCode?: string | null,
): string {
  const normalizedLanguageCode = languageCode?.trim().toLocaleLowerCase();
  if (!normalizedLanguageCode) {
    return "English";
  }

  return LANGUAGE_LABELS[normalizedLanguageCode] ?? languageCode ?? "English";
}

export function buildProductTextGuidance(
  input: ProductImagePromptContextInput & {
    currentLanguage?: string | null;
  },
): string {
  return `Product context is not visible copy: do not print exact or close-paraphrased product names, category labels, descriptions, notes, or specs. For design-led products, include one to three short original ${resolvePromptLanguageLabel(input.currentLanguage)} phrases when typography improves authenticity; keep each phrase brief, readable, and purposeful. Render letters as clean contemporary sans-serif type, not gibberish, symbols, or abstract marks. Never copy reference text or add phone numbers, emails, URLs, QR codes, barcodes, addresses, personal data, real company names, postal markings, or factual claims.`;
}

function buildProductContextGuidance(
  input: ProductImagePromptContextInput,
): string {
  const productContext = buildCompactProductContext(input);
  if (!productContext) {
    return "";
  }

  return `Use this product context only to understand the product format, purpose, and how much visible graphic design belongs on the product. Never reproduce or closely paraphrase this source wording as printed text on the design: ${productContext}.`;
}

export function buildSuggestedProductImagePrompt(
  input: ProductImagePromptContextInput & {
    currentLanguage?: string | null;
  },
): string {
  const promptParts = [
    DEFAULT_PRODUCT_IMAGE_PROMPT_TEMPLATE,
    buildProductContextGuidance(input),
    PRODUCT_SURFACE_DESIGN_GUIDANCE,
    buildProductTextGuidance(input),
    PRODUCT_REFERENCE_IMAGE_GUIDANCE,
    "Premium, modern, art-directed, minimal, no clutter, no cheap mockup look.",
  ].filter(Boolean);

  return promptParts.join(" ");
}
