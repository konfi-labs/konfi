import type {
  BusinessTaxonomyDefinition,
  Locale,
  SelectOption,
} from "@konfi/types";
import { OrderFilesStatus, OrderStatus } from "@konfi/types";
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

export type OrderWorkflowStatusId = string;
export type OrderFileStatusId = string;

export interface OrderWorkflowStatusDefinition extends BusinessTaxonomyDefinition {
  isInitial: boolean;
  isDraft: boolean;
  isTerminal: boolean;
  countsAsActive: boolean;
  blocksActions: boolean;
  readyForPickup: boolean;
  fulfilled: boolean;
  canceled: boolean;
  sendCustomerEmail: boolean;
  kanbanColumn: boolean;
  startsInternalTransit: boolean;
}

export interface OrderFileStatusDefinition extends BusinessTaxonomyDefinition {
  isInitial: boolean;
  isTerminal: boolean;
  blocksActions: boolean;
  requiresCustomerFiles: boolean;
  requiresCustomerApproval: boolean;
  underDesign: boolean;
  readyForVerification: boolean;
  readyForPreparation: boolean;
  filesReady: boolean;
  allowsProduction: boolean;
}

export interface OrderWorkflowStatusesSettings {
  orderStatuses: OrderWorkflowStatusDefinition[];
  fileStatuses: OrderFileStatusDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}

export const ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID = "orderWorkflowStatuses";

const FALLBACK_ORDER_STATUS_ICON = "fact_check";
const FALLBACK_FILE_STATUS_ICON = "draft";
const MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH = 80;

export const DEFAULT_ORDER_WORKFLOW_STATUS_DEFINITIONS = [
  {
    id: OrderStatus.NEW,
    name: "New",
    icon: "fiber_new",
    colorPalette: "blue",
    isInitial: true,
    isDraft: false,
    isTerminal: false,
    countsAsActive: true,
    blocksActions: false,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: false,
    kanbanColumn: true,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.UNDER_REVIEW,
    name: "Under Review",
    icon: "rate_review",
    colorPalette: "yellow",
    isInitial: false,
    isDraft: false,
    isTerminal: false,
    countsAsActive: true,
    blocksActions: false,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: false,
    kanbanColumn: false,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.IN_PROGRESS,
    name: "In Progress",
    icon: "manufacturing",
    colorPalette: "orange",
    isInitial: false,
    isDraft: false,
    isTerminal: false,
    countsAsActive: true,
    blocksActions: false,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: true,
    kanbanColumn: true,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.WAITING_FOR_MATERIALS,
    name: "Waiting For Materials",
    icon: "inventory_2",
    colorPalette: "purple",
    isInitial: false,
    isDraft: false,
    isTerminal: false,
    countsAsActive: true,
    blocksActions: false,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: false,
    kanbanColumn: false,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.DELAYED,
    name: "Delayed",
    icon: "warning",
    colorPalette: "red",
    isInitial: false,
    isDraft: false,
    isTerminal: false,
    countsAsActive: true,
    blocksActions: false,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: true,
    kanbanColumn: false,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.READY,
    name: "Ready",
    icon: "task_alt",
    colorPalette: "green",
    isInitial: false,
    isDraft: false,
    isTerminal: false,
    countsAsActive: false,
    blocksActions: false,
    readyForPickup: true,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: true,
    kanbanColumn: true,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.FULFILLED,
    name: "Fulfilled",
    icon: "done_all",
    colorPalette: "gray",
    isInitial: false,
    isDraft: false,
    isTerminal: true,
    countsAsActive: false,
    blocksActions: true,
    readyForPickup: false,
    fulfilled: true,
    canceled: false,
    sendCustomerEmail: false,
    kanbanColumn: true,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.CANCELED,
    name: "Canceled",
    icon: "cancel",
    colorPalette: "red",
    isInitial: false,
    isDraft: false,
    isTerminal: true,
    countsAsActive: false,
    blocksActions: true,
    readyForPickup: false,
    fulfilled: false,
    canceled: true,
    sendCustomerEmail: true,
    kanbanColumn: false,
    startsInternalTransit: false,
  },
  {
    id: OrderStatus.DRAFT,
    name: "Draft",
    icon: "draft",
    colorPalette: "gray",
    isInitial: false,
    isDraft: true,
    isTerminal: false,
    countsAsActive: false,
    blocksActions: true,
    readyForPickup: false,
    fulfilled: false,
    canceled: false,
    sendCustomerEmail: false,
    kanbanColumn: false,
    startsInternalTransit: false,
  },
] as const satisfies readonly Omit<
  OrderWorkflowStatusDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_ORDER_FILE_STATUS_DEFINITIONS = [
  {
    id: OrderFilesStatus.WAITING_FOR_FILES,
    name: "Waiting For Files",
    icon: "upload_file",
    colorPalette: "orange",
    isInitial: true,
    isTerminal: false,
    blocksActions: true,
    requiresCustomerFiles: true,
    requiresCustomerApproval: false,
    underDesign: false,
    readyForVerification: false,
    readyForPreparation: false,
    filesReady: false,
    allowsProduction: false,
  },
  {
    id: OrderFilesStatus.WAITING_FOR_FILES_APPROVAL,
    name: "Waiting For Files Approval",
    icon: "approval",
    colorPalette: "orange",
    isInitial: false,
    isTerminal: false,
    blocksActions: true,
    requiresCustomerFiles: false,
    requiresCustomerApproval: true,
    underDesign: false,
    readyForVerification: false,
    readyForPreparation: false,
    filesReady: false,
    allowsProduction: false,
  },
  {
    id: OrderFilesStatus.UNDER_DESIGN,
    name: "Under Design",
    icon: "design_services",
    colorPalette: "orange",
    isInitial: false,
    isTerminal: false,
    blocksActions: true,
    requiresCustomerFiles: false,
    requiresCustomerApproval: false,
    underDesign: true,
    readyForVerification: false,
    readyForPreparation: false,
    filesReady: false,
    allowsProduction: false,
  },
  {
    id: OrderFilesStatus.FOR_VERIFICATION,
    name: "For Verification",
    icon: "fact_check",
    colorPalette: "orange",
    isInitial: false,
    isTerminal: false,
    blocksActions: false,
    requiresCustomerFiles: false,
    requiresCustomerApproval: false,
    underDesign: false,
    readyForVerification: true,
    readyForPreparation: false,
    filesReady: false,
    allowsProduction: false,
  },
  {
    id: OrderFilesStatus.FOR_PREPARATION,
    name: "For Preparation",
    icon: "build",
    colorPalette: "orange",
    isInitial: false,
    isTerminal: false,
    blocksActions: false,
    requiresCustomerFiles: false,
    requiresCustomerApproval: false,
    underDesign: false,
    readyForVerification: false,
    readyForPreparation: true,
    filesReady: false,
    allowsProduction: false,
  },
  {
    id: OrderFilesStatus.FILES_ARE_READY,
    name: "Files Are Ready",
    icon: "task",
    colorPalette: "gray",
    isInitial: false,
    isTerminal: true,
    blocksActions: false,
    requiresCustomerFiles: false,
    requiresCustomerApproval: false,
    underDesign: false,
    readyForVerification: false,
    readyForPreparation: false,
    filesReady: true,
    allowsProduction: true,
  },
] as const satisfies readonly Omit<
  OrderFileStatusDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_ORDER_WORKFLOW_STATUS_IDS =
  DEFAULT_ORDER_WORKFLOW_STATUS_DEFINITIONS.map((status) => status.id);

