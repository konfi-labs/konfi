import "server-only";

import { assertProcessEnvIntegrationAllowed } from "@/lib/integration-runtime-config";
import {
  getResendRuntimeClient,
  resolveResendSenderAddress,
} from "@/lib/resend/client";
import { Resend } from "resend";
import type { ReactElement } from "react";
import { z } from "zod";
import {
  type InboundEmailContent,
  type ResendInboundWebhookEvent,
} from "./types";

const attachmentSchema = z.object({
  content_disposition: z.string().nullable().optional(),
  content_id: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  id: z.string(),
  size: z.number().nullable().optional(),
});

export const resendInboundWebhookEventSchema = z.object({
  created_at: z.string(),
  data: z.object({
    attachments: z.array(attachmentSchema).optional(),
    bcc: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
    created_at: z.string(),
    email_id: z.string(),
    from: z.string(),
    message_id: z.string(),
    subject: z.string().nullable().optional(),
    to: z.array(z.string()),
  }),
  type: z.literal("email.received"),
}) satisfies z.ZodType<ResendInboundWebhookEvent>;

export interface ResendWebhookHeaders {
  id: string;
  signature: string;
  timestamp: string;
}

type WebhookVerifier = (input: {
  headers: {
    id: string;
    signature: string;
    timestamp: string;
  };
  payload: string;
  webhookSecret: string;
}) => unknown;

function getResendWebhookVerifierClient() {
  assertProcessEnvIntegrationAllowed("Resend");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not defined");
  }

  return new Resend(apiKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      output[key] = entry;
    }
  }
  return output;
}

export function verifyResendInboundWebhookPayload({
  headers,
  payload,
  verifier,
  webhookSecret,
}: {
  headers: ResendWebhookHeaders;
  payload: string;
  verifier?: WebhookVerifier;
  webhookSecret: string;
}): ResendInboundWebhookEvent {
  if (!webhookSecret.trim()) {
    throw new Error("RESEND_WEBHOOK_SECRET is not defined");
  }

  const verify: WebhookVerifier =
    verifier ??
    ((input) => {
      const resend = getResendWebhookVerifierClient();
      return resend.webhooks.verify(input);
    });
  const verifiedPayload = verify({
    headers,
    payload,
    webhookSecret,
  });

  return resendInboundWebhookEventSchema.parse(verifiedPayload);
}

export async function fetchReceivedEmailContent(
  emailId: string,
): Promise<InboundEmailContent> {
  const { resend } = await getResendRuntimeClient();
  const response = await resend.emails.receiving.get(emailId);

  if (response.error) {
    throw new Error(response.error.message);
  }

  const data = response.data;
  if (!isRecord(data)) {
    throw new Error("Resend received email response was empty");
  }

  return {
    headers: getStringRecord(data.headers),
    html: typeof data.html === "string" ? data.html : null,
    text: typeof data.text === "string" ? data.text : null,
  };
}

export async function sendInboundAdminOnlyEmail({
  body,
  subject,
  template,
  to,
}: {
  body: string;
  subject: string;
  template?: ReactElement;
  to: string;
}) {
  const { config, resend } = await getResendRuntimeClient();
  const html = template
    ? await import("@konfi/emails").then(({ render }) => render(template))
    : undefined;
  const response = await resend.emails.send({
    from: resolveResendSenderAddress(config),
    ...(html ? { html } : {}),
    subject,
    text: body,
    to: [to],
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}
