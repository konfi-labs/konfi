/**
 * Microsoft Graph API Types
 */

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface MicrosoftUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
}

export interface EmailAddress {
  name: string;
  address: string;
}

export interface EmailRecipient {
  emailAddress: EmailAddress;
}

export interface EmailBody {
  contentType: "text" | "html";
  content: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
  contentBytes?: string;
}

export interface Email {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  receivedDateTime: string;
  sentDateTime: string;
  hasAttachments: boolean;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  importance: "low" | "normal" | "high";
  parentFolderId: string;
  conversationId: string;
  conversationIndex: string;
  isDeliveryReceiptRequested: boolean;
  isReadReceiptRequested: boolean;
  isRead: boolean;
  isDraft: boolean;
  webLink: string;
  body: EmailBody;
  sender: EmailRecipient;
  from: EmailRecipient;
  toRecipients: EmailRecipient[];
  ccRecipients: EmailRecipient[];
  bccRecipients: EmailRecipient[];
  replyTo: EmailRecipient[];
  flag: {
    flagStatus: "notFlagged" | "complete" | "flagged";
  };
  attachments?: EmailAttachment[];
}

export interface MailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  unreadItemCount: number;
  totalItemCount: number;
  isHidden: boolean;
}

export interface SendEmailRequest {
  subject: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  toRecipients: EmailRecipient[];
  ccRecipients?: EmailRecipient[];
  bccRecipients?: EmailRecipient[];
  attachments?: {
    "@odata.type": "#microsoft.graph.fileAttachment";
    name: string;
    contentType: string;
    contentBytes: string;
  }[];
  saveToSentItems?: boolean;
}

export interface GraphApiResponse<T> {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
  value: T[];
}

export interface MicrosoftAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}