export const DEFAULT_ORDER_FILE_STATUS_IDS =
  DEFAULT_ORDER_FILE_STATUS_DEFINITIONS.map((status) => status.id);

function cloneDefaultOrderStatus(
  status: (typeof DEFAULT_ORDER_WORKFLOW_STATUS_DEFINITIONS)[number],
  order: number,
): OrderWorkflowStatusDefinition {
  return {
    ...status,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

function cloneDefaultFileStatus(
  status: (typeof DEFAULT_ORDER_FILE_STATUS_DEFINITIONS)[number],
  order: number,
): OrderFileStatusDefinition {
  return {
    ...status,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

export function createDefaultOrderWorkflowStatusesSettings(): OrderWorkflowStatusesSettings {
  return {
    orderStatuses: DEFAULT_ORDER_WORKFLOW_STATUS_DEFINITIONS.map(
      (status, index) => cloneDefaultOrderStatus(status, index),
    ),
    fileStatuses: DEFAULT_ORDER_FILE_STATUS_DEFINITIONS.map((status, index) =>
      cloneDefaultFileStatus(status, index),
    ),
  };
}

export function isValidOrderWorkflowStatusId(
  value: unknown,
): value is OrderWorkflowStatusId {
  return isValidBusinessTaxonomyId(value, MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH);
}

export function isValidOrderFileStatusId(
  value: unknown,
): value is OrderFileStatusId {
  return isValidBusinessTaxonomyId(value, MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH);
}

export function humanizeOrderWorkflowStatusId(
  id: OrderWorkflowStatusId,
): string {
  return humanizeBusinessTaxonomyId(id, "Order Status");
}

export function humanizeOrderFileStatusId(id: OrderFileStatusId): string {
  return humanizeBusinessTaxonomyId(id, "File Status");
}

export function createOrderWorkflowStatusId(
  name: string,
  existingIds: readonly OrderWorkflowStatusId[] = [],
): OrderWorkflowStatusId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "order-status",
    maxLength: MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH,
  });
}

export function createOrderFileStatusId(
  name: string,
  existingIds: readonly OrderFileStatusId[] = [],
): OrderFileStatusId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "file-status",
    maxLength: MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH,
  });
}

