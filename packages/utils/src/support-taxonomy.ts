import {
  ComplaintStatus,
  NoteCategory,
  NotePriority,
  RmaRequestStatus,
  type BusinessTaxonomyDefinition,
  type BusinessTaxonomySettings,
  type Locale,
  type SelectOption,
} from "@konfi/types";
import {
  createBusinessTaxonomyId,
  getConfigurableColorPalette,
  getConfigurableDefinition,
  getConfigurableDefinitionLabel,
  getConfigurableIcon,
  getConfigurableOptions,
  getEnabledConfigurableDefinitions,
  humanizeBusinessTaxonomyId,
  isValidBusinessTaxonomyId,
  normalizeConfigurableDefinitions,
  type TranslationFunction,
} from "./business-taxonomy";

export const SUPPORT_TAXONOMY_SETTINGS_DOC_ID = "supportTaxonomy";

export type ComplaintStatusId = string;
export type NoteCategoryId = string;
export type NotePriorityId = string;
export type RmaRequestStatusId = string;
export type RmaReasonCategoryId = string;

export interface SupportComplaintStatusDefinition extends BusinessTaxonomyDefinition {
  id: ComplaintStatusId;
  resolved: boolean;
  terminal: boolean;
}

export interface SupportNoteCategoryDefinition extends BusinessTaxonomyDefinition {
  id: NoteCategoryId;
}

export interface SupportNotePriorityDefinition extends BusinessTaxonomyDefinition {
  id: NotePriorityId;
  weight: number;
}

export interface SupportRmaStatusDefinition extends BusinessTaxonomyDefinition {
  id: RmaRequestStatusId;
  resolved: boolean;
  terminal: boolean;
}

export interface SupportRmaReasonCategoryDefinition extends BusinessTaxonomyDefinition {
  id: RmaReasonCategoryId;
}

export interface SupportTaxonomySettings extends Omit<
  BusinessTaxonomySettings<
    | SupportComplaintStatusDefinition
    | SupportNoteCategoryDefinition
    | SupportNotePriorityDefinition
    | SupportRmaReasonCategoryDefinition
    | SupportRmaStatusDefinition
  >,
  "definitions"
> {
  complaintStatuses: SupportComplaintStatusDefinition[];
  noteCategories: SupportNoteCategoryDefinition[];
  notePriorities: SupportNotePriorityDefinition[];
  rmaReasonCategories: SupportRmaReasonCategoryDefinition[];
  rmaStatuses: SupportRmaStatusDefinition[];
}

