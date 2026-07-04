"use client";

import type { FakturowniaIntegrationActionError } from "@/actions/fakturownia";
import type { KsefReadinessIssue } from "@/lib/fakturownia/ksef-readiness";
import { Alert, Text, VStack } from "@chakra-ui/react";
import { isEmpty } from "es-toolkit/compat";

type TranslationFn = (
  key: string,
  options?: Record<string, string | number | boolean | undefined>,
) => string;

export function extractErrorMessages(formErrors: unknown): string[] {
  const messages = new Set<string>();

  const visit = (node: unknown): void => {
    if (node == null) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item));
      return;
    }

    if (typeof node === "string") {
      const trimmed = node.trim();
      if (trimmed.length > 0) {
        messages.add(trimmed);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const objectNode = node as Record<string, unknown>;
    const message = objectNode.message;
    if (typeof message === "string") {
      const trimmed = message.trim();
      if (trimmed.length > 0) {
        messages.add(trimmed);
      }
    }

    const types = objectNode.types;
    if (types && typeof types === "object") {
      visit(types);
    }

    const arrayErrors = objectNode._errors;
    if (Array.isArray(arrayErrors)) {
      arrayErrors.forEach((item) => visit(item));
    }

    for (const [key, value] of Object.entries(objectNode)) {
      if (
        key === "message" ||
        key === "type" ||
        key === "types" ||
        key === "ref" ||
        key === "_errors"
      ) {
        continue;
      }
      visit(value);
    }
  };

  visit(formErrors);
  return Array.from(messages);
}

interface FakturowniaErrorsAlertProps {
  messages: string[];
  title: string;
}

export function FakturowniaErrorsAlert({
  messages,
  title,
}: FakturowniaErrorsAlertProps) {
  if (isEmpty(messages)) {
    return null;
  }

  return (
    <Alert.Root status="error">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>
          <VStack align="stretch" gap={1} mt={2}>
            {messages.map((message) => (
              <Text key={message} fontSize="sm">
                • {message}
              </Text>
            ))}
          </VStack>
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function formatFakturowniaIntegrationActionError(
  error: FakturowniaIntegrationActionError,
  t: TranslationFn,
): string {
  if (error.ksefReadiness?.blockers.length) {
    return formatKsefReadinessIssues(error.ksefReadiness.blockers, t).join(" ");
  }

  const status = error.diagnostic.statusCode;
  const message = t(
    `fakturownia.invoiceCreate.integrationErrors.${error.kind}.message`,
    {
      defaultValue: error.message,
      status,
    },
  );
  const guidance = t(
    `fakturownia.invoiceCreate.integrationErrors.${error.kind}.guidance`,
    {
      defaultValue: error.operatorHint,
      status,
    },
  );
  const statusText = status
    ? t("fakturownia.invoiceCreate.integrationErrors.status", {
        defaultValue: "Fakturownia status: {{status}}.",
        status,
      })
    : "";

  return [message, guidance, statusText].filter(Boolean).join(" ");
}

const KSEF_READINESS_FALLBACK_MESSAGES: Record<string, string> = {
  buyerNameMissing: "Buyer name is missing.",
  buyerNipMissing:
    "The buyer is a company but has no NIP — KSeF will reject the invoice.",
  buyerNipInvalid: "Buyer NIP {{taxNo}} is not a valid Polish NIP.",
  buyerEmailTooLong: "Buyer email exceeds {{max}} characters.",
  buyerEmailInvalid: "Buyer email does not look like a valid address.",
  buyerPhoneTooLong: "Buyer phone exceeds {{max}} characters.",
  recipientPhoneTooLong: "Recipient phone exceeds {{max}} characters.",
  positionNameTooLong: "Position {{index}} name exceeds {{max}} characters.",
  descriptionTooLong: "Invoice description exceeds {{max}} characters.",
  recipientRoleInvalid:
    'Recipient role "{{role}}" is not on Fakturownia\'s list of allowed values.',
  recipientRoleDescriptionMissing:
    "Custom recipient role requires a role description.",
  recipientRoleDescriptionTooLong:
    "Recipient role description exceeds {{max}} characters.",
  recipientNotIdentifiable:
    "Recipient {{name}} may be rejected by KSeF: it needs a tax ID and an address to be identifiable.",
  issuerRoleMissing:
    "The invoice issuer has no role set — KSeF will reject the invoice.",
  issuerRoleInvalid:
    'Issuer role "{{role}}" is not on Fakturownia\'s list of allowed values.',
  issuerRoleDescriptionMissing:
    "Custom issuer role requires a role description.",
  issueDateInFuture:
    "Issue date {{issueDate}} is in the future — KSeF rejects future-dated invoices.",
  vatExemptionReasonMissing:
    'A position uses the "zw" rate but no VAT exemption legal basis is set.',
  npReasonMissing:
    'A position uses the "np" rate but no non-taxable reason is set.',
};

export function formatKsefReadinessIssues(
  issues: KsefReadinessIssue[],
  t: TranslationFn,
): string[] {
  return issues.map((issue) =>
    t(`fakturownia.ksefReadiness.${issue.code}`, {
      defaultValue: KSEF_READINESS_FALLBACK_MESSAGES[issue.code] ?? issue.code,
      ...issue.params,
    }),
  );
}
