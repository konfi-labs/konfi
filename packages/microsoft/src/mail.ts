/**
 * Microsoft Graph API Mail Operations
 */

import { createGraphClient } from "./graph-client";
import type {
  Email,
  MailFolder,
  SendEmailRequest,
  GraphApiResponse,
  EmailRecipient,
} from "./types";

export interface GetEmailsOptions {
  folderId?: string;
  top?: number;
  skip?: number;
  filter?: string;
  orderBy?: string;
  search?: string;
  select?: string[];
}

/**
 * Get emails from the user's mailbox
 */
export async function getEmails(
  accessToken: string,
  options: GetEmailsOptions = {},
): Promise<{ emails: Email[]; nextLink?: string }> {
  const client = createGraphClient(accessToken);

  const {
    folderId = "inbox",
    top = 25,
    skip = 0,
    filter,
    orderBy = "receivedDateTime DESC",
    search,
    select = [
      "id",
      "subject",
      "bodyPreview",
      "receivedDateTime",
      "sentDateTime",
      "from",
      "sender",
      "toRecipients",
      "ccRecipients",
      "hasAttachments",
      "importance",
      "isRead",
      "isDraft",
      "flag",
      "webLink",
    ],
  } = options;

  let api = client.api(`/me/mailFolders/${folderId}/messages`);

  api = api.top(top).select(select);

  // Note: $skip and $orderBy are not supported with $search in Microsoft Graph API
  if (!search) {
    api = api.orderby(orderBy);
    if (skip > 0) {
      api = api.skip(skip);
    }
  }

  if (filter) {
    api = api.filter(filter);
  }

  if (search) {
    api = api.search(`"${search}"`);
  }

  const response: GraphApiResponse<Email> = await api.get();

  return {
    emails: response.value,
    nextLink: response["@odata.nextLink"],
  };
}

/**
 * Get a single email by ID
 */
export async function getEmail(
  accessToken: string,
  messageId: string,
  includeAttachments = false,
): Promise<Email> {
  const client = createGraphClient(accessToken);

  let api = client.api(`/me/messages/${messageId}`);

  if (includeAttachments) {
    api = api.expand("attachments");
  }

  return api.get();
}

/**
 * Get all mail folders
 */
export async function getMailFolders(
  accessToken: string,
): Promise<MailFolder[]> {
  const client = createGraphClient(accessToken);

  const response: GraphApiResponse<MailFolder> = await client
    .api("/me/mailFolders")
    .top(100)
    .get();

  return response.value;
}

/**
 * Send an email
 */
export async function sendEmail(
  accessToken: string,
  email: SendEmailRequest,
): Promise<void> {
  const client = createGraphClient(accessToken);

  await client.api("/me/sendMail").post({
    message: {
      subject: email.subject,
      body: email.body,
      toRecipients: email.toRecipients,
      ccRecipients: email.ccRecipients,
      bccRecipients: email.bccRecipients,
      attachments: email.attachments,
    },
    saveToSentItems: email.saveToSentItems ?? true,
  });
}

/**
 * Reply to an email
 */
export async function replyToEmail(
  accessToken: string,
  messageId: string,
  comment: string,
  replyAll = false,
): Promise<void> {
  const client = createGraphClient(accessToken);
  const endpoint = replyAll ? "replyAll" : "reply";

  await client.api(`/me/messages/${messageId}/${endpoint}`).post({
    comment,
  });
}

/**
 * Forward an email
 */
export async function forwardEmail(
  accessToken: string,
  messageId: string,
  toRecipients: EmailRecipient[],
  comment?: string,
): Promise<void> {
  const client = createGraphClient(accessToken);

  await client.api(`/me/messages/${messageId}/forward`).post({
    comment,
    toRecipients,
  });
}

/**
 * Mark email as read/unread
 */
export async function updateEmailReadStatus(
  accessToken: string,
  messageId: string,
  isRead: boolean,
): Promise<void> {
  const client = createGraphClient(accessToken);

  await client.api(`/me/messages/${messageId}`).patch({
    isRead,
  });
}

/**
 * Delete an email (moves to Deleted Items)
 */
export async function deleteEmail(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const client = createGraphClient(accessToken);

  await client.api(`/me/messages/${messageId}`).delete();
}

/**
 * Move an email to a different folder
 */
export async function moveEmail(
  accessToken: string,
  messageId: string,
  destinationFolderId: string,
): Promise<Email> {
  const client = createGraphClient(accessToken);

  return client.api(`/me/messages/${messageId}/move`).post({
    destinationId: destinationFolderId,
  });
}

/**
 * Search emails
 */
export async function searchEmails(
  accessToken: string,
  query: string,
  options: Omit<GetEmailsOptions, "search"> = {},
): Promise<{ emails: Email[]; nextLink?: string }> {
  return getEmails(accessToken, {
    ...options,
    folderId: undefined, // Search across all folders
    search: query,
  });
}

/**
 * Get unread email count
 */
export async function getUnreadCount(
  accessToken: string,
  folderId = "inbox",
): Promise<number> {
  const client = createGraphClient(accessToken);

  const folder: MailFolder = await client
    .api(`/me/mailFolders/${folderId}`)
    .get();

  return folder.unreadItemCount;
}

/**
 * Get all emails in a conversation thread
 */
export async function getEmailsByConversation(
  accessToken: string,
  conversationId: string,
  options: { top?: number; select?: string[] } = {},
): Promise<{ emails: Email[]; nextLink?: string }> {
  const client = createGraphClient(accessToken);

  const {
    top = 50,
    select = [
      "id",
      "subject",
      "bodyPreview",
      "body",
      "receivedDateTime",
      "sentDateTime",
      "from",
      "sender",
      "toRecipients",
      "ccRecipients",
      "hasAttachments",
      "importance",
      "isRead",
      "isDraft",
      "webLink",
      "conversationId",
      "attachments",
    ],
  } = options;

  const response: GraphApiResponse<Email> = await client
    .api("/me/messages")
    .filter(`conversationId eq '${conversationId}'`)
    .top(top)
    .select(select)
    .orderby("receivedDateTime ASC")
    .expand("attachments")
    .get();

  return {
    emails: response.value,
    nextLink: response["@odata.nextLink"],
  };
}