export const DEFAULT_COMPLAINT_STATUS_DEFINITIONS = [
  {
    id: ComplaintStatus.NEW,
    name: "New",
    icon: "fiber_new",
    colorPalette: "blue",
    resolved: false,
    terminal: false,
  },
  {
    id: ComplaintStatus.PROCESSING,
    name: "Processing",
    icon: "pending_actions",
    colorPalette: "orange",
    resolved: false,
    terminal: false,
  },
  {
    id: ComplaintStatus.RESOLVED,
    name: "Resolved",
    icon: "task_alt",
    colorPalette: "green",
    resolved: true,
    terminal: true,
  },
] as const satisfies readonly Omit<
  SupportComplaintStatusDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_NOTE_CATEGORY_DEFINITIONS = [
  {
    id: NoteCategory.GENERAL,
    name: "General",
    icon: "sticky_note_2",
    colorPalette: "gray",
  },
  {
    id: NoteCategory.CUSTOMER,
    name: "Customer",
    icon: "person",
    colorPalette: "blue",
  },
  {
    id: NoteCategory.ORDER,
    name: "Order",
    icon: "receipt_long",
    colorPalette: "primary",
  },
  {
    id: NoteCategory.PRODUCT,
    name: "Product",
    icon: "inventory_2",
    colorPalette: "purple",
  },
  {
    id: NoteCategory.INVOICE,
    name: "Invoice",
    icon: "request_quote",
    colorPalette: "cyan",
  },
  {
    id: NoteCategory.QUOTE,
    name: "Quote",
    icon: "format_quote",
    colorPalette: "teal",
  },
  {
    id: NoteCategory.PAYMENT,
    name: "Payment",
    icon: "payments",
    colorPalette: "green",
  },
  {
    id: NoteCategory.SHIPPING,
    name: "Shipping",
    icon: "local_shipping",
    colorPalette: "orange",
  },
  {
    id: NoteCategory.TASK,
    name: "Task",
    icon: "task",
    colorPalette: "yellow",
  },
  {
    id: NoteCategory.INTERNAL,
    name: "Internal",
    icon: "lock",
    colorPalette: "red",
  },
] as const satisfies readonly Omit<
  SupportNoteCategoryDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_NOTE_PRIORITY_DEFINITIONS = [
  {
    id: NotePriority.LOW,
    name: "Low",
    icon: "low_priority",
    colorPalette: "green",
    weight: 10,
  },
  {
    id: NotePriority.MEDIUM,
    name: "Medium",
    icon: "flag",
    colorPalette: "yellow",
    weight: 20,
  },
  {
    id: NotePriority.HIGH,
    name: "High",
    icon: "priority_high",
    colorPalette: "orange",
    weight: 30,
  },
  {
    id: NotePriority.URGENT,
    name: "Urgent",
    icon: "notification_important",
    colorPalette: "red",
    weight: 40,
  },
] as const satisfies readonly Omit<
  SupportNotePriorityDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_RMA_STATUS_DEFINITIONS = [
  {
    id: RmaRequestStatus.NEW,
    name: "New",
    icon: "fiber_new",
    colorPalette: "blue",
    resolved: false,
    terminal: false,
  },
  {
    id: RmaRequestStatus.UNDER_REVIEW,
    name: "Under Review",
    icon: "fact_check",
    colorPalette: "yellow",
    resolved: false,
    terminal: false,
  },
  {
    id: RmaRequestStatus.APPROVED,
    name: "Approved",
    icon: "thumb_up",
    colorPalette: "green",
    resolved: false,
    terminal: false,
  },
  {
    id: RmaRequestStatus.REJECTED,
    name: "Rejected",
    icon: "block",
    colorPalette: "red",
    resolved: true,
    terminal: true,
  },
  {
    id: RmaRequestStatus.COMPLETED,
    name: "Completed",
    icon: "task_alt",
    colorPalette: "green",
    resolved: true,
    terminal: true,
  },
  {
    id: RmaRequestStatus.CANCELED,
    name: "Canceled",
    icon: "cancel",
    colorPalette: "gray",
    resolved: true,
    terminal: true,
  },
] as const satisfies readonly Omit<
  SupportRmaStatusDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_RMA_REASON_CATEGORY_DEFINITIONS = [
  {
    id: "customer-file-issue",
    name: "Customer File Issue",
    icon: "draft",
    colorPalette: "yellow",
  },
  {
    id: "production-defect",
    name: "Production Defect",
    icon: "precision_manufacturing",
    colorPalette: "red",
  },
  {
    id: "shipping-damage",
    name: "Shipping Damage",
    icon: "local_shipping",
    colorPalette: "orange",
  },
  {
    id: "wrong-configuration",
    name: "Wrong Configuration",
    icon: "tune",
    colorPalette: "purple",
  },
  {
    id: "late-delivery",
    name: "Late Delivery",
    icon: "schedule",
    colorPalette: "cyan",
  },
  {
    id: "other",
    name: "Other",
    icon: "help",
    colorPalette: "gray",
  },
] as const satisfies readonly Omit<
  SupportRmaReasonCategoryDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_COMPLAINT_STATUS_IDS =
  DEFAULT_COMPLAINT_STATUS_DEFINITIONS.map((status) => status.id);
export const DEFAULT_NOTE_CATEGORY_IDS = DEFAULT_NOTE_CATEGORY_DEFINITIONS.map(
  (category) => category.id,
);
export const DEFAULT_NOTE_PRIORITY_IDS = DEFAULT_NOTE_PRIORITY_DEFINITIONS.map(
  (priority) => priority.id,
);
export const DEFAULT_RMA_STATUS_IDS = DEFAULT_RMA_STATUS_DEFINITIONS.map(
  (status) => status.id,
);
export const DEFAULT_RMA_REASON_CATEGORY_IDS =
  DEFAULT_RMA_REASON_CATEGORY_DEFINITIONS.map((category) => category.id);

