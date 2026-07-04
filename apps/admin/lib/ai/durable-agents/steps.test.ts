import { describe, it, expect, vi } from "vitest";
import type { NestedCustomer, Product } from "@konfi/types";

vi.mock("server-only", () => ({}));

import {
  buildCustomerSearchQueries,
  CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD,
  mergeAgentMessagesForPersistence,
  normalizeProductSearchQueries,
  normalizeCustomerMatchDecision,
  rankProductSearchResults,
  rankCustomerSearchResults,
  scoreProductSearchMatch,
  scoreCustomerSearchMatch,
} from "./steps";
import { sortCustomersByIds } from "./sortCustomersByIds";

describe("sortCustomersByIds", () => {
  const mockCustomers = [
    { id: "1", name: "Customer 1" },
    { id: "2", name: "Customer 2" },
    { id: "3", name: "Customer 3" },
    { id: "4", name: "Customer 4" },
    { id: "5", name: "Customer 5" },
  ] as unknown as NestedCustomer[];

  it("should sort customers according to the IDs array", () => {
    const ids = ["3", "1", "5"];
    const result = sortCustomersByIds(mockCustomers, ids);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("3");
    expect(result[1].id).toBe("1");
    expect(result[2].id).toBe("5");
  });

  it("should ignore IDs that do not exist in customers array", () => {
    const ids = ["3", "999", "1"];
    const result = sortCustomersByIds(mockCustomers, ids);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("3");
    expect(result[1].id).toBe("1");
  });

  it("should return empty array if no IDs provided", () => {
    const result = sortCustomersByIds(mockCustomers, []);
    expect(result).toEqual([]);
  });

  it("should return empty array if no customers provided", () => {
    const result = sortCustomersByIds([], ["1", "2"]);
    expect(result).toEqual([]);
  });

  it("should handle duplicates in IDs by returning duplicates in result", () => {
    const ids = ["1", "1"];
    const result = sortCustomersByIds(mockCustomers, ids);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("1");
  });
});

describe("normalizeCustomerMatchDecision", () => {
  it("allows auto-selection only for known IDs above the threshold", () => {
    const result = normalizeCustomerMatchDecision({
      candidateIds: ["customer-a", "customer-b"],
      decision: {
        autoSelect: true,
        confidence: CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD,
        rationale: "Exact NIP match",
        selectedCustomerId: "customer-b",
      },
    });

    expect(result).toEqual({
      autoSelect: true,
      confidence: CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD,
      rationale: "Exact NIP match",
      selectedCustomerId: "customer-b",
    });
  });

  it("rejects model-proposed IDs that are not in the candidate set", () => {
    const result = normalizeCustomerMatchDecision({
      candidateIds: ["customer-a"],
      decision: {
        autoSelect: true,
        confidence: 1,
        rationale: "  ",
        selectedCustomerId: "hallucinated-id",
      },
    });

    expect(result).toEqual({
      autoSelect: false,
      confidence: 1,
      rationale: "No rationale provided",
      selectedCustomerId: null,
    });
  });

  it("keeps low-confidence matches selectable only by human confirmation", () => {
    const result = normalizeCustomerMatchDecision({
      candidateIds: ["customer-a"],
      decision: {
        autoSelect: true,
        confidence: CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD - 0.01,
        rationale: "Name is similar but ambiguous",
        selectedCustomerId: "customer-a",
      },
    });

    expect(result.autoSelect).toBe(false);
    expect(result.selectedCustomerId).toBe("customer-a");
  });
});

describe("customer search helpers", () => {
  it("expands full-name queries into deterministic search variants", () => {
    expect(buildCustomerSearchQueries("Example Buyer")).toEqual([
      "Example Buyer",
      "buyer example",
      "example",
      "buyer",
    ]);
  });

  it("scores matches across person names, contacts, email, and diacritics", () => {
    const customer = {
      id: "customer-a",
      name: "Design Studio",
      personName: "Example Buyer",
      email: "hello@example.com",
      contacts: [
        {
          active: true,
          email: "design.bot@example.com",
          name: "Example Contact",
          phone: "",
        },
      ],
    } as unknown as NestedCustomer;

    expect(scoreCustomerSearchMatch("Example Buyer", customer)).toBeGreaterThan(
      0,
    );
    expect(
      scoreCustomerSearchMatch("design.bot@example.com", customer),
    ).toBeGreaterThan(0);
  });

  it("ranks exact customer matches ahead of unrelated Meilisearch results", () => {
    const customers = [
      {
        id: "unrelated-a",
        name: "Example Other",
        personName: "Example Other",
      },
      {
        id: "expected",
        name: "Example Buyer",
        personName: "Example Buyer",
      },
      {
        id: "unrelated-b",
        name: "Example Studio",
        personName: "Example Contact",
      },
    ] as unknown as NestedCustomer[];

    expect(rankCustomerSearchResults("Example Buyer", customers)[0].id).toBe(
      "expected",
    );
  });
});

