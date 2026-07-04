import "server-only";

import {
  getResendRuntimeClient,
  resolveResendSenderAddress,
} from "@/lib/resend/client";
import { render } from "@konfi/emails";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import type { CreateEmailOptions } from "resend";

export interface EmailAttachment {
  content: string;
  contentType?: string;
  disposition?: "attachment" | "inline";
  filename: string;
  type?: string;
}

interface SendEmailOptions {
  attachments?: EmailAttachment[];
  to: string | string[];
  from?: string;
  subject: string;
  tenantContext?: TenantContext;
  template: React.ReactElement;
}

function normalizeRecipients(to: string | string[]) {
  const toRecipients = (Array.isArray(to) ? to : [to])
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  if (toRecipients.length === 0) {
    throw new Error("No valid recipients provided");
  }

  return toRecipients;
}

function throwOnResendError(error: { message: string } | null) {
  if (!error) {
    return;
  }

  console.error("Failed to send email:", error);
  throw new Error(`Failed to send email: ${error.message}`);
}

function normalizeAttachments(
  attachments?: EmailAttachment[],
): CreateEmailOptions["attachments"] {
  return attachments?.map((attachment) => ({
    content: Buffer.from(attachment.content, "base64"),
    contentType: attachment.contentType ?? attachment.type,
    filename: attachment.filename,
  }));
}

/**
 * Send an email using Resend with a JSX Email template.
 * This must only be called from server-side code (Server Actions, Route Handlers).
 */
export async function sendEmail({
  attachments,
  to,
  from,
  subject,
  tenantContext,
  template,
}: SendEmailOptions) {
  const { config, resend } = await getResendRuntimeClient(tenantContext);
  const toRecipients = normalizeRecipients(to);
  const html = await render(template);
  const formattedFrom = resolveResendSenderAddress(config, from);

  const { error } = await resend.emails.send({
    attachments: normalizeAttachments(attachments),
    to: toRecipients,
    from: formattedFrom,
    subject,
    html,
  });

  throwOnResendError(error);
}
