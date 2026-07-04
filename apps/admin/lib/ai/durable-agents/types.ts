import type {
  AgentTaskType,
  NestedMember,
  NestedCustomer,
  Contact,
  Address,
  PaymentMethodId,
  PreflightIssue,
  ShippingMethodId,
  UnitId,
  IDiscount,
  FormattedProduct,
} from "@konfi/types";

export type { AgentTaskType };

/**
 * Status of a durable agent run
 */
export type AgentStatus =
  | "pending" // Agent created but not started
  | "processing" // Agent is actively working
  | "awaiting-approval" // Agent needs human confirmation
  | "approved" // User approved the result
  | "rejected" // User rejected the result
  | "completed" // Agent finished successfully
  | "failed"; // Agent encountered an error

/**
 * A single step/action taken by the agent
 */
export interface AgentStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

/**
 * A simplified order item for agent use.
 * Will be converted to full OrderItem when creating the quote.
 */
export interface AgentOrderItem {
  id: string;
  productId: string;
  productName: string;
  productSnapshot?: Partial<FormattedProduct>;
  description: string;
  combination?: Record<string, string>;
  calculatedCombination?: string;
  customFormat: boolean;
  quantity: number;
  volume?: number;
  width?: number;
  height?: number;
  totalPrice: number;
  customPrice: number | null;
  discount: IDiscount;
  unit: UnitId;
  customSizes?: { width: number; height: number; quantity: number }[];
  expressPercent?: number;
}

export interface AgentFileMetadataPage {
  heightMm?: number | null;
  heightPx?: number | null;
  pageNumber: number;
  widthMm?: number | null;
  widthPx?: number | null;
}

export interface AgentFileMetadata {
  contentType: string;
  error?: string;
  filename: string;
  pageCount: number;
  pages: AgentFileMetadataPage[];
  pagesTruncated?: boolean;
  preflightIssues?: PreflightIssue[];
  sizeBytes: number;
}

/**
 * Quote data collected by the agent
 */
export interface QuoteAgentData {
  customer?: NestedCustomer | string;
  contact?: Contact;
  items?: AgentOrderItem[];
  paymentType?: PaymentMethodId | null;
  shippingOption?: ShippingMethodId | null;
  specialNotes?: string;
  totalPrice?: number;
  shippingPrice?: number;
}

export interface AgentRecentCustomerOrder {
  createdAt: string | null;
  id: string;
  number: number | null;
  paymentType: PaymentMethodId | null;
  shippingAddress: Address | null;
  shippingOption: ShippingMethodId | null;
}

/**
 * Input parameters for creating a quote agent
 */
export interface CreateQuoteAgentInput {
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
}

/**
 * A durable agent run record
 */
export interface AgentRun {
  id: string;
  taskType: AgentTaskType;
  status: AgentStatus;
  prompt: string;
  createdBy: NestedMember;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  steps: AgentStep[];
  data?: QuoteAgentData;
  result?: unknown;
  error?: string;
  estimatedTimeLeft?: number; // in seconds
  progress?: number; // 0-100
}

/**
 * Approval payload for human-in-the-loop
 */
export interface ApprovalPayload {
  approved: boolean;
  comment?: string;
}

/**
 * Response from starting an agent
 */
export interface StartAgentResponse {
  runId: string;
  status: AgentStatus;
}

/**
 * Response from approving/rejecting an agent
 */
export interface ApproveAgentResponse {
  success: boolean;
  quoteId?: string;
  error?: string;
}

/**
 * Context passed to agent tools
 */
export interface AgentToolContext {
  channelId: string;
  runId: string;
  createdBy: NestedMember;
}

/**
 * Message type for real-time agent updates
 */
export interface AgentUpdateMessage {
  type: "status" | "step" | "progress" | "data" | "error" | "complete";
  runId: string;
  payload: Partial<AgentRun>;
}
