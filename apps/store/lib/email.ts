import "server-only";

import {
  getResendRuntimeClient,
  resolveResendSenderAddress,
} from "@/lib/resend/client";
import { render } from "@konfi/emails";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { Resend } from "resend";

type TemplateVariables = Record<string, string | number>;

interface SendEmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  template: React.ReactElement;
  tenantContext?: TenantContext;
  idempotencyKey?: string;
  fallbackTemplate?: {
    id: string;
    variables?: TemplateVariables;
  };
}

async function sendRenderedEmail(params: {
  resend: Resend;
  from: string;
  html: string;
  idempotencyKey?: string;
  subject: string;
  to: string[];
}) {
  const payload = {
    to: params.to,
    from: params.from,
    subject: params.subject,
    html: params.html,
  };
  const { error } = params.idempotencyKey
    ? await params.resend.emails.send(payload, {
        idempotencyKey: params.idempotencyKey,
      })
    : await params.resend.emails.send(payload);

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

async function sendFallbackTemplateEmail(params: {
  fallbackTemplate: {
    id: string;
    variables?: TemplateVariables;
  };
  from: string;
  idempotencyKey?: string;
  resend: Resend;
  subject: string;
  to: string[];
}) {
  const payload = {
    to: params.to,
    from: params.from,
    subject: params.subject,
    template: {
      id: params.fallbackTemplate.id,
      variables: params.fallbackTemplate.variables ?? {},
    },
  };
  const { error } = params.idempotencyKey
    ? await params.resend.emails.send(payload, {
        idempotencyKey: params.idempotencyKey,
      })
    : await params.resend.emails.send(payload);

  if (error) {
    throw new Error(`Failed to send fallback email: ${error.message}`);
  }
}

export async function sendEmail({
  to,
  from,
  subject,
  template,
  tenantContext,
  idempotencyKey,
  fallbackTemplate,
}: SendEmailOptions) {
  const toRecipients = (Array.isArray(to) ? to : [to])
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  if (toRecipients.length === 0) {
    throw new Error("No valid recipients provided");
  }

  const { config, resend } = await getResendRuntimeClient(tenantContext);
  const formattedFrom = resolveResendSenderAddress(config, from);

  try {
    const html = await render(template);
    await sendRenderedEmail({
      resend,
      to: toRecipients,
      from: formattedFrom,
      idempotencyKey,
      subject,
      html,
    });
  } catch (error) {
    if (!fallbackTemplate) {
      throw error;
    }

    console.error(
      "Failed to send JSX email, falling back to Resend template:",
      error,
    );

    await sendFallbackTemplateEmail({
      resend,
      to: toRecipients,
      from: formattedFrom,
      idempotencyKey,
      subject,
      fallbackTemplate,
    });
  }
}
