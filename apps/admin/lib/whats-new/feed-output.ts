import { z } from "zod";

export const MAX_FEED_HIGHLIGHTS = 5;

export const localizedTextSchema = z.object({
  en: z.string().min(1),
  pl: z.string().min(1),
});

export const feedOutputSchema = z.object({
  title: localizedTextSchema,
  description: localizedTextSchema,
  highlightFeatures: z
    .array(localizedTextSchema)
    .min(2)
    .max(MAX_FEED_HIGHLIGHTS),
});

export const feedGenerationOutputSchema = feedOutputSchema.extend({
  highlightFeatures: z.array(localizedTextSchema).min(2),
});

export const monthlyFeedHighlightSchema = z.object({
  en: z
    .string()
    .min(1)
    .describe(
      "Concrete 5-14 word English admin recommendation with product-market fit, not a slogan or vague trend idea.",
    ),
  pl: z
    .string()
    .min(1)
    .describe("Idiomatic Polish version of the same concrete recommendation."),
  supportingEntityType: z.enum(["product", "promotion", "campaign"]),
  supportingEntityId: z.string().min(1),
});

export const monthlyFeedGenerationOutputSchema = feedOutputSchema.extend({
  highlightFeatures: z.array(monthlyFeedHighlightSchema).min(2),
});

export type GeneratedFeedOutput = z.infer<typeof feedOutputSchema>;
type GeneratedFeedModelOutput = z.infer<typeof feedGenerationOutputSchema>;
export type MonthlyFeedModelOutput = z.infer<
  typeof monthlyFeedGenerationOutputSchema
>;

export function normalizeGeneratedFeedOutput(
  output: GeneratedFeedModelOutput,
): GeneratedFeedOutput {
  return feedOutputSchema.parse({
    ...output,
    highlightFeatures: output.highlightFeatures.slice(0, MAX_FEED_HIGHLIGHTS),
  });
}

function normalizeLocalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hasDuplicatedLocalizedText(output: GeneratedFeedOutput) {
  const localizedTexts = [
    output.title,
    output.description,
    ...output.highlightFeatures,
  ];

  return localizedTexts.some(
    (text) =>
      normalizeLocalizedText(text.en) === normalizeLocalizedText(text.pl),
  );
}

function getHighlightPrefix(value: string) {
  return normalizeLocalizedText(value)
    .replace(/[^a-z0-9ąćęłńóśźż\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

export function hasRepetitiveHighlights(output: GeneratedFeedOutput) {
  if (output.highlightFeatures.length < 4) {
    return false;
  }

  const prefixCounts = new Map<string, number>();
  for (const highlight of output.highlightFeatures) {
    const prefix = getHighlightPrefix(highlight.en);
    if (!prefix) {
      continue;
    }

    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  return Array.from(prefixCounts.values()).some((count) => count >= 3);
}
