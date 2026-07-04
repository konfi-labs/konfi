import type {
  Attribute,
  Contact,
  FormattedOrderItem,
  NestedCustomer,
  NestedMember,
  ShippingOptions,
} from "@konfi/types";

export type EmailOrderImportStatus =
  | "processing"
  | "followup-required"
  | "draft-ready"
  | "failed";

export type EmailOrderImportMode = "draft" | "followup";

export interface EmailOrderImportEmail {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  recipientEmails: string[];
  bodyText: string;
  bodyPreview: string;
  sentAt: string;
  receivedAt: string;
  hasAttachments: boolean;
}

export interface EmailOrderImportFollowUpDraft {
  subject: string;
  body: string;
  rationale?: string;
  missingInformation: string[];
}

export interface EmailOrderImportDraft {
  customer: NestedCustomer | string;
  contact: Contact;
  email: string;
  shippingOption: ShippingOptions;
  specialNotes: string;
  items: FormattedOrderItem[];
  mailLink: string;
}

export interface EmailOrderImportRecord {
  conversationId: string;
  emailId: string;
  mailLink: string;
  channelId: string;
  createdBy: NestedMember;
  requestedMode: EmailOrderImportMode;
  runId?: string | null;
  status: EmailOrderImportStatus;
  subject: string;
  emails: EmailOrderImportEmail[];
  orderDraft?: EmailOrderImportDraft | null;
  followUpEmail?: EmailOrderImportFollowUpDraft | null;
  error?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmailOrderImportWorkflowInput {
  importId: string;
  conversationId: string;
  emailId: string;
  mailLink: string;
  channelId: string;
  createdBy: NestedMember;
  requestedMode: EmailOrderImportMode;
  subject: string;
  emails: EmailOrderImportEmail[];
}

export interface EmailOrderImportWorkflowContext {
  channelId: string;
  attributes: Attribute[];
}
