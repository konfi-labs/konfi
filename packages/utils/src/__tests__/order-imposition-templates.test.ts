import { describe, expect, it } from "vitest";

import {
  shortlistOrderImpositionWorkflowCandidates,
  toSerializableOrderImpositionTemplateSuggestionItems,
} from "../order-imposition-templates";

describe("order-imposition-templates", () => {
  it("keeps serialization focused on lightweight matching context", () => {
    const [item] = toSerializableOrderImpositionTemplateSuggestionItems([
      {
        id: "item-1",
        name: "Business cards",
        description: "Matt laminated cards",
        quantity: 100,
        customFormat: false,
        totalPrice: 0,
        customPrice: null,
        discount: {
          discountValue: 0,
          code: "",
        },
        unit: "PCS",
        width: 90,
        height: 50,
        product: {
          name: "Business cards",
        },
      },
    ] as never);

    expect(item).toEqual({
      id: "item-1",
      label: "Business cards",
      description: "Matt laminated cards",
      productName: "Business cards",
      quantity: 100,
      width: 90,
      height: 50,
      volume: undefined,
    });
  });

  it("truncates large order item text before suggestion payloads", () => {
    const largeDescription = "large-pdf-payload ".repeat(2_000);
    const [item] = toSerializableOrderImpositionTemplateSuggestionItems([
      {
        id: "item-1",
        description: largeDescription,
        quantity: 100,
        customFormat: false,
        totalPrice: 0,
        customPrice: null,
        discount: {
          discountValue: 0,
          code: "",
        },
        unit: "PCS",
      },
    ] as never);

    expect(item.description.length).toBeLessThanOrEqual(500);
    expect(item.label.length).toBeLessThanOrEqual(500);
  });

  it("shortlists only strong sibling template candidates", () => {
    const candidates = shortlistOrderImpositionWorkflowCandidates({
      items: [
        {
          id: "item-1",
          label: "Business cards",
          description: "Matt laminated business cards",
          productName: "Business cards",
          quantity: 100,
          width: 90,
          height: 50,
        },
      ],
      workflows: [
        { id: "linked", name: "Business cards 90x50 base" },
        { id: "foil", name: "Business cards 90x50 foil" },
        { id: "poster", name: "Poster 500x700" },
      ],
      excludedWorkflowIds: ["linked"],
    });

    expect(candidates).toEqual([
      { id: "foil", name: "Business cards 90x50 foil" },
    ]);
  });

  it("keeps short format tokens like A6 for shortlist matching", () => {
    const candidates = shortlistOrderImpositionWorkflowCandidates({
      items: [
        {
          id: "item-1",
          label: "Pocztówka A6, karton 270g, dwustronnie, 100 szt.",
          description: "",
          productName: "Pocztówka A6",
          quantity: 100,
        },
      ],
      workflows: [
        { id: "a6-double", name: "Pocztówka A6 dwustronnie" },
        { id: "poster", name: "Plakat B2 jednostronnie" },
      ],
    });

    expect(candidates).toEqual([
      { id: "a6-double", name: "Pocztówka A6 dwustronnie" },
    ]);
  });
});
