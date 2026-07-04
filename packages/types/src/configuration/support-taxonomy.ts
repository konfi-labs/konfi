import type {
  BusinessTaxonomyDefinition,
  BusinessTaxonomySettings,
} from "./business-taxonomy";
import type { ComplaintStatusId } from "../orders/complaints/complaint";
import type { RmaRequestStatus } from "../orders/rma";
import type { NoteCategoryId, NotePriorityId } from "../notes";

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

export type RmaRequestStatusId = RmaRequestStatus | string;

export type RmaReasonCategoryId = string;

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
