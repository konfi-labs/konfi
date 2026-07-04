import { Base } from "../../base";

export enum ComplaintStatus {
  NEW = "NEW",
  PROCESSING = "PROCESSING",
  RESOLVED = "RESOLVED",
}

export type ComplaintStatusId = string;

export interface Complaint extends Omit<Base, "name"> {
  orderId: string;
  channelId: string;
  orderItemIds: string[];
  description: string;
  rmaRequestIds?: string[];
  status: ComplaintStatusId;
  carriedOutBy: string[];
}

export interface ComplaintCreate extends Complaint {}

export interface ComplaintCreateForm extends Omit<
  ComplaintCreate,
  | "id"
  | "orderId"
  | "channelId"
  | "createdAt"
  | "updatedAt"
  | "updatedBy"
  | "rmaRequestIds"
> {}

export interface ComplaintUpdate extends Omit<
  Complaint,
  | "id"
  | "orderId"
  | "channelId"
  | "createdAt"
  | "createdBy"
  | "orderId"
  | "active"
  | "rmaRequestIds"
> {}

export interface ComplaintUpdateForm extends Omit<
  ComplaintUpdate,
  "updatedAt"
> {}
