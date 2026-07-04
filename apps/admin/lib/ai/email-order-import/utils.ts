import type { Email } from "@konfi/microsoft";
import type { Contact } from "@konfi/types";
import { ShippingOptions } from "@konfi/types";
import type { EmailOrderImportEmail } from "./types";

const HTML_BREAK_REGEXP = /<br\s*\/?>/gi;
const HTML_BLOCK_END_REGEXP = /<\/(p|div|h[1-6]|li|tr|section|article)>/gi;
const HTML_ENTITY_NBSP_REGEXP = /&nbsp;/gi;
const HTML_ENTITY_AMP_REGEXP = /&amp;/gi;
const HTML_ENTITY_LT_REGEXP = /&lt;/gi;
const HTML_ENTITY_GT_REGEXP = /&gt;/gi;
const HTML_TAG_REGEXP = /<[^>]+>/g;
const MULTI_NEWLINE_REGEXP = /\n{3,}/g;
const MULTI_SPACE_REGEXP = /[ \t]{2,}/g;

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function stripHtmlToText(html: string) {
  return html
    .replace(HTML_BREAK_REGEXP, "\n")
    .replace(HTML_BLOCK_END_REGEXP, "\n")
    .replace(HTML_ENTITY_NBSP_REGEXP, " ")
    .replace(HTML_ENTITY_AMP_REGEXP, "&")
    .replace(HTML_ENTITY_LT_REGEXP, "<")
    .replace(HTML_ENTITY_GT_REGEXP, ">")
    .replace(HTML_TAG_REGEXP, " ")
    .replace(/\r/g, "")
    .replace(MULTI_SPACE_REGEXP, " ")
    .replace(/ *\n */g, "\n")
    .replace(MULTI_NEWLINE_REGEXP, "\n\n")
    .trim();
}

export function normalizeEmailBody(email: Pick<Email, "body" | "bodyPreview">) {
  const bodyContent = email.body?.content?.trim();
  if (!bodyContent) {
    return email.bodyPreview?.trim() ?? "";
  }

  const normalized =
    email.body.contentType === "html"
      ? stripHtmlToText(bodyContent)
      : bodyContent.replace(/\r/g, "").trim();

  if (normalized.length > 0) {
    return truncate(normalized, 4_000);
  }

  return email.bodyPreview?.trim() ?? "";
}

function mapRecipientEmails(recipients: Email["toRecipients"]) {
  return recipients
    .map((recipient) => recipient.emailAddress?.address?.trim() ?? "")
    .filter((email) => email.length > 0);
}

export function normalizeConversationEmails(emails: Email[]): EmailOrderImportEmail[] {
  return emails.map((email) => ({
    id: email.id,
    subject: email.subject ?? "",
    senderName: email.from?.emailAddress?.name?.trim() ?? "",
    senderEmail: email.from?.emailAddress?.address?.trim() ?? "",
    recipientEmails: mapRecipientEmails(email.toRecipients ?? []),
    bodyText: normalizeEmailBody(email),
    bodyPreview: email.bodyPreview?.trim() ?? "",
    sentAt: email.sentDateTime,
    receivedAt: email.receivedDateTime,
    hasAttachments: email.hasAttachments,
  }));
}

export function buildConversationPrompt({
  conversationId,
  subject,
  emails,
}: {
  conversationId: string;
  subject: string;
  emails: EmailOrderImportEmail[];
}) {
  const formattedEmails = emails
    .map((email, index) => {
      const recipients =
        email.recipientEmails.length > 0
          ? email.recipientEmails.join(", ")
          : "(no visible recipients)";

      return [
        `Message ${index + 1}`,
        `From: ${email.senderName || email.senderEmail || "Unknown sender"} <${email.senderEmail || "unknown@example.com"}>`,
        `To: ${recipients}`,
        `Subject: ${email.subject || subject || "(no subject)"}`,
        `Received: ${email.receivedAt}`,
        `Has attachments: ${email.hasAttachments ? "yes" : "no"}`,
        "Body:",
        email.bodyText || email.bodyPreview || "(empty)",
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    "Analyze this email conversation and decide whether an internal order draft can be created now or whether a follow-up email is truly required.",
    "Bias toward creating an internal draft whenever a plausible order can be prepared for the admin to edit later.",
    `Conversation ID: ${conversationId}`,
    `Latest subject: ${subject || "(no subject)"}`,
    "Conversation messages (oldest to newest):",
    formattedEmails,
  ].join("\n\n");
}

export function createFallbackCustomerLabel(emails: EmailOrderImportEmail[]) {
  const preferredEmail = [...emails]
    .reverse()
    .find((email) => email.senderEmail || email.senderName);

  if (!preferredEmail) {
    return "Email customer";
  }

  return (
    preferredEmail.senderName || preferredEmail.senderEmail || "Email customer"
  );
}

export function createFallbackContact({
  emails,
  contactName,
  contactEmail,
  contactPhone,
}: {
  emails: EmailOrderImportEmail[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}): Contact {
  const preferredEmail = [...emails]
    .reverse()
    .find((email) => email.senderEmail || email.senderName);

  return {
    name:
      contactName?.trim() ||
      preferredEmail?.senderName ||
      preferredEmail?.senderEmail ||
      "",
    email:
      contactEmail?.trim() ||
      preferredEmail?.senderEmail ||
      "",
    phone: contactPhone?.trim() || "",
    active: true,
  };
}

export function buildDraftSpecialNotes({
  conversationId,
  subject,
  rationale,
  missingButNonBlocking,
}: {
  conversationId: string;
  subject: string;
  rationale?: string;
  missingButNonBlocking?: string[];
}) {
  const lines = [
    `Imported from email conversation ${conversationId}.`,
    `Email subject: ${subject || "(no subject)"}`,
  ];

  if (rationale?.trim()) {
    lines.push(`AI summary: ${rationale.trim()}`);
  }

  if (missingButNonBlocking && missingButNonBlocking.length > 0) {
    lines.push(
      `Details to verify manually: ${missingButNonBlocking.join(", ")}`,
    );
  }

  return lines.join("\n");
}

export const DEFAULT_IMPORT_SHIPPING_OPTION =
  ShippingOptions.PERSONAL_COLLECTION;
