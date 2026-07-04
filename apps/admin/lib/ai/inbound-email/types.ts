import type {
  Address,
  Attribute,
  Channel,
  Contact,
  FormattedOrderItem,
  Member,
  NestedCustomer,
  NestedMember,
  PaymentMethodId,
  Settings,
  ShippingMethodId,
} from "@konfi/types";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type { SenderAuthentication } from "./sender-auth";

export const INBOUND_EMAIL_BENCHMARK_TASK_TYPE = "inbound-email-routing";

export type InboundEmailStatus =
  | "received"
  | "processing"
  | "blocked"
  | "awaiting-manual-create"
  | "quote-created"
  | "order-created"
  | "failed";

export type InboundEmailRoutingOutcome = "blocked" | "order" | "quote";

export type InboundEmailBlockReason =
  | "ambiguous-customer"
  | "model-unclear"
  | "no-channel"
  | "no-forwarding-admin"
  | "no-product-request"
  | "spoof-looking"
  | "unknown-sender"
  | "untrusted-sender";

export interface ResendInboundAttachment {
  content_disposition?: string | null;
  content_id?: string | null;
  content_type?: string | null;
  filename?: string | null;
  id: string;
  size?: number | null;
}

export interface ResendInboundWebhookEvent {
  created_at: string;
  data: {
    attachments?: ResendInboundAttachment[];
    bcc?: string[];
    cc?: string[];
    created_at: string;
    email_id: string;
    from: string;
    message_id: string;
    subject?: string | null;
    to: string[];
  };
  type: "email.received";
}

export interface InboundEmailContent {
  headers: Record<string, string>;
  html?: string | null;
  text?: string | null;
}

export interface InboundEmailRecord {
  adminResponse?: {
    body: string;
    subject: string;
    to: string;
  } | null;
  id: string;
  adminRecipientEmail: string;
  attachments: ResendInboundAttachment[];
  bcc: string[];
  cc: string[];
  channelId: string;
  createdBy: NestedMember;
  eventCreatedAt: string;
  from: string;
  headers: Record<string, string>;
  html?: string | null;
  messageId: string;
  orderId?: string | null;
  quoteId?: string | null;
  resendEmailId: string;
  routingDecision?: InboundRoutingDecision | null;
  runId?: string | null;
  status: InboundEmailStatus;
  subject: string;
  tenantId?: string | null;
  text: string;
  to: string[];
}

export interface InboundEmailWorkflowInput {
  inboundEmailId: string;
}

export interface InboundEmailBenchmarkRoutingContext {
  items: FormattedOrderItem[];
  senderMatch: SenderMatchResult;
}

export interface InboundEmailWorkflowContext {
  benchmarkRoutingContext?: InboundEmailBenchmarkRoutingContext;
  channelId: string;
  sendAdminReply?: boolean;
}

export interface SenderMatchCandidate {
  customer: NestedCustomer;
  contact: Contact;
  matchField: "contact-email" | "customer-email";
}

export interface SenderMatchBlocked {
  candidates: SenderMatchCandidate[];
  reason: Exclude<
    InboundEmailBlockReason,
    | "model-unclear"
    | "no-channel"
    | "no-forwarding-admin"
    | "no-product-request"
    | "untrusted-sender"
  >;
  status: "blocked";
}

export interface SenderMatchExact {
  candidate: SenderMatchCandidate;
  candidates: SenderMatchCandidate[];
  status: "exact";
}

export type SenderMatchResult = SenderMatchBlocked | SenderMatchExact;

export interface InboundRoutingModelOutput {
  billingAddress: Address | null;
  deadlineString: string | null;
  invoiceRequested: boolean;
  missingInformation: string[];
  paymentType: PaymentMethodId | null;
  productRequest: string;
  rationale: string;
  requiredOrderFields: {
    itemsExplicit: boolean;
    paymentExplicit: boolean;
    shippingDestinationExplicit: boolean;
    shippingMethodExplicit: boolean;
  };
  responseDraft: {
    body: string;
    subject: string;
  };
  shippingAddress: Address | null;
  shippingOption: ShippingMethodId | null;
  specialNotes: string;
}

export interface InboundRecentCustomerOrder {
  createdAt: string | null;
  id: string;
  number: number | null;
  paymentType: PaymentMethodId | null;
  shippingAddress: Address | null;
  shippingOption: ShippingMethodId | null;
}

export interface InboundRoutingDecision {
  blockReason?: InboundEmailBlockReason;
  createdResourceId?: string | null;
  customer?: NestedCustomer;
  contact?: Contact;
  items: FormattedOrderItem[];
  missingInformation: string[];
  model: InboundRoutingModelOutput | null;
  outcome: InboundEmailRoutingOutcome;
  rationale: string;
  senderAuthentication: SenderAuthentication;
}

export interface InboundWorkflowResolution {
  collectedData?: QuoteAgentData;
  decision: InboundRoutingDecision;
  orderId?: string;
  quoteId?: string;
  response: {
    body: string;
    subject: string;
    to: string;
  };
}

export interface InboundEmailStartContext {
  attributes: Attribute[];
  channel: Channel | null;
  channelId: string;
  members: Member[];
  settings: Settings;
}
