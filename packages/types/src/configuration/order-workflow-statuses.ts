import type { BusinessTaxonomyDefinition } from "./business-taxonomy";

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