const MAX_SUPPORT_TAXONOMY_ID_LENGTH = 80;
const COMPLAINT_STATUS_FALLBACK_ICON = "feedback";
const NOTE_CATEGORY_FALLBACK_ICON = "sticky_note_2";
const NOTE_PRIORITY_FALLBACK_ICON = "priority_high";
const RMA_STATUS_FALLBACK_ICON = "assignment_return";
const RMA_REASON_CATEGORY_FALLBACK_ICON = "report_problem";

function cloneDefaultDefinition<TDefinition extends BusinessTaxonomyDefinition>(
  definition: Omit<TDefinition, "enabled" | "order" | "archived" | "isDefault">,
  order: number,
): TDefinition {
  return {
    ...definition,
    archived: false,
    enabled: true,
    isDefault: true,
    order,
  } as TDefinition;
}

function normalizeComplaintStatus(
  status: SupportComplaintStatusDefinition,
): SupportComplaintStatusDefinition {
  const migratedColorPalette =
    status.id === ComplaintStatus.NEW && status.colorPalette === "primary"
      ? "blue"
      : status.colorPalette;

  return {
    ...status,
    colorPalette: migratedColorPalette,
    resolved: status.resolved === true,
    terminal: status.terminal === true || status.resolved === true,
  };
}

function normalizeNotePriority(
  priority: SupportNotePriorityDefinition,
): SupportNotePriorityDefinition {
  return {
    ...priority,
    weight: Number.isFinite(priority.weight) ? priority.weight : priority.order,
  };
}

function normalizeRmaStatus(
  status: SupportRmaStatusDefinition,
): SupportRmaStatusDefinition {
  const migratedColorPalette =
    status.id === RmaRequestStatus.NEW && status.colorPalette === "primary"
      ? "blue"
      : status.colorPalette;

  return {
    ...status,
    colorPalette: migratedColorPalette,
    resolved: status.resolved === true,
    terminal: status.terminal === true || status.resolved === true,
  };
}

export function createDefaultSupportTaxonomySettings(): SupportTaxonomySettings {
  return {
    complaintStatuses: DEFAULT_COMPLAINT_STATUS_DEFINITIONS.map(
      (status, index) =>
        cloneDefaultDefinition<SupportComplaintStatusDefinition>(status, index),
    ),
    noteCategories: DEFAULT_NOTE_CATEGORY_DEFINITIONS.map((category, index) =>
      cloneDefaultDefinition<SupportNoteCategoryDefinition>(category, index),
    ),
    notePriorities: DEFAULT_NOTE_PRIORITY_DEFINITIONS.map((priority, index) =>
      cloneDefaultDefinition<SupportNotePriorityDefinition>(priority, index),
    ),
    rmaReasonCategories: DEFAULT_RMA_REASON_CATEGORY_DEFINITIONS.map(
      (category, index) =>
        cloneDefaultDefinition<SupportRmaReasonCategoryDefinition>(
          category,
          index,
        ),
    ),
    rmaStatuses: DEFAULT_RMA_STATUS_DEFINITIONS.map((status, index) =>
      cloneDefaultDefinition<SupportRmaStatusDefinition>(status, index),
    ),
  };
}

export function isValidSupportTaxonomyId(value: unknown): value is string {
  return isValidBusinessTaxonomyId(value, MAX_SUPPORT_TAXONOMY_ID_LENGTH);
}

export function humanizeComplaintStatusId(id: ComplaintStatusId): string {
  return humanizeBusinessTaxonomyId(id, "Complaint Status");
}

export function humanizeNoteCategoryId(id: NoteCategoryId): string {
  return humanizeBusinessTaxonomyId(id, "Note Category");
}

export function humanizeNotePriorityId(id: NotePriorityId): string {
  return humanizeBusinessTaxonomyId(id, "Note Priority");
}

export function humanizeRmaRequestStatusId(id: RmaRequestStatusId): string {
  return humanizeBusinessTaxonomyId(id, "RMA Status");
}

export function humanizeRmaReasonCategoryId(id: RmaReasonCategoryId): string {
  return humanizeBusinessTaxonomyId(id, "RMA Reason Category");
}

export function createComplaintStatusId(
  name: string,
  existingIds: readonly ComplaintStatusId[] = [],
): ComplaintStatusId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "complaint-status",
    maxLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
  });
}

export function createNoteCategoryId(
  name: string,
  existingIds: readonly NoteCategoryId[] = [],
): NoteCategoryId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "note-category",
    maxLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
  });
}