describe("product search helpers", () => {
  it("normalizes model-generated product search queries without fixed aliases", () => {
    expect(
      normalizeProductSearchQueries({
        query: "potrzebuję wydrukować dzisiaj 4 vouchery prezentowe",
        generatedQueries: [
          "Wydruki",
          "vouchery prezentowe kolor dwustronnie",
          "Wydruki",
          "",
        ],
      }),
    ).toEqual([
      "potrzebuję wydrukować dzisiaj 4 vouchery prezentowe",
      "Wydruki",
      "vouchery prezentowe kolor dwustronnie",
    ]);
  });

  it("scores direct product-name and keyword matches ahead of unrelated items", () => {
    const matchingProduct = {
      id: "poster-standard",
      name: "Plakaty Standardowe",
      description: "Druk plakatow reklamowych",
      keywords: ["plakat", "poster", "b1", "b2"],
      category: { name: "Plakaty" },
      seo: { title: "Plakaty", description: "Plakaty reklamowe" },
    } as const;
    const unrelatedProduct = {
      id: "business-cards",
      name: "Wizytowki Premium",
      description: "Druk wizytowek",
      keywords: ["wizytowki"],
      category: { name: "Wizytowki" },
      seo: { title: "Wizytowki", description: "Wizytowki firmowe" },
    } as const;

    expect(
      scoreProductSearchMatch(
        "40 B1 posters, 40 B2 posters",
        matchingProduct as Product,
      ),
    ).toBeGreaterThan(
      scoreProductSearchMatch(
        "40 B1 posters, 40 B2 posters",
        unrelatedProduct as Product,
      ),
    );
  });

  it("ranks matching poster products before unrelated catalog entries", () => {
    const products = [
      {
        id: "cards",
        name: "Wizytowki Premium",
        description: "Papier firmowy",
        keywords: ["wizytowki"],
        category: { name: "Wizytowki" },
        seo: { title: "Wizytowki", description: "Wizytowki premium" },
      },
      {
        id: "posters",
        name: "Plakaty Standardowe",
        description: "Plakaty B1 i B2",
        keywords: ["plakat", "poster", "b1", "b2"],
        category: { name: "Plakaty" },
        seo: { title: "Plakaty", description: "Druk plakatow" },
      },
      {
        id: "leaflets",
        name: "Ulotki",
        description: "Druk ulotek",
        keywords: ["ulotki"],
        category: { name: "Ulotki" },
        seo: { title: "Ulotki", description: "Ulotki reklamowe" },
      },
    ];

    expect(
      rankProductSearchResults(
        "40 B1 posters, 40 B2 posters",
        products as Product[],
      )[0].id,
    ).toBe("posters");
  });

  it("scores model-generated catalog terms against matching products", () => {
    const genericPrintProduct = {
      id: "prints",
      name: "Wydruki",
      description: "Kolorowe wydruki na papierze",
      keywords: [],
      category: { name: "Druk" },
      seo: { title: "Wydruki", description: "Druk cyfrowy" },
    } as const;

    expect(
      scoreProductSearchMatch(
        "Wydruki vouchery prezentowe kolor dwustronnie",
        genericPrintProduct as Product,
      ),
    ).toBeGreaterThan(0);
  });

  it("does not broadly boost unrelated products when the model proposes a catalog term", () => {
    const genericPrintProduct = {
      id: "prints",
      name: "Wydruki",
      description: "Kolorowe wydruki na papierze",
      keywords: [],
      category: { name: "Druk" },
      seo: { title: "Wydruki", description: "Druk cyfrowy" },
    } as const;
    const unrelatedProduct = {
      id: "business-cards",
      name: "Wizytowki Premium",
      description: "Druk wizytowek",
      keywords: ["wizytowki"],
      category: { name: "Wizytowki" },
      seo: { title: "Wizytowki", description: "Wizytowki firmowe" },
    } as const;

    expect(
      scoreProductSearchMatch(
        "Wydruki vouchery prezentowe kolor dwustronnie",
        genericPrintProduct as Product,
      ),
    ).toBeGreaterThan(
      scoreProductSearchMatch(
        "Wydruki vouchery prezentowe kolor dwustronnie",
        unrelatedProduct as Product,
      ),
    );
  });
});

describe("agent message persistence helpers", () => {
  it("merges final workflow messages after persisted hook responses", () => {
    const result = mergeAgentMessagesForPersistence(
      [
        { role: "user", content: "Create a quote" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Which customer?" }],
        },
        { role: "user", content: "Design Studio" },
      ],
      [
        { role: "user", content: "Create a quote" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Which customer?" }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "customer-hook",
              result: { confirmed: true },
            },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Quote summary ready." }],
        },
      ],
    );

    expect(result).toEqual([
      { role: "user", content: "Create a quote" },
      {
        role: "assistant",
        content: [{ type: "text", text: "Which customer?" }],
      },
      { role: "user", content: "Design Studio" },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "customer-hook",
            result: { confirmed: true },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Quote summary ready." }],
      },
    ]);
  });

  it("drops undefined fields before persisting merged messages", () => {
    const result = mergeAgentMessagesForPersistence(
      [],
      [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "tool-1",
              args: {
                keep: "value",
                skip: undefined,
              },
            },
          ],
        },
      ],
    );

    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "tool-1",
            args: { keep: "value" },
          },
        ],
      },
    ]);
  });
});
