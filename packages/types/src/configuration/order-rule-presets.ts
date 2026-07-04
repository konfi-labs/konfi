import type { BusinessTaxonomyDefinition } from "./business-taxonomy";
import type { OrderWorkflowStatusId } from "./order-workflow-statuses";
import type { PrintingMethodId } from "./printing-methods";

export interface OrderRulePresetDefinition extends BusinessTaxonomyDefinition {
  statusIds: OrderWorkflowStatusId[];
  printingMethodIds: PrintingMethodId[];
}

export interface OrderRulePresetsSettings {
  presets: OrderRulePresetDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
