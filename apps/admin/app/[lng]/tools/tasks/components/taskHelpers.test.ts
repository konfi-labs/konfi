import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@/context/agents";
import {
  getLastAssistantMessage,
  getLatestPendingHook,
  getPendingInteraction,
  isCatalogSetupPendingHook,
} from "./taskHelpers";

describe("taskHelpers", () => {
  it("uses the latest pending hook args to detect catalog setup confirmations", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            args: {
              question:
                "Mogę automatycznie uzupełnić brakujące dane w katalogu i utworzyć typ produktu.",
            },
            toolCallId: "catalog-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
      {
        role: "user",
        content: "Tak",
      },
      {
        role: "assistant",
        content: [
          {
            args: {
              question: "Czy poniższe założenia dotyczące cennika są poprawne?",
            },
            toolCallId: "price-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ];

    const pendingHook = getLatestPendingHook(messages);

    expect(pendingHook?.toolCallId).toBe("price-hook");
    expect(isCatalogSetupPendingHook(pendingHook)).toBe(false);
  });

  it("does not treat an answered confirmation hook as pending", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              question: "Nie znaleziono klienta. Czy utworzyć nowego klienta?",
            },
            toolCallId: "customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
      {
        role: "user",
        content: "Tak, utwórz nowego klienta.",
      },
    ]);

    expect(pendingHook).toBeNull();
  });

  it("does not preview an answered assistant question", () => {
    const preview = getLastAssistantMessage([
      {
        role: "assistant",
        content: "Checking available customers.",
      },
      {
        role: "assistant",
        content: [
          {
            text: "Którego klienta wybrać?",
            type: "text",
          },
          {
            args: { question: "Którego klienta wybrać?" },
            toolCallId: "customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
      {
        role: "user",
        content: "Wybierz pierwszego klienta.",
      },
    ]);

    expect(preview).toBe("Checking available customers.");
  });

  it("still previews the last assistant response after a later user reply", () => {
    const preview = getLastAssistantMessage([
      {
        role: "assistant",
        content: "The product draft is ready for review.",
      },
      {
        role: "user",
        content: "Thanks.",
      },
    ]);

    expect(preview).toBe("The product draft is ready for review.");
  });

  it("does not treat a resolved tool call as pending", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: { question: "Confirm this quote?" },
            toolCallId: "quote-hook",
            toolName: "requestQuoteApproval",
            type: "tool-call",
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            result: { approved: true },
            toolCallId: "quote-hook",
            toolName: "requestQuoteApproval",
            type: "tool-result",
          },
        ],
      },
    ]);

    expect(pendingHook).toBeNull();
  });

  it("returns a newer hook after an earlier hook was answered", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: { question: "Which customer?" },
            toolCallId: "customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
      {
        role: "user",
        content: "Use customer A.",
      },
      {
        role: "assistant",
        content: [
          {
            args: { question: "Approve the quote?" },
            toolCallId: "quote-hook",
            toolName: "requestQuoteApproval",
            type: "tool-call",
          },
        ],
      },
    ]);

    expect(pendingHook?.toolCallId).toBe("quote-hook");
  });

  it("does not infer catalog setup from legacy free-form question text", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              question:
                "Żeby dokończyć szkic produktu, mogę automatycznie uzupełnić brakujące dane w katalogu.",
            },
            toolCallId: "catalog-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    expect(isCatalogSetupPendingHook(pendingHook)).toBe(false);
  });

  it("detects catalog setup confirmations from structured metadata", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              interaction: {
                body: "Plan zmian w katalogu produktu.",
                kind: "form",
                metadata: {
                  reason: "catalogSetup",
                },
                title: "Automatyczne uzupełnienie katalogu",
                version: "konfi.agent-interaction.v1",
              },
            },
            toolCallId: "catalog-form-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    expect(isCatalogSetupPendingHook(pendingHook)).toBe(true);
  });

  it("detects catalog setup confirmations from structured form fields", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              interaction: {
                body: "Plan zmian w katalogu produktu.",
                fields: [
                  {
                    id: "catalogSetupPlan",
                    kind: "json",
                    label: "Plan zmian w katalogu",
                  },
                ],
                kind: "form",
                title: "Automatyczne uzupełnienie katalogu",
                version: "konfi.agent-interaction.v1",
              },
            },
            toolCallId: "catalog-field-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    expect(isCatalogSetupPendingHook(pendingHook)).toBe(true);
  });

  it("returns a stored structured pending interaction", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              interaction: {
                body: "Choose one customer.",
                fields: [
                  {
                    id: "customerId",
                    kind: "select",
                    label: "Customer",
                    options: [
                      { label: "1. Example", value: "exampleCustomer" },
                    ],
                  },
                ],
                kind: "form",
                title: "Customer selection",
                version: "konfi.agent-interaction.v1",
              },
            },
            toolCallId: "customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    const interaction = getPendingInteraction(pendingHook);

    expect(interaction?.kind).toBe("form");
    expect(interaction?.fields?.[0]?.options?.[0]?.value).toBe(
      "exampleCustomer",
    );
  });

  it("builds a fallback interaction from question and context args", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              context:
                "1. Example Customer (ID: exampleCustomer)\n2. Example Customer (ID: another)",
              question: "Którego klienta wybrać?",
            },
            toolCallId: "legacy-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    const interaction = getPendingInteraction(pendingHook);

    expect(interaction?.body).toContain("Którego klienta wybrać?");
    expect(interaction?.body).toContain("exampleCustomer");
  });

  it("deduplicates fallback question and context text", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              context:
                "Nie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta, czy szukać innego?",
              question:
                "Nie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta?",
            },
            toolCallId: "new-customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    const interaction = getPendingInteraction(pendingHook);

    expect(interaction?.body).toBe(
      "Nie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta, czy szukać innego?",
    );
  });

  it("deduplicates stored structured interaction body text", () => {
    const pendingHook = getLatestPendingHook([
      {
        role: "assistant",
        content: [
          {
            args: {
              interaction: {
                body: "Nie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta?\n\nNie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta, czy szukać innego?",
                kind: "question",
                title: "Potwierdzenie klienta",
                version: "konfi.agent-interaction.v1",
              },
            },
            toolCallId: "structured-new-customer-hook",
            toolName: "requestUserConfirmation",
            type: "tool-call",
          },
        ],
      },
    ]);

    const interaction = getPendingInteraction(pendingHook);

    expect(interaction?.body).toBe(
      "Nie znaleziono w bazie klienta 'Ireneusz Popiel'. Czy chcesz utworzyć wycenę dla 'Ireneusz Popiel' jako nowego klienta, czy szukać innego?",
    );
  });
});