export function createNotePriorityId(
  name: string,
  existingIds: readonly NotePriorityId[] = [],
): NotePriorityId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "note-priority",
    maxLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
  });
}

export function createRmaReasonCategoryId(
  name: string,
  existingIds: readonly RmaReasonCategoryId[] = [],
): RmaReasonCategoryId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "rma-reason",
    maxLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
  });
}

function normalizeComplaintStatuses(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportComplaintStatusDefinition[] {
  const defaults = createDefaultSupportTaxonomySettings();
  const sourceStatuses = Array.isArray(settings?.complaintStatuses)
    ? settings.complaintStatuses
    : [];

  return normalizeConfigurableDefinitions(
    defaults.complaintStatuses,
    sourceStatuses,
    {
      fallbackIcon: COMPLAINT_STATUS_FALLBACK_ICON,
      maxIdLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
    },
  ).map(normalizeComplaintStatus);
}

function normalizeNoteCategories(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNoteCategoryDefinition[] {
  const defaults = createDefaultSupportTaxonomySettings();
  const sourceCategories = Array.isArray(settings?.noteCategories)
    ? settings.noteCategories
    : [];

  return normalizeConfigurableDefinitions(
    defaults.noteCategories,
    sourceCategories,
    {
      fallbackIcon: NOTE_CATEGORY_FALLBACK_ICON,
      maxIdLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
    },
  );
}

function normalizeNotePriorities(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNotePriorityDefinition[] {
  const defaults = createDefaultSupportTaxonomySettings();
  const sourcePriorities = Array.isArray(settings?.notePriorities)
    ? settings.notePriorities
    : [];

  return normalizeConfigurableDefinitions(
    defaults.notePriorities,
    sourcePriorities,
    {
      fallbackIcon: NOTE_PRIORITY_FALLBACK_ICON,
      maxIdLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
    },
  ).map(normalizeNotePriority);
}

function normalizeRmaStatuses(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaStatusDefinition[] {
  const defaults = createDefaultSupportTaxonomySettings();
  const sourceStatuses = Array.isArray(settings?.rmaStatuses)
    ? settings.rmaStatuses
    : [];

  return normalizeConfigurableDefinitions(
    defaults.rmaStatuses,
    sourceStatuses,
    {
      fallbackIcon: RMA_STATUS_FALLBACK_ICON,
      maxIdLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
    },
  ).map(normalizeRmaStatus);
}

function normalizeRmaReasonCategories(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaReasonCategoryDefinition[] {
  const defaults = createDefaultSupportTaxonomySettings();
  const sourceCategories = Array.isArray(settings?.rmaReasonCategories)
    ? settings.rmaReasonCategories
    : [];

  return normalizeConfigurableDefinitions(
    defaults.rmaReasonCategories,
    sourceCategories,
    {
      fallbackIcon: RMA_REASON_CATEGORY_FALLBACK_ICON,
      maxIdLength: MAX_SUPPORT_TAXONOMY_ID_LENGTH,
    },
  );
}

export function normalizeSupportTaxonomySettings(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportTaxonomySettings {
  return {
    ...settings,
    complaintStatuses: normalizeComplaintStatuses(settings),
    noteCategories: normalizeNoteCategories(settings),
    notePriorities: normalizeNotePriorities(settings),
    rmaReasonCategories: normalizeRmaReasonCategories(settings),
    rmaStatuses: normalizeRmaStatuses(settings),
  };
}

export function hasMissingSupportTaxonomyDefaults(
  settings: Partial<SupportTaxonomySettings> | null,
): boolean {
  const complaintStatusIds = new Set(
    settings?.complaintStatuses?.map((status) => status.id) ?? [],
  );
  const noteCategoryIds = new Set(
    settings?.noteCategories?.map((category) => category.id) ?? [],
  );
  const notePriorityIds = new Set(
    settings?.notePriorities?.map((priority) => priority.id) ?? [],
  );
  const rmaReasonCategoryIds = new Set(
    settings?.rmaReasonCategories?.map((category) => category.id) ?? [],
  );
  const rmaStatusIds = new Set(
    settings?.rmaStatuses?.map((status) => status.id) ?? [],
  );

  return (
    DEFAULT_COMPLAINT_STATUS_IDS.some((id) => !complaintStatusIds.has(id)) ||
    DEFAULT_NOTE_CATEGORY_IDS.some((id) => !noteCategoryIds.has(id)) ||
    DEFAULT_NOTE_PRIORITY_IDS.some((id) => !notePriorityIds.has(id)) ||
    DEFAULT_RMA_REASON_CATEGORY_IDS.some(
      (id) => !rmaReasonCategoryIds.has(id),
    ) ||
    DEFAULT_RMA_STATUS_IDS.some((id) => !rmaStatusIds.has(id))
  );
}

export function getComplaintStatusDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportComplaintStatusDefinition[] {
  return normalizeSupportTaxonomySettings(settings).complaintStatuses;
}

export function getEnabledComplaintStatusDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportComplaintStatusDefinition[] {
  return getEnabledConfigurableDefinitions(
    getComplaintStatusDefinitions(settings),
  );
}

export function getComplaintStatusOptions(
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getComplaintStatusDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "ComplaintStatus",
  });
}

export function getComplaintStatusDefinition(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportComplaintStatusDefinition | undefined {
  return getConfigurableDefinition(id, getComplaintStatusDefinitions(settings));
}

export function getComplaintStatusLabel(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getComplaintStatusDefinitions(settings),
    {
      fallback: humanizeComplaintStatusId(id),
      locale,
      t,
      translationKeyPrefix: "ComplaintStatus",
    },
  );
}

export function getComplaintStatusColorPalette(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getComplaintStatusDefinitions(settings),
  );
}

export function getComplaintStatusIcon(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getComplaintStatusDefinitions(settings),
    COMPLAINT_STATUS_FALLBACK_ICON,
  );
}

export function getOpenComplaintStatusIds(
  settings?: Partial<SupportTaxonomySettings> | null,
): ComplaintStatusId[] {
  return getEnabledComplaintStatusDefinitions(settings)
    .filter((status) => !status.resolved && !status.terminal)
    .map((status) => status.id);
}

export function isComplaintStatusResolved(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): boolean {
  return getComplaintStatusDefinition(id, settings)?.resolved === true;
}

export function isComplaintStatusTerminal(
  id: ComplaintStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): boolean {
  return getComplaintStatusDefinition(id, settings)?.terminal === true;
}

export function getNoteCategoryDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNoteCategoryDefinition[] {
  return normalizeSupportTaxonomySettings(settings).noteCategories;
}

export function getEnabledNoteCategoryDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNoteCategoryDefinition[] {
  return getEnabledConfigurableDefinitions(
    getNoteCategoryDefinitions(settings),
  );
}

export function getNoteCategoryOptions(
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getNoteCategoryDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "NoteCategory",
  });
}

