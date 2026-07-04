import { AdvancedEdgeFinishing } from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  createEmptyAdvancedSelection,
  createSelectionFromPreset,
  hasAnyGrommets,
  normalizeAdvancedSelection,
  setCutToSize,
  toggleFinishingSide,
  updateGrommets,
} from "../advanced-finishing";

describe("advanced finishing helpers", () => {
  it("creates default selection", () => {
    const selection = createEmptyAdvancedSelection("preset");
    expect(selection.preset).toBe("preset");
    expect(selection.reinforcementSides).toEqual([]);
    expect(selection.tunnelSides).toEqual([]);
    expect(selection.grommets?.spacing).toBe(50);
    expect(selection.grommets?.sides).toEqual([]);
  });

  it("applies preset reinforcements and grommets", () => {
    const selection = createSelectionFromPreset(
      {
        reinforcementSides: ["top", "left"],
        grommets: { sides: ["bottom"], spacing: 40, offsetStart: 5 },
      },
      "preset",
    );
    expect(selection.reinforcementSides).toEqual(["top", "left"]);
    expect(selection.grommets?.sides).toEqual(["bottom"]);
    expect(selection.grommets?.spacing).toBe(40);
    expect(selection.grommets?.offsetStart).toBe(5);
    expect(selection.grommets?.offsetEnd).toBe(0);
    expect(hasAnyGrommets(selection)).toBe(true);
  });

  it("allows reinforcement and grommets to coexist on the same side", () => {
    let selection = createEmptyAdvancedSelection();
    selection = toggleFinishingSide(selection, "reinforcement", "top");
    selection = toggleFinishingSide(selection, "grommets", "top");
    expect(selection.reinforcementSides).toContain("top");
    expect(selection.grommets?.sides).toContain("top");
  });

  it("tunnel on a side excludes reinforcement and grommets on that side", () => {
    let selection = createSelectionFromPreset(
      {
        reinforcementSides: ["top"],
        grommets: { sides: ["top"], spacing: 50 },
      },
      "preset",
    );
    selection = toggleFinishingSide(selection, "tunnel", "top");
    expect(selection.tunnelSides).toEqual(["top"]);
    expect(selection.reinforcementSides).not.toContain("top");
    expect(selection.grommets?.sides).not.toContain("top");
  });

  it("enabling reinforcement/grommets on a tunnel side removes tunnel", () => {
    let selection = createEmptyAdvancedSelection();
    selection = toggleFinishingSide(selection, "tunnel", "right");
    selection = toggleFinishingSide(selection, "reinforcement", "right");
    expect(selection.tunnelSides).not.toContain("right");
    expect(selection.reinforcementSides).toContain("right");
  });

  it("toggling an already-on side turns it off", () => {
    let selection = createEmptyAdvancedSelection();
    selection = toggleFinishingSide(selection, "reinforcement", "bottom");
    expect(selection.reinforcementSides).toContain("bottom");
    selection = toggleFinishingSide(selection, "reinforcement", "bottom");
    expect(selection.reinforcementSides).not.toContain("bottom");
  });

  it("updates grommets spacing", () => {
    const base = createEmptyAdvancedSelection();
    const updated = updateGrommets(base, { spacing: 60, offsetEnd: 4 });
    expect(updated.grommets?.spacing).toBe(60);
    expect(updated.grommets?.offsetEnd).toBe(4);
  });

  it("cut to size removes reinforcement and tunnel but keeps grommets", () => {
    const selection = setCutToSize(
      createSelectionFromPreset({
        reinforcementSides: ["top"],
        tunnelSides: ["right"],
        grommets: { sides: ["bottom"], spacing: 50, offsetStart: 4 },
      }),
      true,
    );

    expect(selection.cutToSize).toBe(true);
    expect(selection.reinforcementSides).toEqual([]);
    expect(selection.tunnelSides).toEqual([]);
    expect(selection.grommets?.sides).toEqual(["bottom"]);
  });

  it("turns off cut to size when reinforcement or tunnel is selected", () => {
    let selection = setCutToSize(createEmptyAdvancedSelection(), true);

    selection = toggleFinishingSide(selection, "reinforcement", "left");
    expect(selection.cutToSize).toBe(false);
    expect(selection.reinforcementSides).toContain("left");

    selection = setCutToSize(createEmptyAdvancedSelection(), true);
    selection = toggleFinishingSide(selection, "tunnel", "top");
    expect(selection.cutToSize).toBe(false);
    expect(selection.tunnelSides).toContain("top");
  });

  it("migrates legacy sides Record into new shape", () => {
    const legacy = {
      preset: "x",
      sides: {
        top: AdvancedEdgeFinishing.REINFORCEMENT,
        right: AdvancedEdgeFinishing.TUNNEL,
        bottom: AdvancedEdgeFinishing.GROMMETS,
        left: AdvancedEdgeFinishing.NONE,
      },
      grommets: { sides: [], spacing: 50 },
    };
    const normalized = normalizeAdvancedSelection(
      legacy as unknown as Parameters<typeof normalizeAdvancedSelection>[0],
    );
    expect(normalized.reinforcementSides).toEqual(["top"]);
    expect(normalized.tunnelSides).toEqual(["right"]);
    expect(normalized.grommets?.sides).toEqual(["bottom"]);
  });
});
