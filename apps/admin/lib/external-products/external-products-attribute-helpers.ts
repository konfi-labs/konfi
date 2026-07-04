import {
  getDb,
  serializeFirestoreDeep,
} from "@/lib/external-products/external-products-firestore-helpers";
import {
  detectTextLanguage,
  selectLocalizedTitle,
} from "@/lib/external-products/external-products-text-helpers";
import { getExternalAttributeKey } from "@/lib/external-products/external-attribute-key";
import { getDuplicateInternalAttributeMappings } from "@/lib/external-products/attribute-mapping-validation";
import type { Attribute, ExternalAttribute } from "@konfi/types";
import { cacheLife, cacheTag } from "next/cache";

export const ATTRIBUTES_TAG = "external-import-attributes";

export type InternalAttributeForMapping = Attribute & { id: string };

/**
 * Cached fetch of all internal attributes.
 * Reused across fetchExternalProduct, aiMapAttributes, getExternalProductForCreate.
 */
export async function getInternalAttributesCached(): Promise<
  Array<Attribute & { id: string }>
> {
  "use cache";
  cacheLife("hours");
  cacheTag(ATTRIBUTES_TAG);

  const db = getDb();
  const snapshot = await db.collection("attributes").get();
  return snapshot.docs.map((doc) =>
    serializeFirestoreDeep({ id: doc.id, ...doc.data() }),
  ) as Array<Attribute & { id: string }>;
}

export function formatDuplicateInternalAttributeMappings(options: {
  duplicateMappings: ReturnType<typeof getDuplicateInternalAttributeMappings>;
  internalAttributesById?: ReadonlyMap<string, Pick<Attribute, "name">>;
}) {
  const { duplicateMappings, internalAttributesById } = options;

  return duplicateMappings
    .map(({ internalAttributeId, externalAttributeNames }) => {
      const internalAttributeName =
        internalAttributesById?.get(internalAttributeId)?.name ??
        internalAttributeId;

      return `"${internalAttributeName}" is mapped to multiple external attributes: ${externalAttributeNames.join(", ")}`;
    })
    .join("; ");
}

export function buildExternalAttributeMappingPromptData(
  externalAttributes: ExternalAttribute[],
) {
  return externalAttributes.map((attribute) => ({
    externalAttributeKey: getExternalAttributeKey(attribute),
    id: attribute.id,
    name: attribute.name,
    options:
      attribute.options?.map((option) => ({
        value: option.value,
        label: option.label,
      })) ?? attribute.values.map((value) => ({ value })),
    category: attribute.category,
  }));
}

export function buildInternalAttributeMappingPromptData(
  internalAttributes: InternalAttributeForMapping[],
) {
  return internalAttributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    type: attribute.type,
    calculated: attribute.calculated,
    options: attribute.options?.map((option) => ({
      value: option.value,
      label: option.label,
      color: option.color,
      formatWidth: option.formatWidth,
      formatHeight: option.formatHeight,
      pages: option.pages,
    })),
  }));
}

export const ATTRIBUTE_MAPPING_RULES = `Rules:
- Each external attribute has a unique key: its "externalAttributeKey" value. In output fields named "externalAttributeName", ALWAYS copy that exact key.
- NEVER rewrite option values. Output external option keys must be copied from external option.value exactly, including hyphens, underscores, numbers, casing, and leading digits. For example, output "outer-matt-250g", not "outer_matt_250g"; output "4-4", not "_4_4".
- Output internal option values must be copied from internal option.value exactly. Use option labels only for understanding the meaning.
- Match external attributes by the human-facing "name" and option labels. Treat "id" as a technical key, except as context to distinguish siblings with the same name.
- When multiple external attributes share the same display name, use id/name context such as cover/outer/okładki vs inner/środek to keep them distinct. Do not collapse sibling attributes into one internal attribute.
- Avoid reusing the same internalAttributeId for sibling external attributes when a distinct internal attribute exists. If no distinct internal attribute exists, still return the best semantic suggestion with lower confidence so the user can review it.
- Prefer localized/customer-facing labels over raw technical keys. If a raw API-key-style attribute duplicates a localized attribute with the same meaning, map only the localized/customer-facing attribute.
- Strongly prefer internal attributes with calculated: true when they are a semantic match because those are configurable pricing attributes.
- Set internalAttributeId based on the best semantic attribute match even when option mappings are only partial. Do not leave the whole attribute unmapped just because some options need review.
- For paper, material, finish, color side, cover/inner role, and coating, preserve meaningful distinctions. A shared weight alone is not enough when labels differ by matte/gloss/cover/inner unless the internal option is intentionally generic.
- For formats and dimensions, map only exact standards or exact dimensions. Never map to the closest available size; leave unmatched sizes unmapped or suggest new options where supported.
- Do not map one internal option value to multiple external option values unless they are true synonyms with the same customer-facing meaning.
- Lower confidence when a name is technical/API-key-like, when only part of the meaning matches, or when option coverage is weak.`;

export function normalizeExtractionAlias(value?: string): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