export function getNoteCategoryDefinition(
  id: NoteCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNoteCategoryDefinition | undefined {
  return getConfigurableDefinition(id, getNoteCategoryDefinitions(settings));
}

export function getNoteCategoryLabel(
  id: NoteCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getNoteCategoryDefinitions(settings),
    {
      fallback: humanizeNoteCategoryId(id),
      locale,
      t,
      translationKeyPrefix: "NoteCategory",
    },
  );
}

export function getNoteCategoryColorPalette(
  id: NoteCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableColorPalette(id, getNoteCategoryDefinitions(settings));
}

export function getNoteCategoryIcon(
  id: NoteCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getNoteCategoryDefinitions(settings),
    NOTE_CATEGORY_FALLBACK_ICON,
  );
}

export function getNotePriorityDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNotePriorityDefinition[] {
  return normalizeSupportTaxonomySettings(settings).notePriorities;
}

export function getEnabledNotePriorityDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNotePriorityDefinition[] {
  return getEnabledConfigurableDefinitions(
    getNotePriorityDefinitions(settings),
  );
}

export function getNotePriorityDefinitionsByWeight(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNotePriorityDefinition[] {
  const sorted: SupportNotePriorityDefinition[] = [];

  for (const priority of getEnabledNotePriorityDefinitions(settings)) {
    const index = sorted.findIndex(
      (existing) =>
        priority.weight > existing.weight ||
        (priority.weight === existing.weight &&
          priority.order < existing.order) ||
        (priority.weight === existing.weight &&
          priority.order === existing.order &&
          priority.name.localeCompare(existing.name) < 0),
    );

    if (index === -1) {
      sorted.push(priority);
    } else {
      sorted.splice(index, 0, priority);
    }
  }

  return sorted;
}

export function getNotePriorityOptions(
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getNotePriorityDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "NotePriority",
  });
}