function ensureOrderStatusSemantics(
  status: OrderWorkflowStatusDefinition,
): OrderWorkflowStatusDefinition {
  const migratedColorPalette =
    status.id === OrderStatus.NEW && status.colorPalette === "primary"
      ? "blue"
      : status.colorPalette;

  return {
    ...status,
    colorPalette: migratedColorPalette,
    isInitial: status.isInitial === true,
    isDraft: status.isDraft === true,
    isTerminal: status.isTerminal === true,
    countsAsActive: status.countsAsActive === true,
    blocksActions: status.blocksActions === true,
    readyForPickup: status.readyForPickup === true,
    fulfilled: status.fulfilled === true,
    canceled: status.canceled === true,
    sendCustomerEmail: status.sendCustomerEmail === true,
    kanbanColumn: status.kanbanColumn === true,
    startsInternalTransit: status.startsInternalTransit === true,
  };
}

function ensureFileStatusSemantics(
  status: OrderFileStatusDefinition,
): OrderFileStatusDefinition {
  const migratedColorPalette =
    status.id === OrderFilesStatus.FILES_ARE_READY &&
    status.colorPalette === "green"
      ? "gray"
      : status.colorPalette;

  return {
    ...status,
    colorPalette: migratedColorPalette,
    isInitial: status.isInitial === true,
    isTerminal: status.isTerminal === true,
    blocksActions: status.blocksActions === true,
    requiresCustomerFiles: status.requiresCustomerFiles === true,
    requiresCustomerApproval: status.requiresCustomerApproval === true,
    underDesign: status.underDesign === true,
    readyForVerification: status.readyForVerification === true,
    readyForPreparation: status.readyForPreparation === true,
    filesReady: status.filesReady === true,
    allowsProduction: status.allowsProduction === true,
  };
}

export function normalizeOrderWorkflowStatusesSettings(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusesSettings {
  const defaults = createDefaultOrderWorkflowStatusesSettings();
  const sourceOrderStatuses = Array.isArray(settings?.orderStatuses)
    ? settings.orderStatuses
    : [];
  const sourceFileStatuses = Array.isArray(settings?.fileStatuses)
    ? settings.fileStatuses
    : [];

  return {
    ...settings,
    orderStatuses: normalizeConfigurableDefinitions(
      defaults.orderStatuses,
      sourceOrderStatuses,
      {
        fallbackIcon: FALLBACK_ORDER_STATUS_ICON,
        maxIdLength: MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH,
      },
    ).map(ensureOrderStatusSemantics),
    fileStatuses: normalizeConfigurableDefinitions(
      defaults.fileStatuses,
      sourceFileStatuses,
      {
        fallbackIcon: FALLBACK_FILE_STATUS_ICON,
        maxIdLength: MAX_ORDER_WORKFLOW_STATUS_ID_LENGTH,
      },
    ).map(ensureFileStatusSemantics),
  };
}

export function hasMissingDefaultOrderWorkflowStatuses(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  if (!settings) {
    return true;
  }

  const orderStatusIds = new Set(
    Array.isArray(settings.orderStatuses)
      ? settings.orderStatuses.map((status) => status.id)
      : [],
  );
  const fileStatusIds = new Set(
    Array.isArray(settings.fileStatuses)
      ? settings.fileStatuses.map((status) => status.id)
      : [],
  );

  return (
    DEFAULT_ORDER_WORKFLOW_STATUS_IDS.some((id) => !orderStatusIds.has(id)) ||
    DEFAULT_ORDER_FILE_STATUS_IDS.some((id) => !fileStatusIds.has(id))
  );
}

export function getOrderWorkflowStatusDefinitions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusDefinition[] {
  return normalizeOrderWorkflowStatusesSettings(settings).orderStatuses;
}

export function getOrderFileStatusDefinitions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusDefinition[] {
  return normalizeOrderWorkflowStatusesSettings(settings).fileStatuses;
}

export function getEnabledOrderWorkflowStatusDefinitions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusDefinition[] {
  return getEnabledConfigurableDefinitions(
    getOrderWorkflowStatusDefinitions(settings),
  );
}

export function getEnabledOrderFileStatusDefinitions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusDefinition[] {
  return getEnabledConfigurableDefinitions(
    getOrderFileStatusDefinitions(settings),
  );
}

export function getOrderWorkflowStatusOptions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getOrderWorkflowStatusDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "OrderStatus",
  });
}

