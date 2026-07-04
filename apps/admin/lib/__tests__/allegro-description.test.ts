import { createAllegroDescriptionContent } from "@/lib/allegro-description";
import { describe, expect, it } from "vitest";

describe("allegro description helpers", () => {
  it("converts markdown into Allegro-supported HTML", () => {
    const description = createAllegroDescriptionContent({
      configurationDescription: "Paper: silk",
      customFormatLabel: "120 x 80 mm",
      description:
        "# Business cards\n\nPremium **silk** paper.<br />No line break tag.\n\n- Fast print\n- Packed safely",
      parameters: [],
      productName: "Business cards",
      quantity: 100,
    });

    expect(description).toContain("<h1>Business cards</h1>");
    expect(description).toContain(
      "<p>Premium <b>silk</b> paper. No line break tag.</p>",
    );
    expect(description).toContain(
      "<ul><li>Fast print</li><li>Packed safely</li></ul>",
    );
    expect(description).toContain("<h2>Pliki do druku</h2>");
    expect(description).toContain(
      "<p>Oferta obejmuje druk na podstawie gotowych plików przesłanych przez kupującego. Przygotowanie projektu graficznego nie jest zawarte w cenie oferty.</p>",
    );
    expect(description).toContain(
      "<p>Inne konfiguracje produktu, takie jak różne nakłady, formaty, papiery lub wykończenia, są dostępne w osobnych ofertach.</p>",
    );
    expect(description).toContain("<h2>Konfiguracja</h2>");
    expect(description).toContain("<li><b>Format:</b> 120 x 80 mm</li>");
    expect(description).not.toContain("<br");
    expect(description).not.toContain("&#8725;");
  });
});
