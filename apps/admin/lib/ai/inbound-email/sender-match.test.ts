import { describe, expect, it } from "vitest";
import type { Contact, NestedCustomer } from "@konfi/types";
import { parseEmailAddress } from "./addressing";
import { matchInboundSenderToCustomer } from "./sender-match";

const contact: Contact = {
  active: true,
  email: "buyer@example.com",
  name: "Buyer Example",
  phone: "",
};

const customer = {
  contacts: [contact],
  email: "company@example.com",
  id: "customer-1",
  name: "Example Print",
  personName: "Buyer Example",
} as unknown as NestedCustomer;

describe("matchInboundSenderToCustomer", () => {
  it("requires one exact sender email match", () => {
    const result = matchInboundSenderToCustomer({
      customers: [customer],
      sender: parseEmailAddress("Buyer <buyer@example.com>"),
    });

    expect(result.status).toBe("exact");
    expect(result.status === "exact" ? result.candidate.customer.id : "").toBe(
      "customer-1",
    );
  });

  it("blocks ambiguous exact sender matches", () => {
    const result = matchInboundSenderToCustomer({
      customers: [
        customer,
        {
          ...customer,
          id: "customer-2",
        },
      ],
      sender: parseEmailAddress("buyer@example.com"),
    });

    expect(result).toMatchObject({
      reason: "ambiguous-customer",
      status: "blocked",
    });
  });

  it("blocks display names that look like known customers without exact email", () => {
    const result = matchInboundSenderToCustomer({
      customers: [customer],
      sender: parseEmailAddress('"Example Print" <attacker@example.net>'),
    });

    expect(result).toMatchObject({
      reason: "spoof-looking",
      status: "blocked",
    });
  });
});