export function getNotePriorityDefinition(
  id: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportNotePriorityDefinition | undefined {
  return getConfigurableDefinition(id, getNotePriorityDefinitions(settings));
}

export function getNotePriorityLabel(
  id: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getNotePriorityDefinitions(settings),
    {
      fallback: humanizeNotePriorityId(id),
      locale,
      t,
      translationKeyPrefix: "NotePriority",
    },
  );
}

export function getNotePriorityColorPalette(
  id: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableColorPalette(id, getNotePriorityDefinitions(settings));
}

export function getNotePriorityIcon(
  id: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getNotePriorityDefinitions(settings),
    NOTE_PRIORITY_FALLBACK_ICON,
  );
}

export function getNotePriorityWeight(
  id: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
): number {
  return getNotePriorityDefinition(id, settings)?.weight ?? 0;
}

export function compareNotePriorityIdsByWeight(
  left: NotePriorityId,
  right: NotePriorityId,
  settings?: Partial<SupportTaxonomySettings> | null,
): number {
  return (
    getNotePriorityWeight(right, settings) -
      getNotePriorityWeight(left, settings) ||
    humanizeNotePriorityId(left).localeCompare(humanizeNotePriorityId(right))
  );
}

export function getRmaStatusDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaStatusDefinition[] {
  return normalizeSupportTaxonomySettings(settings).rmaStatuses;
}

export function getEnabledRmaStatusDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaStatusDefinition[] {
  return getEnabledConfigurableDefinitions(getRmaStatusDefinitions(settings));
}

export function getRmaStatusOptions(
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getRmaStatusDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "RmaRequestStatus",
  });
}

export function getRmaStatusDefinition(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaStatusDefinition | undefined {
  return getConfigurableDefinition(id, getRmaStatusDefinitions(settings));
}

export function getRmaStatusLabel(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(id, getRmaStatusDefinitions(settings), {
    fallback: humanizeRmaRequestStatusId(id),
    locale,
    t,
    translationKeyPrefix: "RmaRequestStatus",
  });
}

export function getRmaStatusColorPalette(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableColorPalette(id, getRmaStatusDefinitions(settings));
}

export function getRmaStatusIcon(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getRmaStatusDefinitions(settings),
    RMA_STATUS_FALLBACK_ICON,
  );
}

export function isRmaStatusResolved(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): boolean {
  return getRmaStatusDefinition(id, settings)?.resolved === true;
}

export function isRmaStatusTerminal(
  id: RmaRequestStatusId,
  settings?: Partial<SupportTaxonomySettings> | null,
): boolean {
  return getRmaStatusDefinition(id, settings)?.terminal === true;
}

export function getRmaReasonCategoryDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaReasonCategoryDefinition[] {
  return normalizeSupportTaxonomySettings(settings).rmaReasonCategories;
}

export function getEnabledRmaReasonCategoryDefinitions(
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaReasonCategoryDefinition[] {
  return getEnabledConfigurableDefinitions(
    getRmaReasonCategoryDefinitions(settings),
  );
}

export function getRmaReasonCategoryOptions(
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getRmaReasonCategoryDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "RmaReasonCategory",
  });
}

export function getRmaReasonCategoryDefinition(
  id: RmaReasonCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): SupportRmaReasonCategoryDefinition | undefined {
  return getConfigurableDefinition(
    id,
    getRmaReasonCategoryDefinitions(settings),
  );
}

export function getRmaReasonCategoryLabel(
  id: RmaReasonCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getRmaReasonCategoryDefinitions(settings),
    {
      fallback: humanizeRmaReasonCategoryId(id),
      locale,
      t,
      translationKeyPrefix: "RmaReasonCategory",
    },
  );
}

export function getRmaReasonCategoryColorPalette(
  id: RmaReasonCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getRmaReasonCategoryDefinitions(settings),
  );
}

export function getRmaReasonCategoryIcon(
  id: RmaReasonCategoryId,
  settings?: Partial<SupportTaxonomySettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getRmaReasonCategoryDefinitions(settings),
    RMA_REASON_CATEGORY_FALLBACK_ICON,
  );
}