export function isLikelyTechnicalAttributeName(value?: string): boolean {
  const trimmed = value?.trim();

  if (!trimmed || /\s/.test(trimmed) || /[ąćęłńóśźż]/i.test(trimmed)) {
    return false;
  }

  return (
    /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(trimmed) ||
    /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/.test(trimmed) ||
    /^[a-z][a-z0-9]{2,}$/.test(trimmed)
  );
}

export type ExtractedAttributeCandidate = {
  id?: string;
  name: string;
  options?: Array<{ value: string; label?: string }>;
  category?: string;
  affectsPricing?: boolean;
};

export function describeExtractedAttribute(
  attribute: ExtractedAttributeCandidate,
): string {
  const name = attribute.name.trim();
  const attributeId = attribute.id?.trim();

  if (attributeId && attributeId !== name) {
    return `"${name}" (id: "${attributeId}")`;
  }

  return `"${name}"`;
}

export function getLocalizedAttributeNameIssues(
  attributes: ExtractedAttributeCandidate[],
  language: string,
): string[] {
  const issues: string[] = [];
  const wantsPolish = language.toLowerCase().startsWith("pl");

  if (!wantsPolish) {
    return issues;
  }

  attributes.forEach((attribute) => {
    const descriptor = describeExtractedAttribute(attribute);
    const nameLanguage = detectTextLanguage(attribute.name);
    const looksTechnical = isLikelyTechnicalAttributeName(attribute.name);
    const idAlias = normalizeExtractionAlias(attribute.id);
    const nameAlias = normalizeExtractionAlias(attribute.name);

    if (nameLanguage === "en" || looksTechnical) {
      issues.push(
        `${descriptor} uses an English or technical attribute name in Polish admin mode. ` +
          `Use the human-readable Polish display label in name and keep the API key in id.`,
      );
      return;
    }

    if (idAlias && nameAlias && idAlias === nameAlias && looksTechnical) {
      issues.push(
        `${descriptor} repeats the API key in both id and name. ` +
          `Use a localized display label in name and keep the technical key in id only.`,
      );
    }
  });

  return issues;
}

export function getExtractedAttributeIssues(
  attributes: ExtractedAttributeCandidate[],
): string[] {
  const issues: string[] = [];
  const aliasOwners = new Map<
    string,
    { descriptor: string; normalizedId?: string }
  >();

  attributes.forEach((attribute) => {
    const descriptor = describeExtractedAttribute(attribute);
    const normalizedId = normalizeExtractionAlias(attribute.id);
    const normalizedName = normalizeExtractionAlias(attribute.name);
    const aliases = new Set(
      [normalizedName, normalizedId].filter((value): value is string =>
        Boolean(value),
      ),
    );

    aliases.forEach((alias) => {
      const existing = aliasOwners.get(alias);

      if (existing && existing.descriptor !== descriptor) {
        // If the colliding alias is only a shared display-name (not an id
        // alias) and both attributes carry distinct technical ids, they are
        // legitimately different attributes that happen to share a label
        // (e.g. two "Papier" attrs with ids "calendarPaperFlatHeadWeight"
        // and "calendarPaperConvexHeadWeight"). Skip the warning.
        const isNameOnlyCollision =
          alias !== normalizedId && alias !== existing.normalizedId;

        if (
          isNameOnlyCollision &&
          normalizedId &&
          existing.normalizedId &&
          normalizedId !== existing.normalizedId
        ) {
          return;
        }

        issues.push(
          `Duplicate attribute alias detected between ${existing.descriptor} and ${descriptor}. ` +
            `Use one attribute object only, with id as the API key and name as the display label.`,
        );
        return;
      }

      aliasOwners.set(alias, { descriptor, normalizedId });
    });

    const optionAliasOwners = new Map<string, string>();

    (attribute.options ?? []).forEach((option) => {
      const optionDescriptor = option.label?.trim()
        ? `"${option.label.trim()}" / "${option.value.trim()}"`
        : `"${option.value.trim()}"`;
      const optionAliases = new Set(
        [option.value, option.label]
          .map((value) => normalizeExtractionAlias(value))
          .filter((value): value is string => Boolean(value)),
      );

      optionAliases.forEach((alias) => {
        const existing = optionAliasOwners.get(alias);

        if (existing && existing !== optionDescriptor) {
          issues.push(
            `Duplicate option alias detected inside ${descriptor}: ${existing} and ${optionDescriptor}. ` +
              `Use a single option object with value as API value and label as display text.`,
          );
          return;
        }

        optionAliasOwners.set(alias, optionDescriptor);
      });
    });
  });

  return [...new Set(issues)];
}

export function getAllExtractedAttributeIssues(
  attributes: ExtractedAttributeCandidate[],
  language: string,
): string[] {
  return [
    ...getExtractedAttributeIssues(attributes),
    ...getLocalizedAttributeNameIssues(attributes, language),
  ];
}

export function toExtractedAttributeCandidates(
  attributes: ExternalAttribute[],
): ExtractedAttributeCandidate[] {
  return attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    options: attribute.options ?? attribute.values.map((value) => ({ value })),
    category: attribute.category,
    affectsPricing: attribute.affectsPricing,
  }));
}