export function getOrderFileStatusOptions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getOrderFileStatusDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "OrderFilesStatus",
  });
}

export function getOrderWorkflowStatusDefinition(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusDefinition | undefined {
  return getConfigurableDefinition(
    id,
    getOrderWorkflowStatusDefinitions(settings),
  );
}

export function getOrderFileStatusDefinition(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusDefinition | undefined {
  return getConfigurableDefinition(id, getOrderFileStatusDefinitions(settings));
}

export function getOrderWorkflowStatusLabel(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getOrderWorkflowStatusDefinitions(settings),
    {
      fallback: humanizeOrderWorkflowStatusId(id),
      locale,
      t,
      translationKeyPrefix: "OrderStatus",
    },
  );
}

export function getOrderFileStatusLabel(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getOrderFileStatusDefinitions(settings),
    {
      fallback: humanizeOrderFileStatusId(id),
      locale,
      t,
      translationKeyPrefix: "OrderFilesStatus",
    },
  );
}

export function getOrderWorkflowStatusColorPalette(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getOrderWorkflowStatusDefinitions(settings),
  );
}

export function getOrderFileStatusColorPalette(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getOrderFileStatusDefinitions(settings),
  );
}

export function getOrderWorkflowStatusIcon(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getOrderWorkflowStatusDefinitions(settings),
    FALLBACK_ORDER_STATUS_ICON,
  );
}

export function getOrderFileStatusIcon(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getOrderFileStatusDefinitions(settings),
    FALLBACK_FILE_STATUS_ICON,
  );
}

export function getKnownOrderWorkflowStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusId[] {
  return getOrderWorkflowStatusDefinitions(settings).map((status) => status.id);
}

export function getKnownOrderFileStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusId[] {
  return getOrderFileStatusDefinitions(settings).map((status) => status.id);
}

export function getActiveOrderWorkflowStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusId[] {
  return getEnabledOrderWorkflowStatusDefinitions(settings).map(
    (status) => status.id,
  );
}

export function getActiveOrderFileStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderFileStatusId[] {
  return getEnabledOrderFileStatusDefinitions(settings).map(
    (status) => status.id,
  );
}

export function getProcessingQueueOrderStatusIds(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusId[] {
  return getEnabledOrderWorkflowStatusDefinitions(settings)
    .filter((status) => status.countsAsActive)
    .map((status) => status.id);
}

export function getOrderWorkflowKanbanStatusDefinitions(
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): OrderWorkflowStatusDefinition[] {
  return getEnabledOrderWorkflowStatusDefinitions(settings).filter(
    (status) => status.kanbanColumn,
  );
}

export function isOrderWorkflowStatusTerminal(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderWorkflowStatusDefinition(id, settings)?.isTerminal === true;
}

export function shouldShowOrderFulfillmentStatus(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  const status = getOrderWorkflowStatusDefinition(id, settings);

  if (!status) {
    return true;
  }

  return !(
    status.isTerminal ||
    status.isDraft ||
    status.fulfilled ||
    status.canceled
  );
}

export function doesOrderWorkflowStatusBlockActions(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderWorkflowStatusDefinition(id, settings)?.blocksActions === true;
}

export function isOrderWorkflowStatusReadyForPickup(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return (
    getOrderWorkflowStatusDefinition(id, settings)?.readyForPickup === true
  );
}

export function doesOrderWorkflowStatusStartInternalTransit(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return (
    getOrderWorkflowStatusDefinition(id, settings)?.startsInternalTransit ===
    true
  );
}

export function isOrderWorkflowStatusFulfilled(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderWorkflowStatusDefinition(id, settings)?.fulfilled === true;
}

export function isOrderWorkflowStatusCanceled(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderWorkflowStatusDefinition(id, settings)?.canceled === true;
}

export function shouldSendCustomerEmailForOrderWorkflowStatus(
  id: OrderWorkflowStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return (
    getOrderWorkflowStatusDefinition(id, settings)?.sendCustomerEmail === true
  );
}

export function getOrderFileStatusSortOrder(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): number {
  return (
    getOrderFileStatusDefinition(id, settings)?.order ?? Number.MAX_SAFE_INTEGER
  );
}

export function doesOrderFileStatusBlockActions(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderFileStatusDefinition(id, settings)?.blocksActions === true;
}

export function isOrderFileStatusReady(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderFileStatusDefinition(id, settings)?.filesReady === true;
}

export function allowsOrderFileProduction(
  id: OrderFileStatusId,
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
): boolean {
  return getOrderFileStatusDefinition(id, settings)?.allowsProduction === true;
}
