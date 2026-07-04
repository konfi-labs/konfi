import type { Contact, NestedCustomer } from "@konfi/types";
import {
  normalizeEmailAddress,
  normalizeIdentityText,
  type ParsedEmailAddress,
} from "./addressing";
import type { SenderMatchCandidate, SenderMatchResult } from "./types";

function createFallbackContact(customer: NestedCustomer): Contact {
  return {
    active: true,
    email: customer.email ?? "",
    name: customer.personName || customer.name || customer.email || "",
    phone: "",
  };
}

function customerIdentityLabels(customer: NestedCustomer) {
  return [
    customer.name,
    customer.personName,
    customer.email,
    ...(customer.contacts ?? []).flatMap((contact) => [
      contact.name,
      contact.email,
    ]),
  ]
    .map(normalizeIdentityText)
    .filter(Boolean);
}

function findExactMatches(
  senderEmail: string,
  customers: readonly NestedCustomer[],
): SenderMatchCandidate[] {
  const normalizedSenderEmail = normalizeEmailAddress(senderEmail);
  const candidates: SenderMatchCandidate[] = [];

  for (const customer of customers) {
    for (const contact of customer.contacts ?? []) {
      if (normalizeEmailAddress(contact.email) === normalizedSenderEmail) {
        candidates.push({
          contact,
          customer,
          matchField: "contact-email",
        });
      }
    }

    if (normalizeEmailAddress(customer.email) === normalizedSenderEmail) {
      candidates.push({
        contact: createFallbackContact(customer),
        customer,
        matchField: "customer-email",
      });
    }
  }

  return candidates;
}

function displayNameLooksLikeKnownCustomer(
  displayName: string,
  customers: readonly NestedCustomer[],
) {
  const normalizedDisplayName = normalizeIdentityText(displayName);

  if (!normalizedDisplayName) {
    return false;
  }

  return customers.some((customer) =>
    customerIdentityLabels(customer).some(
      (label) =>
        label.length > 0 &&
        (label === normalizedDisplayName ||
          normalizedDisplayName.includes(label) ||
          label.includes(normalizedDisplayName)),
    ),
  );
}

export function matchInboundSenderToCustomer({
  customers,
  sender,
}: {
  customers: readonly NestedCustomer[];
  sender: ParsedEmailAddress;
}): SenderMatchResult {
  const exactMatches = findExactMatches(sender.email, customers);

  if (exactMatches.length === 1) {
    return {
      candidate: exactMatches[0],
      candidates: exactMatches,
      status: "exact",
    };
  }

  if (exactMatches.length > 1) {
    return {
      candidates: exactMatches,
      reason: "ambiguous-customer",
      status: "blocked",
    };
  }

  if (displayNameLooksLikeKnownCustomer(sender.name, customers)) {
    return {
      candidates: [],
      reason: "spoof-looking",
      status: "blocked",
    };
  }

  return {
    candidates: [],
    reason: "unknown-sender",
    status: "blocked",
  };
}
