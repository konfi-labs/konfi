import type {
  Attribute,
  BlogCategory,
  BlogPost,
  BlogTag,
  Category,
  dbMetadata,
  dbPageContent,
  Hero,
  Product,
} from "@konfi/types";
import { reconcileAttributeOptionTranslations } from "./attribute-options";
import { hashManagedTranslationSource } from "./hash";
import { cloneRecord, getPathValue, isRecord, setPathValue } from "./path";
import type {
  ManagedTranslationDescriptor,
  ManagedTranslationDocument,
  ManagedTranslationField,
  ManagedTranslationKind,
} from "./types";

function field(
  path: string,
  options?: Partial<
    Omit<ManagedTranslationField, "key" | "sourcePath" | "targetPath">
  > & {
    key?: string;
    targetPath?: string;
  },
): ManagedTranslationField {
  return {
    key: options?.key ?? path,
    sourcePath: path,
    targetPath: options?.targetPath ?? path,
    label: options?.label,
    required: options?.required ?? true,
    translatable: options?.translatable ?? true,
  };
}

function descriptor(
  kind: ManagedTranslationKind,
  source: Record<string, unknown>,
  fields: ManagedTranslationField[],
  normalizeTranslation?: ManagedTranslationDescriptor["normalizeTranslation"],
): ManagedTranslationDescriptor {
  return {
    kind,
    fields,
    sourceHash: hashManagedTranslationSource(source, fields),
    normalizeTranslation,
  };
}

function cardFields(cards: unknown[]): ManagedTranslationField[] {
  return cards.flatMap((_, index) => [
    field(`cards.${index}.title`),
    field(`cards.${index}.subtitle`),
    field(`cards.${index}.buttonLabel`),
    field(`cards.${index}.buttonUrl`, { required: false }),
  ]);
}

function contentFields(content: unknown[]): ManagedTranslationField[] {
  return content.map((_, index) => field(`content.${index}.value`));
}

function taxonomyNameFields(
  source: Record<string, unknown>,
  groups: readonly { path: string; label: string }[],
): ManagedTranslationField[] {
  return groups.flatMap((group) => {
    const definitions = getPathValue(source, group.path);
    if (!Array.isArray(definitions)) {
      return [];
    }

    return definitions.flatMap((definition, index) => {
      const definitionRecord = recordFrom(definition);
      const id =
        typeof definitionRecord.id === "string" ? definitionRecord.id : index;
      const name =
        typeof definitionRecord.name === "string" && definitionRecord.name
          ? definitionRecord.name
          : id;

      return [
        field(`${group.path}.${index}.id`, {
          required: false,
          translatable: false,
        }),
        field(`${group.path}.${index}.name`, {
          label: `${group.label}: ${name}`,
        }),
      ];
    });
  });
}

function normalizeTaxonomyNameTranslations(
  source: Record<string, unknown>,
  translation: ManagedTranslationDocument,
  groups: readonly { path: string }[],
): ManagedTranslationDocument {
  const normalized = cloneRecord(translation);

  for (const group of groups) {
    const sourceDefinitions = getPathValue(source, group.path);
    const translatedDefinitions = getPathValue(translation, group.path);
    if (!Array.isArray(sourceDefinitions)) {
      setPathValue(normalized, group.path, []);
      continue;
    }

    const translatedById = new Map<string, Record<string, unknown>>();
    if (Array.isArray(translatedDefinitions)) {
      for (const translatedDefinition of translatedDefinitions) {
        const record = recordFrom(translatedDefinition);
        if (typeof record.id === "string") {
          translatedById.set(record.id, record);
        }
      }
    }

    setPathValue(
      normalized,
      group.path,
      sourceDefinitions.map((sourceDefinition, index) => {
        const sourceRecord = recordFrom(sourceDefinition);
        const sourceId =
          typeof sourceRecord.id === "string" ? sourceRecord.id : `${index}`;
        const translatedRecord = translatedById.get(sourceId);

        return {
          id: sourceId,
          name:
            typeof translatedRecord?.name === "string"
              ? translatedRecord.name
              : "",
        };
      }),
    );
  }

  return normalized;
}

function optionFields(
  options: Attribute["options"],
): ManagedTranslationField[] {
  return options.flatMap((_, index) => [
    field(`options.${index}.value`, {
      required: false,
      translatable: false,
    }),
    field(`options.${index}.label`, {
      key: `options.${index}.label`,
      targetPath: `options.${index}.label`,
    }),
  ]);
}

function recordFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function normalizeManagedTranslation(
  descriptorValue: ManagedTranslationDescriptor,
  translation: ManagedTranslationDocument,
): ManagedTranslationDocument {
  return descriptorValue.normalizeTranslation
    ? descriptorValue.normalizeTranslation(translation)
    : translation;
}

export function createManagedTranslationDescriptor(
  kind: "product",
  source: Product,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "category",
  source: Category,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "attribute",
  source: Attribute,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "blogPost",
  source: BlogPost,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "blogCategory",
  source: BlogCategory,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "blogTag",
  source: BlogTag,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "hero",
  source: Hero,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "storeMetadata",
  source: dbMetadata,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: "storePageContent",
  source: dbPageContent,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: ManagedTranslationKind,
  source: unknown,
): ManagedTranslationDescriptor;
export function createManagedTranslationDescriptor(
  kind: ManagedTranslationKind,
  source: unknown,
): ManagedTranslationDescriptor {
  const sourceRecord = recordFrom(source);

  switch (kind) {
    case "product":
      return descriptor(kind, sourceRecord, [
        field("name"),
        field("description"),
        field("seo.title"),
        field("seo.description"),
        field("seo.slug"),
        field("specialNotes", { required: false }),
      ]);
    case "category":
      return descriptor(kind, sourceRecord, [
        field("name"),
        field("description"),
        field("seo.title"),
        field("seo.description"),
        field("seo.slug"),
      ]);
    case "attribute":
      return descriptor(
        kind,
        sourceRecord,
        [
          field("name"),
          ...optionFields(
            Array.isArray((source as Attribute).options)
              ? (source as Attribute).options
              : [],
          ),
        ],
        (translation) => {
          const normalized = cloneRecord(translation);
          normalized.options = reconcileAttributeOptionTranslations(
            source as Attribute,
            translation.options,
          );
          return normalized;
        },
      );
    case "blogPost":
      return descriptor(kind, sourceRecord, [
        field("title"),
        field("excerpt"),
        field("content"),
        field("seo.title"),
        field("seo.description"),
      ]);
    case "blogCategory":
      return descriptor(kind, sourceRecord, [
        field("name"),
        field("description"),
        field("seo.title"),
        field("seo.description"),
      ]);
    case "blogTag":
      return descriptor(kind, sourceRecord, [
        field("name"),
        field("description"),
      ]);
    case "hero":
      return descriptor(
        kind,
        sourceRecord,
        cardFields(Array.isArray(sourceRecord.cards) ? sourceRecord.cards : []),
      );
    case "storeMetadata":
      return descriptor(kind, sourceRecord, [
        field("title"),
        field("description"),
        field("keywords"),
        field("ogTitle", { required: false }),
        field("ogDescription", { required: false }),
      ]);
    case "storePageContent":
      return descriptor(
        kind,
        sourceRecord,
        contentFields(
          Array.isArray(sourceRecord.content) ? sourceRecord.content : [],
        ),
      );
    case "printingMethodsSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "methods", label: "Printing method" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "methods" },
          ]),
      );
    case "paymentMethodsSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "methods", label: "Payment method" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "methods" },
          ]),
      );
    case "shippingMethodsSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "methods", label: "Shipping method" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "methods" },
          ]),
      );
    case "orderWorkflowStatusesSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "orderStatuses", label: "Order status" },
          { path: "fileStatuses", label: "File status" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "orderStatuses" },
            { path: "fileStatuses" },
          ]),
      );
    case "orderRulePresetsSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "presets", label: "Preset" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "presets" },
          ]),
      );
    case "unitsProofingSettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "units", label: "Unit" },
          { path: "proofingMethods", label: "Proofing method" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "units" },
            { path: "proofingMethods" },
          ]),
      );
    case "supportTaxonomySettings":
      return descriptor(
        kind,
        sourceRecord,
        taxonomyNameFields(sourceRecord, [
          { path: "complaintStatuses", label: "Complaint status" },
          { path: "noteCategories", label: "Note category" },
          { path: "notePriorities", label: "Note priority" },
        ]),
        (translation) =>
          normalizeTaxonomyNameTranslations(sourceRecord, translation, [
            { path: "complaintStatuses" },
            { path: "noteCategories" },
            { path: "notePriorities" },
          ]),
      );
    default:
      return descriptor(kind, sourceRecord, []);
  }
}
